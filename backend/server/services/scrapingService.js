/**
 * Scraping Service
 * OpenClaw is the sole lead discovery source. It browses and returns leads with
 * company, person, email, phone, website, location, channel, and intent.
 *
 * Playwright is used as an enrichment step: if OpenClaw returns a lead with a
 * website but is missing contact details, we scrape that site to fill the gaps.
 *
 * Future phases (not active):
 *   - SerpAPI discovery  → searchCompaniesWithSerpApi()
 *   - DuckDuckGo fallback → searchCompaniesWithDuckDuckGo()
 */

const { chromium } = require('playwright');
const { db } = require('../config/firebase');
const { findLeadsWithOpenClaw } = require('./openClawService');

const MAX_LEADS = 5;

// ---------------------------------------------------------------------------
// Get previously found companies for a product
// ---------------------------------------------------------------------------

async function getPreviouslyFoundCompanies(productInfoId) {
  try {
    const snapshot = await db
      .collection('leads')
      .where('productInfoId', '==', productInfoId || 'current')
      .get();

    return snapshot.docs
      .map((doc) => doc.data().company || '')
      .filter(Boolean)
      .map((name) => name.toLowerCase());
  } catch (error) {
    console.error('Error fetching previously found companies:', error.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dedupeByWebsite = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = (item.website || item.url || item.companyName || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const detectPreferredChannel = ({ emails = [], phones = [], whatsappLinks = [] }) => {
  if (whatsappLinks.length > 0) return 'Whatsapp';
  if (emails.length > 0) return 'Email';
  if (phones.length > 0) return 'Phone';
  return 'Email';
};

// ---------------------------------------------------------------------------
// Playwright website enrichment
// ---------------------------------------------------------------------------

async function extractPageContacts(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    return await page.evaluate(() => {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const phoneRegex = /(?:\+?\d[\d\s().-]{7,}\d)/g;
      const text = document.body?.innerText || '';

      const mailtoEmails = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
        .map((node) => node.getAttribute('href')?.replace('mailto:', '').split('?')[0] || '')
        .filter(Boolean);
      const telPhones = Array.from(document.querySelectorAll('a[href^="tel:"]'))
        .map((node) => node.getAttribute('href')?.replace('tel:', '') || '')
        .filter(Boolean);
      const whatsappLinks = Array.from(document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]'))
        .map((node) => node.getAttribute('href') || '')
        .filter(Boolean);
      const socialLinks = Array.from(
        document.querySelectorAll('a[href*="linkedin"], a[href*="facebook"], a[href*="instagram"], a[href*="twitter"], a[href*="t.me"]')
      )
        .map((node) => node.getAttribute('href') || '')
        .filter(Boolean);

      const textEmails = text.match(emailRegex) || [];
      const textPhones = text.match(phoneRegex) || [];

      return {
        emails: [...new Set([...mailtoEmails, ...textEmails])].slice(0, 5),
        phones: [...new Set([...telPhones, ...textPhones])].slice(0, 5),
        whatsappLinks: [...new Set(whatsappLinks)].slice(0, 3),
        socialLinks: [...new Set(socialLinks)].slice(0, 5),
      };
    });
  } catch (error) {
    console.error(`Failed scraping ${url}:`, error.message);
    return { emails: [], phones: [], whatsappLinks: [], socialLinks: [] };
  }
}

async function scrapeCompanyWebsite(url) {
  let browser = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    const base = new URL(url).origin;
    const candidatePages = [url, `${base}/contact`, `${base}/contact-us`, `${base}/about`, `${base}/about-us`];
    const contacts = { emails: [], phones: [], whatsappLinks: [], socialLinks: [] };

    for (const pageUrl of [...new Set(candidatePages)]) {
      const pageContacts = await extractPageContacts(page, pageUrl);
      contacts.emails.push(...pageContacts.emails);
      contacts.phones.push(...pageContacts.phones);
      contacts.whatsappLinks.push(...pageContacts.whatsappLinks);
      contacts.socialLinks.push(...pageContacts.socialLinks);
    }

    return {
      emails: [...new Set(contacts.emails)].slice(0, 5),
      phones: [...new Set(contacts.phones)].slice(0, 5),
      whatsappLinks: [...new Set(contacts.whatsappLinks)].slice(0, 3),
      socialLinks: [...new Set(contacts.socialLinks)].slice(0, 5),
    };
  } catch (error) {
    console.error(`Website scraping failed for ${url}:`, error.message);
    return { emails: [], phones: [], whatsappLinks: [], socialLinks: [] };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Firestore upsert
// ---------------------------------------------------------------------------

async function upsertLead(lead) {
  const leadsRef = db.collection('leads');
  const lookupValue = lead.website || lead.email || lead.phone || lead.company;

  if (!lookupValue) return null;

  const snapshot = await leadsRef
    .where('lookupKey', '==', `${lead.productInfoId || 'current'}::${lookupValue}`)
    .limit(1)
    .get();

  const payload = {
    ...lead,
    lookupKey: `${lead.productInfoId || 'current'}::${lookupValue}`,
    updatedAt: new Date(),
  };

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    await doc.ref.set(payload, { merge: true });
    return { id: doc.id, ...payload };
  }

  const docRef = await leadsRef.add({ ...payload, createdAt: new Date() });
  return { id: docRef.id, ...payload, createdAt: new Date() };
}

// ---------------------------------------------------------------------------
// Main lead finding pipeline
// ---------------------------------------------------------------------------

async function findLeadsFromProductInfo(productInfo) {
  // Step 0: Get previously found companies to exclude from new search
  const previousCompanies = await getPreviouslyFoundCompanies(productInfo.id || 'current');

  // Step 1: OpenClaw finds leads (company, person, email, phone, website, etc.)
  const openClawLeads = await findLeadsWithOpenClaw(productInfo);

  // Step 1.5: Filter out any leads that were already found (dedupe)
  const previousCompaniesLower = new Set(previousCompanies);
  const newLeads = openClawLeads.filter((lead) => {
    const companyNameLower = (lead.companyName || lead.company || '').toLowerCase();
    return !previousCompaniesLower.has(companyNameLower);
  });

  const candidates = dedupeByWebsite(
    newLeads.map((lead) => ({
      companyName: lead.companyName || lead.company || '',
      website: lead.website || lead.url || '',
      snippet: lead.notes || lead.intent || '',
      source: 'openclaw',
      location: lead.location || productInfo.location || '',
      email: lead.email || '',
      phone: lead.phone || '',
      contactName: lead.contactName || lead.person || '',
      channel: lead.channel || '',
    }))
  ).slice(0, MAX_LEADS);

  const discoveredLeads = [];

  for (const candidate of candidates) {
    if (discoveredLeads.length >= MAX_LEADS) break;

    // Step 2: Enrich with Playwright only when contact info is incomplete
    const missingContact = !candidate.email && !candidate.phone;
    const scraped =
      candidate.website && missingContact
        ? await scrapeCompanyWebsite(candidate.website)
        : { emails: [], phones: [], whatsappLinks: [], socialLinks: [] };

    const emails = [...new Set([candidate.email, ...scraped.emails].filter(Boolean))];
    const phones = [...new Set([candidate.phone, ...scraped.phones].filter(Boolean))];
    const whatsappLinks = scraped.whatsappLinks || [];
    const channel = candidate.channel || detectPreferredChannel({ emails, phones, whatsappLinks });
    const primaryEmail = emails[0] || '';
    const primaryPhone = phones[0] || '';

    if (!primaryEmail && !primaryPhone && whatsappLinks.length === 0) {
      console.log(`Skipping "${candidate.companyName}" — no contact info found.`);
      continue;
    }

    const savedLead = await upsertLead({
      company: candidate.companyName || 'Unknown Company',
      person: candidate.contactName || '',
      email: primaryEmail,
      phone: primaryPhone,
      website: candidate.website || '',
      location: candidate.location || productInfo.location || '',
      temp: 'Neutral',
      status: 'new',
      intent:
        candidate.snippet ||
        `Matched ${productInfo.targetCustomer || 'target customer'} in ${productInfo.location || 'target location'}`,
      next: 'Follow Up',
      channel,
      productInfoId: productInfo.id || 'current',
    });

    if (savedLead) discoveredLeads.push(savedLead);
  }

  return discoveredLeads.slice(0, MAX_LEADS);
}

// ---------------------------------------------------------------------------
// Future phase — not currently active
// ---------------------------------------------------------------------------

// searchCompaniesWithSerpApi   — paid API, held for future phase
// searchCompaniesWithDuckDuckGo — free fallback, held for future phase

module.exports = {
  scrapeCompanyWebsite,
  findLeadsFromProductInfo,
};
