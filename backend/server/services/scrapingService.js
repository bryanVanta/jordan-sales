/**
 * Scraping Service
 *
 * Lead discovery pipeline — no external APIs required:
 *   1. Build search queries from productInfo (targetCustomer + location)
 *   2. Search DuckDuckGo via Playwright → collect company website URLs
 *   3. Scrape each website for contact details (email, phone, WhatsApp)
 *   4. Upsert structured lead records into Firestore
 *
 * Future phases (not active):
 *   - SerpAPI paid search  → searchCompaniesWithSerpApi()
 *   - OpenClaw AI agent    → openClawService.js
 */

const { chromium } = require('playwright');
const { db } = require('../config/firebase');

const MAX_LEADS = 5;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Aggregator / directory sites that won't be direct hotel leads
const SKIP_DOMAINS = new Set([
  'booking.com', 'tripadvisor.com', 'agoda.com', 'expedia.com',
  'hotels.com', 'airbnb.com', 'traveloka.com', 'klook.com',
  'google.com', 'wikipedia.org', 'youtube.com',
  'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com',
  'indeed.com', 'glassdoor.com', 'yelp.com',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isLeadCandidate = (url) => {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return !Array.from(SKIP_DOMAINS).some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

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

// Build search queries from the product info's targetCustomer + location.
// targetCustomer may be a comma-separated list; we query each type separately.
const buildSearchQueries = (productInfo = {}) => {
  const location = productInfo.location || '';
  const targets = (productInfo.targetCustomer || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3);

  const queries = [];
  for (const target of targets) {
    queries.push(`${target} ${location}`.trim());
    queries.push(`${target} ${location} contact email`.trim());
  }
  if (targets[0]) {
    queries.push(`${targets[0]} ${location} official website`.trim());
  }
  return [...new Set(queries)].filter(Boolean).slice(0, 6);
};

// ---------------------------------------------------------------------------
// Step 1 — Search DuckDuckGo for matching company websites
// ---------------------------------------------------------------------------

async function searchForCandidates(productInfo, page) {
  const queries = buildSearchQueries(productInfo);
  const results = [];
  const intentPrefix = `Matches: ${(productInfo.targetCustomer || '').split(',')[0]?.trim()} in ${productInfo.location || ''}`;

  for (const query of queries) {
    if (results.length >= MAX_LEADS * 2) break;

    try {
      await page.goto(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });

      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a.result-link')).slice(0, 8).map((a) => ({
          title: a.textContent?.trim() || '',
          href: a.getAttribute('href') || '',
        }))
      );

      for (const link of links) {
        try {
          const urlMatch = link.href.match(/uddg=([^&]+)/);
          if (!urlMatch) continue;
          const website = decodeURIComponent(urlMatch[1]);
          if (!website.startsWith('http') || !isLeadCandidate(website)) continue;
          results.push({
            companyName: link.title || new URL(website).hostname.replace(/^www\./, ''),
            website,
            location: productInfo.location || '',
            intent: intentPrefix,
          });
        } catch {
          // skip malformed URLs
        }
      }
    } catch (err) {
      console.error(`DuckDuckGo search failed for "${query}":`, err.message);
    }
  }

  return dedupeByWebsite(results).slice(0, MAX_LEADS * 2);
}

// ---------------------------------------------------------------------------
// Step 2 — Scrape a company website for contact details
// ---------------------------------------------------------------------------

async function extractPageContacts(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    return await page.evaluate(() => {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const phoneRegex = /(?:\+?\d[\d\s().-]{7,}\d)/g;
      const text = document.body?.innerText || '';

      const mailtoEmails = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
        .map((n) => n.getAttribute('href')?.replace('mailto:', '').split('?')[0] || '')
        .filter(Boolean);
      const telPhones = Array.from(document.querySelectorAll('a[href^="tel:"]'))
        .map((n) => n.getAttribute('href')?.replace('tel:', '') || '')
        .filter(Boolean);
      const whatsappLinks = Array.from(document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]'))
        .map((n) => n.getAttribute('href') || '')
        .filter(Boolean);

      return {
        emails: [...new Set([...mailtoEmails, ...(text.match(emailRegex) || [])])].slice(0, 5),
        phones: [...new Set([...telPhones, ...(text.match(phoneRegex) || [])])].slice(0, 5),
        whatsappLinks: [...new Set(whatsappLinks)].slice(0, 3),
      };
    });
  } catch {
    return { emails: [], phones: [], whatsappLinks: [] };
  }
}

async function scrapeWebsite(page, url) {
  try {
    const base = new URL(url).origin;
    const pagesToCheck = [...new Set([url, `${base}/contact`, `${base}/contact-us`])];
    const contacts = { emails: [], phones: [], whatsappLinks: [] };

    for (const pageUrl of pagesToCheck) {
      const found = await extractPageContacts(page, pageUrl);
      contacts.emails.push(...found.emails);
      contacts.phones.push(...found.phones);
      contacts.whatsappLinks.push(...found.whatsappLinks);
      // Stop early if we already have an email or WhatsApp
      if (contacts.emails.length > 0 || contacts.whatsappLinks.length > 0) break;
    }

    return {
      emails: [...new Set(contacts.emails)].slice(0, 3),
      phones: [...new Set(contacts.phones)].slice(0, 3),
      whatsappLinks: [...new Set(contacts.whatsappLinks)].slice(0, 2),
    };
  } catch (err) {
    console.error(`Scrape failed for ${url}:`, err.message);
    return { emails: [], phones: [], whatsappLinks: [] };
  }
}

// ---------------------------------------------------------------------------
// Firestore upsert
// ---------------------------------------------------------------------------

async function upsertLead(lead) {
  const leadsRef = db.collection('leads');
  const lookupValue = lead.website || lead.email || lead.phone || lead.company;
  if (!lookupValue) return null;

  const lookupKey = `${lead.productInfoId || 'current'}::${lookupValue}`;
  const snapshot = await leadsRef.where('lookupKey', '==', lookupKey).limit(1).get();

  const payload = { ...lead, lookupKey, updatedAt: new Date() };

  if (!snapshot.empty) {
    await snapshot.docs[0].ref.set(payload, { merge: true });
    return { id: snapshot.docs[0].id, ...payload };
  }

  const docRef = await leadsRef.add({ ...payload, createdAt: new Date() });
  return { id: docRef.id, ...payload, createdAt: new Date() };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function findLeadsFromProductInfo(productInfo) {
  console.log(`\n🔍 Finding leads for: ${productInfo.productName} | Target: ${productInfo.targetCustomer} | Location: ${productInfo.location}`);

  let browser = null;
  const discoveredLeads = [];

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ userAgent: USER_AGENT });

    // Step 1: search for candidate websites
    const candidates = await searchForCandidates(productInfo, page);
    console.log(`   Found ${candidates.length} candidate sites to scrape.`);

    // Step 2: scrape each site for contact info
    for (const candidate of candidates) {
      if (discoveredLeads.length >= MAX_LEADS) break;

      console.log(`   Scraping: ${candidate.website}`);
      const scraped = await scrapeWebsite(page, candidate.website);

      const emails = scraped.emails;
      const phones = scraped.phones;
      const whatsappLinks = scraped.whatsappLinks;

      if (!emails[0] && !phones[0] && whatsappLinks.length === 0) {
        console.log(`   ↳ No contact info — skipping.`);
        continue;
      }

      const channel = detectPreferredChannel({ emails, phones, whatsappLinks });
      // Warm if WhatsApp found (small business signal), Neutral otherwise
      const temp = whatsappLinks.length > 0 ? 'Warm' : 'Neutral';

      const savedLead = await upsertLead({
        company: candidate.companyName || 'Unknown Company',
        person: '',
        email: emails[0] || '',
        phone: phones[0] || '',
        website: candidate.website || '',
        location: candidate.location || productInfo.location || '',
        temp,
        status: 'new',
        intent: candidate.intent || `Matched ${(productInfo.targetCustomer || '').split(',')[0]?.trim()} in ${productInfo.location}`,
        next: 'Follow Up',
        channel,
        productInfoId: productInfo.id || 'current',
      });

      if (savedLead) {
        discoveredLeads.push(savedLead);
        console.log(`   ✓ Lead saved: ${candidate.companyName} (${channel})`);
      }
    }
  } catch (err) {
    console.error('Lead finding pipeline error:', err.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  console.log(`   Done — ${discoveredLeads.length} lead(s) found.\n`);
  return discoveredLeads.slice(0, MAX_LEADS);
}

// ---------------------------------------------------------------------------
// Exported for direct use and future testing
// ---------------------------------------------------------------------------

module.exports = {
  findLeadsFromProductInfo,
  scrapeWebsite,
};
