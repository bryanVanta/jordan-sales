/**
 * Scraping Service
 * Uses Product-Info context to discover and scrape lead contact details.
 */

const axios = require('axios');
const { chromium } = require('playwright');
const { db } = require('../config/firebase');
const { findLeadsWithOpenClaw } = require('./openClawService');

const SERPAPI_KEY = process.env.SERPAPI_API_KEY;
const MAX_LEADS = 5;

const getSearchQueries = (productInfo = {}) => {
  const target = productInfo.targetCustomer || '';
  const location = productInfo.location || '';
  const productType = productInfo.productType || '';
  const productName = productInfo.productName || '';
  const description = productInfo.description || '';
  const keyBenefit = productInfo.keyBenefit || '';

  return [
    `${target} ${location}`.trim(),
    `${target} ${productType} ${location}`.trim(),
    `${target} company ${location}`.trim(),
    `${target} official website ${location}`.trim(),
    `${target} ${location} contact`.trim(),
    `${productName} ideal customer ${target} ${location}`.trim(),
    `${target} ${description} ${location}`.trim(),
    `${target} ${keyBenefit} ${location}`.trim(),
  ].filter(Boolean);
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

async function searchCompaniesWithSerpApi(productInfo) {
  if (!SERPAPI_KEY) {
    console.log('SERPAPI_API_KEY not configured, skipping SerpApi discovery.');
    return [];
  }

  const queries = getSearchQueries(productInfo);
  const matches = [];

  for (const query of queries.slice(0, 6)) {
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          q: query,
          type: 'search',
          api_key: SERPAPI_KEY,
          num: 5,
        },
        timeout: 20000,
      });

      const organicResults = response.data?.organic_results || [];
      organicResults.forEach((result) => {
        if (!result.link) return;
        matches.push({
          companyName: result.title || new URL(result.link).hostname.replace(/^www\./, ''),
          website: result.link,
          snippet: result.snippet || '',
          source: 'serpapi',
          location: productInfo.location || '',
        });
      });
    } catch (error) {
      console.error(`SerpApi query failed for "${query}":`, error.response?.data || error.message);
    }
  }

  return dedupeByWebsite(matches).slice(0, MAX_LEADS);
}

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
      const socialLinks = Array.from(document.querySelectorAll('a[href*="linkedin"], a[href*="facebook"], a[href*="instagram"], a[href*="twitter"], a[href*="t.me"]'))
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
    return {
      emails: [],
      phones: [],
      whatsappLinks: [],
      socialLinks: [],
    };
  }
}

async function scrapeCompanyWebsite(url) {
  let browser = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    const base = new URL(url).origin;
    const candidatePages = [url, `${base}/contact`, `${base}/contact-us`, `${base}/about`, `${base}/about-us`];
    const contacts = {
      emails: [],
      phones: [],
      whatsappLinks: [],
      socialLinks: [],
    };

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
    return {
      emails: [],
      phones: [],
      whatsappLinks: [],
      socialLinks: [],
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

const detectPreferredChannel = ({ emails = [], phones = [], whatsappLinks = [] }) => {
  if (whatsappLinks.length > 0) return 'Whatsapp';
  if (emails.length > 0) return 'Email';
  if (phones.length > 0) return 'Phone';
  return 'Email';
};

async function upsertLead(lead) {
  const leadsRef = db.collection('leads');
  const lookupValue = lead.website || lead.email || lead.phone || lead.company;

  if (!lookupValue) {
    return null;
  }

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

  const docRef = await leadsRef.add({
    ...payload,
    createdAt: new Date(),
  });

  return { id: docRef.id, ...payload, createdAt: new Date() };
}

async function findLeadsFromProductInfo(productInfo) {
  const openClawLeads = await findLeadsWithOpenClaw(productInfo);
  const serpResults = await searchCompaniesWithSerpApi(productInfo);
  const candidates = dedupeByWebsite([
    ...openClawLeads.map((lead) => ({
      companyName: lead.companyName || lead.company || '',
      website: lead.website || lead.url || '',
      snippet: lead.notes || '',
      source: 'openclaw',
      location: lead.location || productInfo.location || '',
      email: lead.email || '',
      phone: lead.phone || '',
      contactName: lead.contactName || '',
      channel: lead.channel || '',
    })),
    ...serpResults,
  ]).slice(0, MAX_LEADS);

  const discoveredLeads = [];

  for (const candidate of candidates) {
    if (discoveredLeads.length >= MAX_LEADS) {
      break;
    }

    const scraped = candidate.website ? await scrapeCompanyWebsite(candidate.website) : {
      emails: [],
      phones: [],
      whatsappLinks: [],
      socialLinks: [],
    };

    const emails = [...new Set([candidate.email, ...scraped.emails].filter(Boolean))];
    const phones = [...new Set([candidate.phone, ...scraped.phones].filter(Boolean))];
    const whatsappLinks = scraped.whatsappLinks || [];
    const channel = candidate.channel || detectPreferredChannel({ emails, phones, whatsappLinks });
    const primaryEmail = emails[0] || '';
    const phoneFallback = phones[0] || '';

    if (!primaryEmail && !phoneFallback && whatsappLinks.length === 0) {
      continue;
    }

    const savedLead = await upsertLead({
      company: candidate.companyName || 'Unknown Company',
      person: candidate.contactName || '',
      email: primaryEmail || phoneFallback,
      location: candidate.location || productInfo.location || '',
      temp: 'Neutral',
      status: 'new',
      intent: candidate.snippet || `Matched ${productInfo.targetCustomer || 'target customer'} in ${productInfo.location || 'target location'}`,
      next: 'Follow Up',
      channel,
      lookupSource: candidate.website || candidate.companyName || candidate.email || candidate.phone || '',
      productInfoId: productInfo.id || 'current'
    });

    if (savedLead) {
      discoveredLeads.push(savedLead);
    }
  }

  return discoveredLeads.slice(0, MAX_LEADS);
}

module.exports = {
  searchCompaniesWithSerpApi,
  scrapeCompanyWebsite,
  findLeadsFromProductInfo,
};
