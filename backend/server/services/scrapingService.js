/**
 * Scraping Service
 * Lead enrichment pipeline:
 * 1. OpenClaw finds leads
 * 2. If missing contact: Try website scraping
 * 3. If still missing: Use SerpAPI to search for "Company contact"
 * 4. Scrape top search results with Playwright
 * 5. Extract email/phone from search results
 */

const { chromium } = require('playwright');
const axios = require('axios');
const { db } = require('../config/firebase');
const { findLeadsWithOpenClaw } = require('./openClawService');

const MAX_LEADS = 10;
const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

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

const extractCompanyChain = (companyName = '') => {
  // Extract parent company name from chain variations
  // e.g., "Hotel 99 Sri Petaling @ Bukit Jalil KL" -> "Hotel 99"
  // "Ceria Hotel Bukit Bintang" -> "Ceria Hotel"
  const baseMatch = companyName.match(/^([A-Za-z0-9\s&]+?)(?:\s+@|\s+[-–]|$)/);
  return (baseMatch ? baseMatch[1] : companyName).trim().toLowerCase();
};

const dedupeByCompanyChain = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const chainKey = extractCompanyChain(item.companyName || item.company || '');
    if (!chainKey || seen.has(chainKey)) return false;
    seen.add(chainKey);
    return true;
  });
};

const extractWhatsAppNumber = (whatsappLink = '') => {
  // Extract phone number from wa.me link: https://wa.me/1234567890
  const match = whatsappLink.match(/wa\.me\/(\d+)/);
  if (match) return match[1];
  
  // Extract from direct WhatsApp URL
  const match2 = whatsappLink.match(/phone[=\/](\d+)/);
  if (match2) return match2[1];
  
  return '';
};

const detectPreferredChannel = ({ emails = [], phones = [], whatsapp = '' }) => {
  if (whatsapp) return 'Whatsapp';
  if (emails.length > 0) return 'Email';
  if (phones.length > 0) return 'Phone';
  return 'Email';
};

// Validate phone number format (Malaysian +60/0xx, US +1, etc)
const isValidPhoneNumber = (phone) => {
  if (!phone) return false;
  
  const digitsOnly = phone.replace(/\D/g, '');
  
  // Must have 8-15 digits
  if (digitsOnly.length < 8 || digitsOnly.length > 15) return false;
  
  // Must START with valid country/area code (REQUIRED, not optional)
  // Malaysia: 60xx or 0x, US: 1xxx
  const startPattern = /^(60|0[0-9]|1[0-9])/.test(digitsOnly);
  if (!startPattern) return false;
  
  // Reject if starts with 20-29 AFTER country/area processing
  if (digitsOnly.startsWith('20') || digitsOnly.startsWith('21') || digitsOnly.startsWith('22') || 
      digitsOnly.startsWith('23') || digitsOnly.startsWith('24') || digitsOnly.startsWith('25') ||
      digitsOnly.startsWith('26') || digitsOnly.startsWith('27') || digitsOnly.startsWith('28') || digitsOnly.startsWith('29')) {
    return false;
  }
  
  // Reject if all same digit (111111, 000000, etc)
  if (/^(\d)\1{5,}$/.test(digitsOnly)) return false;
  
  // Reject if looks like sequential numbers (123456, 987654, etc)
  if (/^(01234|12345|23456|34567|45678|56789|67890|98765|87654|76543)/.test(digitsOnly)) return false;
  
  return true;
};

// ---------------------------------------------------------------------------
// Playwright website enrichment
// ---------------------------------------------------------------------------

async function extractPageContacts(page, url, companyName = '', location = '') {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    return await page.evaluate(({ companyName, location }) => {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      // Better phone regex: +60102222222, 0102222222, (601) 222-2222, +1-234-567-8900, etc.
      // Avoids matching dates like 2025-04-01
      const phoneRegex = /(?:\+?6?0\d{1,2}[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}|(?:\+?1)?[\s.-]?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/g;
      const dateRegex = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/;
      const text = document.body?.innerText || '';

      // Filter out generic/auto-reply emails (lower priority)
      const genericEmailPatterns = /^(noreply|no-reply|donotreply|no\.reply|notifications|alerts|support|info|service|contact|help|feedback|automat|bot|admin|system|bounce|postmaster|mailer|root|www-data)@/i;

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

      // Prioritize non-generic emails
      const allEmails = [...new Set([...mailtoEmails, ...textEmails])];
      
      // Score emails: prefer those containing property/reservation/location keywords
      const emailScore = (email) => {
        let score = 0;
        if (genericEmailPatterns.test(email)) score -= 100;
        if (email.includes('reservations') || email.includes('booking') || email.includes('reserve')) score += 50;
        if (email.includes('hotel') || email.includes('property')) score += 30;
        if (companyName && email.includes(companyName.split(' ')[0].toLowerCase())) score += 20;
        return score;
      };
      
      const scoredEmails = allEmails.map(email => ({ email, score: emailScore(email) }));
      const sortedEmails = scoredEmails.sort((a, b) => b.score - a.score).map(e => e.email).slice(0, 5);

      // Deduplicate and clean phone numbers, reject dates
      const uniquePhones = [...new Set([...telPhones, ...textPhones])];
      
      // Remove duplicates with different formatting and filter out date patterns
      const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
      const cleanPhones = uniquePhones.filter((phone, idx, arr) => {
        // Skip if it's just a date
        if (dateOnlyRegex.test(phone)) return false;
        // Skip if contains mostly letters (like month names "April-01")
        if (/[A-Za-z]{3,}/.test(phone)) return false;
        
        const normalized = phone.replace(/\D/g, '');
        // Must have at least 8 digits to be a valid phone
        if (normalized.length < 8) return false;
        
        return idx === arr.findIndex(p => {
          if (dateOnlyRegex.test(p) || /[A-Za-z]{3,}/.test(p)) return false;
          return p.replace(/\D/g, '') === normalized;
        });
      }).slice(0, 5);

      return {
        emails: sortedEmails,
        phones: cleanPhones,
        whatsappLinks: [...new Set(whatsappLinks)].slice(0, 3),
        socialLinks: [...new Set(socialLinks)].slice(0, 5),
      };
    }, { companyName, location });
  } catch (error) {
    console.error(`Failed scraping ${url}:`, error.message);
    return { emails: [], phones: [], whatsappLinks: [], socialLinks: [] };
  }
}

async function scrapeCompanyWebsite(url, companyName = '', location = '') {
  let browser = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    const base = new URL(url).origin;
    
    // Enhanced candidate pages: add more specific locations and reservation/contact paths
    const candidatePages = [
      url,
      `${base}/contact`,
      `${base}/contact-us`,
      `${base}/about`,
      `${base}/about-us`,
      `${base}/locations`,
      `${base}/location`,
      `${base}/properties`,
      `${base}/reservations`,
      `${base}/booking`,
      `${base}/reserve`,
    ];
    
    const contacts = { emails: [], phones: [], whatsappLinks: [], socialLinks: [] };

    for (const pageUrl of [...new Set(candidatePages)]) {
      try {
        const pageContacts = await extractPageContacts(page, pageUrl, companyName, location);
        contacts.emails.push(...pageContacts.emails);
        contacts.phones.push(...pageContacts.phones);
        contacts.whatsappLinks.push(...pageContacts.whatsappLinks);
        contacts.socialLinks.push(...pageContacts.socialLinks);
      } catch (e) {
        // Skip pages that fail to load
        continue;
      }
    }

    return {
      emails: [...new Set(contacts.emails)].slice(0, 5),
      phones: [...new Set(contacts.phones)].filter(phone => isValidPhoneNumber(phone)).slice(0, 5),
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
// SerpAPI search + Playwright scraping fallback
// ---------------------------------------------------------------------------

async function searchContactInfoViaSerpAPI(companyName, location) {
  if (!SERPAPI_API_KEY) {
    console.log(`[SerpAPI] API key not configured, skipping search for "${companyName}"`);
    return { phones: [], emails: [] };
  }

  try {
    // Use location + company name to be specific (helps distinguish Hotel Sentral Brickfields from others)
    const searchQuery = `${companyName} ${location} contact phone`;
    
    console.log(`[SerpAPI] Searching for: "${searchQuery}"`);

    // Use SerpAPI to get search results
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        q: searchQuery,
        api_key: SERPAPI_API_KEY,
        engine: 'google',
        num: 10, // Get more results to filter through
      },
      timeout: 10000,
    });

    const results = response.data?.organic_results || [];
    if (results.length === 0) {
      console.log(`[SerpAPI] No results found for "${companyName}"`);
      return { phones: [], emails: [] };
    }

    console.log(`[SerpAPI] Found ${results.length} search results, scraping top 5...`);

    // Scrape top 5 result URLs, score by location match
    const phoneRegex = /(?:\+?6?0\d{1,2}[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9}|(?:\+?1)?[\s.-]?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4})/g;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const dateRegex = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/;

    const allPhones = [];
    const allEmails = [];
    
    // Extract specific location keywords (postal codes, street names, districts are most specific)
    // E.g., "Kuala Lumpur, Malaysia" → ["Kuala", "Lumpur", "Malaysia"]
    // Also add postal code if present (e.g., "50470")
    const locationKeywords = location.toLowerCase()
      .split(/[\s,]/)
      .filter(kw => kw.length > 3 || /^\d{5}/.test(kw)); // Keep district names and postal codes

    let browser = null;
    try {
      browser = await chromium.launch({ headless: true });

      for (let i = 0; i < Math.min(5, results.length); i++) {
        const url = results[i].link;
        const snippet = results[i].snippet || '';
        if (!url) continue;

        try {
          console.log(`[SerpAPI] Scraping result #${i + 1}: ${url}`);
          
          // Check if snippet or URL contains specific location keywords (postal code > street > city)
          const urlLower = url.toLowerCase();
          const snippetLower = snippet.toLowerCase();
          const hasSpecificLocationMatch = locationKeywords.some(kw => 
            urlLower.includes(kw) || snippetLower.includes(kw)
          );
          
          // Prefer results with official domains (company name in domain)
          const companyNameInDomain = urlLower.includes(companyName.replace(/\s+/g, '').toLowerCase());
          
          const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          });

          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(600);

          const contacts = await page.evaluate(() => {
            const allText = document.body?.innerText || '';
            return { text: allText };
          });

          // Extract emails
          const pageEmails = (contacts.text.match(emailRegex) || [])
            .filter(e => !e.includes('google') && !e.includes('serpapi'))
            .slice(0, 3);
          
          // Extract phones with strict validation
          const pagePhones = (contacts.text.match(phoneRegex) || [])
            .filter(p => isValidPhoneNumber(p))
            .slice(0, 2);

          // Only add if:
          // 1. Has specific location match (postal code/street/district in URL/snippet), OR
          // 2. Company name in domain (official website), OR
          // 3. Top 2 results (high confidence from Google)
          if (hasSpecificLocationMatch || companyNameInDomain || i < 2) {
            allEmails.push(...pageEmails);
            allPhones.push(...pagePhones);
            console.log(`[SerpAPI] Result #${i + 1}: Found ${pagePhones.length} phone(s), ${pageEmails.length} email(s) (location match: ${hasSpecificLocationMatch}, domain match: ${companyNameInDomain})`);
          } else {
            console.log(`[SerpAPI] Result #${i + 1}: Skipped (no location/domain match)`);
          }

          await page.close().catch(() => {});

        } catch (pageError) {
          console.log(`[SerpAPI] Failed to scrape result #${i + 1}:`, pageError.message);
          continue;
        }
      }
    } finally {
      if (browser) await browser.close().catch(() => {});
    }

    const uniquePhones = [...new Set(allPhones.map(p => p.trim()))].filter(p => p.length > 0);
    const uniqueEmails = [...new Set(allEmails.map(e => e.toLowerCase().trim()))].filter(e => e.length > 0);

    console.log(`[SerpAPI] Extracted ${uniquePhones.length} phone(s) and ${uniqueEmails.length} email(s)`);
    return { phones: uniquePhones, emails: uniqueEmails };

  } catch (error) {
    console.error(`[SerpAPI] Search failed for "${companyName}":`, error.message);
    return { phones: [], emails: [] };
  }
}

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

  const candidates = dedupeByCompanyChain(
    dedupeByWebsite(
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
    )
  ).slice(0, MAX_LEADS);

  const discoveredLeads = [];

  for (const candidate of candidates) {
    if (discoveredLeads.length >= MAX_LEADS) break;

    // Step 2: Enrich with Playwright only when contact info is incomplete
    const missingContact = !candidate.email && !candidate.phone;
    let scraped = { emails: [], phones: [], whatsappLinks: [], socialLinks: [] };
    
    if (candidate.website && missingContact) {
      scraped = await scrapeCompanyWebsite(candidate.website, candidate.companyName, candidate.location);
    }
    
    // Step 2.5: If still no contact found, try SerpAPI + Playwright fallback
    let searchResults = { phones: [], emails: [] };
    if (missingContact && (!scraped.emails.length || !scraped.phones.length)) {
      console.log(`[Fallback] Searching SerpAPI for "${candidate.companyName}" contact info...`);
      searchResults = await searchContactInfoViaSerpAPI(candidate.companyName, candidate.location);
    }

    const emails = [...new Set([candidate.email, ...scraped.emails, ...searchResults.emails].filter(Boolean))];
    const phones = [...new Set([candidate.phone, ...scraped.phones, ...searchResults.phones].filter(Boolean))]
      .filter(phone => isValidPhoneNumber(phone)); // Validate ALL phones including from OpenClaw
    const whatsappLinks = scraped.whatsappLinks || [];
    
    // Extract WhatsApp number from link (prioritize if available)
    const whatsappNumber = whatsappLinks.length > 0 ? extractWhatsAppNumber(whatsappLinks[0]) : '';
    
    // Determine primary contact with clear channel indication
    // Priority: WhatsApp > Email > Phone
    let primaryContact = '';
    let contactType = '';
    let channel = '';
    
    if (whatsappNumber) {
      primaryContact = whatsappNumber;
      contactType = 'Whatsapp';
      channel = 'Whatsapp';
    } else if (emails.length > 0) {
      primaryContact = emails[0];
      contactType = 'Email';
      channel = 'Email';
    } else if (phones.length > 0) {
      primaryContact = phones[0];
      contactType = 'Phone';
      channel = 'Phone';
    } else {
      // No contact info - skip this lead
      console.log(`Skipping "${candidate.companyName}" — no contact info found after search.`);
      continue;
    }
    
    const primaryEmail = emails[0] || '';
    const primaryPhone = phones[0] || '';
    
    // Only override channel if it's a valid communication channel (not "Others" or generic text)
    const validChannels = ['Email', 'Phone', 'Whatsapp', 'WhatsApp', 'SMS', 'Telegram'];
    if (candidate.channel && validChannels.includes(candidate.channel)) {
      channel = candidate.channel;
    }


    const savedLead = await upsertLead({
      company: candidate.companyName || 'Unknown Company',
      person: candidate.contactName || '',
      email: primaryEmail,
      phone: primaryPhone,
      whatsapp: whatsappNumber,
      contactType: contactType,
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
