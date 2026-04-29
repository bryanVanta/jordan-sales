/**
 * Scraping Service
 * Lead enrichment pipeline:
 * 1. OpenClaw finds leads
 * 2. If missing contact: Try website scraping
 * 3. If still missing: Use SerpAPI to search for "Company contact"
 * 4. Scrape top search results with Playwright
 * 5. Extract email/phone from search results
 */

const { updateProgress, isTerminateRequested, clearTerminate } = require('./progressService');


const { chromium } = require('playwright');
const axios = require('axios');
const { db } = require('../config/firebase');
const { findLeadsWithOpenClaw } = require('./openClawService');

const MAX_LEADS = 50; // Leads returned per page (pagination) - allows pagination through hundreds
const SEARCH_BATCH_SIZE = 100; // Batch size for OpenClaw to find per search
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
  const filtered = items.filter((item) => {
    const key = (item.website || item.url || item.companyName || '').toLowerCase();
    if (!key) {
      console.log(`[Dedup] Removing "${item.companyName}" - no website/URL/name`);
      return false;
    }
    if (seen.has(key)) {
      console.log(`[Dedup] Removing "${item.companyName}" - duplicate website: ${key}`);
      return false;
    }
    seen.add(key);
    return true;
  });
  console.log(`[Dedup by Website] ${items.length} → ${filtered.length} items`);
  return filtered;
};

const extractCompanyChain = (companyName = '') => {
  // Extract parent company name from chain variations
  // e.g., "Hotel 99 Sri Petaling @ Bukit Jalil KL" -> "Hotel 99"
  // "Ceria Hotel Bukit Bintang" -> "Ceria Hotel"
  const baseMatch = companyName.match(/^([A-Za-z0-9\s&]+?)(?:\s+@|\s+[-–]|$)/);
  return (baseMatch ? baseMatch[1] : companyName).trim().toLowerCase();
};

const normalizeAlnum = (value = '') => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const dedupeByCompanyChain = (items = []) => {
  const seen = new Set();
  const filtered = items.filter((item) => {
    const chainKey = extractCompanyChain(item.companyName || item.company || '');
    if (!chainKey) {
      console.log(`[Dedup] Removing "${item.companyName}" - no chain key`);
      return false;
    }
    if (seen.has(chainKey)) {
      console.log(`[Dedup] Removing "${item.companyName}" - duplicate chain: ${chainKey}`);
      return false;
    }
    seen.add(chainKey);
    return true;
  });
  console.log(`[Dedup by Chain] ${items.length} → ${filtered.length} items`);
  return filtered;
};

const extractWhatsAppNumber = (whatsappLink = '') => {
  // Extract phone number from wa.me link: https://wa.me/1234567890
  const match = whatsappLink.match(/wa\.me\/(\+?\d[\d\s.-]{7,})/i);
  if (match) return normalizePhoneNumber(match[1]);
  
  // Extract from direct WhatsApp URL
  const match2 = whatsappLink.match(/phone[=\/](\+?\d[\d\s.-]{7,})/i);
  if (match2) return normalizePhoneNumber(match2[1]);
  
  return '';
};

const detectPreferredChannel = ({ emails = [], phones = [], whatsapp = '' }) => {
  if (whatsapp) return 'Whatsapp';
  if (emails.length > 0) return 'Email';
  if (phones.length > 0) return 'Phone';
  return 'Email';
};

const normalizePhoneNumber = (phone = '') => {
  const raw = String(phone || '').trim();
  const digitsOnly = raw.replace(/\D/g, '');
  if (!digitsOnly) return '';
  if (raw.trim().startsWith('+')) return `+${digitsOnly}`;
  return digitsOnly;
};

// Validate phone number format.
// Keep this international enough for non-Malaysia leads (e.g. +86...), but still reject common date/id noise.
const isValidPhoneNumber = (phone) => {
  if (!phone) return false;

  const raw = String(phone || '').trim();
  const digitsOnly = raw.replace(/\D/g, '');
  
  // Must have 8-15 digits
  if (digitsOnly.length < 8 || digitsOnly.length > 15) return false;

  // Reject obvious dates/timestamps and ranges: 2025-04-01, 20240401, 2024/04/01.
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(raw)) return false;
  if (/^(19|20)\d{6}$/.test(digitsOnly)) return false;
  if (/^(19|20)\d{10,}$/.test(digitsOnly) && !raw.startsWith('+')) return false;
  
  // Reject if all same digit (111111, 000000, etc)
  if (/^(\d)\1{5,}$/.test(digitsOnly)) return false;
  
  // Reject if looks like sequential numbers (123456, 987654, etc)
  if (/^(01234|12345|23456|34567|45678|56789|67890|98765|87654|76543)/.test(digitsOnly)) return false;
  
  // Local Malaysia formats are valid.
  if (/^(60|0[0-9])/.test(digitsOnly)) return true;

  // Explicit international numbers are valid if length is E.164-ish.
  if (raw.startsWith('+')) return true;

  // Bare international-looking numbers from pages are valid too (e.g. 8613616574884).
  // Reject bare US-style 10 digit numbers only if they start with 0/1 rules above didn't catch? no-op.
  return digitsOnly.length >= 10;
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
      
      // Extract WhatsApp-labeled phone numbers from text (e.g., "WhatsApp: +60 16-211 7281")
      const whatsappTextRegex = /WhatsApp[\s:]*(\+?6?0\d{1,2}[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,9})/gi;
      const whatsappTextMatches = [];
      let match;
      while ((match = whatsappTextRegex.exec(text)) !== null) {
        if (match[1]) whatsappTextMatches.push(match[1]);
      }

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
      // Separate WhatsApp phones from regular phones
      const allPhones = [...new Set([...telPhones, ...textPhones])];
      const whatsappPhones = [...new Set(whatsappTextMatches)];
      
      // Remove duplicates with different formatting and filter out date patterns
      const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
      const cleanPhones = allPhones.filter((phone, idx, arr) => {
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
      
      // Clean WhatsApp phones same way
      const cleanWhatsAppPhones = whatsappPhones.filter((phone, idx, arr) => {
        // Skip if it's just a date
        if (dateOnlyRegex.test(phone)) return false;
        // Skip if contains mostly letters
        if (/[A-Za-z]{3,}/.test(phone)) return false;
        
        const normalized = phone.replace(/\D/g, '');
        // Must have at least 8 digits to be a valid phone
        if (normalized.length < 8) return false;
        
        return idx === arr.findIndex(p => {
          if (dateOnlyRegex.test(p) || /[A-Za-z]{3,}/.test(p)) return false;
          return p.replace(/\D/g, '') === normalized;
        });
      }).slice(0, 3);

      return {
        emails: sortedEmails,
        phones: cleanPhones.map((phone) => phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')),
        whatsappPhones: cleanWhatsAppPhones.map((phone) => phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')),
        whatsappLinks: [...new Set(whatsappLinks)].slice(0, 3),
        socialLinks: [...new Set(socialLinks)].slice(0, 5),
      };
    }, { companyName, location });
  } catch (error) {
    console.error(`Failed scraping ${url}:`, error.message);
    return { emails: [], phones: [], whatsappPhones: [], whatsappLinks: [], socialLinks: [] };
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
    
    const contacts = { emails: [], phones: [], whatsappPhones: [], whatsappLinks: [], socialLinks: [] };

    for (const pageUrl of [...new Set(candidatePages)]) {
      try {
        const pageContacts = await extractPageContacts(page, pageUrl, companyName, location);
        contacts.emails.push(...pageContacts.emails);
        contacts.phones.push(...pageContacts.phones);
        contacts.whatsappPhones.push(...pageContacts.whatsappPhones);
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
      whatsappPhones: [...new Set(contacts.whatsappPhones)].filter(phone => isValidPhoneNumber(phone)).slice(0, 3),
      whatsappLinks: [...new Set(contacts.whatsappLinks)].slice(0, 3),
      socialLinks: [...new Set(contacts.socialLinks)].slice(0, 5),
    };
  } catch (error) {
    console.error(`Website scraping failed for ${url}:`, error.message);
    return { emails: [], phones: [], whatsappPhones: [], whatsappLinks: [], socialLinks: [] };
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
          const companyNameInDomain = normalizeAlnum(urlLower).includes(normalizeAlnum(companyName));
          
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

    const uniquePhones = [...new Set(allPhones.map(p => normalizePhoneNumber(p)))].filter(p => p.length > 0);
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

async function findLeadsFromProductInfo(productInfo, offset = 0) {
  const productId = productInfo.id || 'current';
  
  try {
    // Step 0: Get previously found companies to exclude from new search
    updateProgress(productId, 'loading', { message: 'Loading previous searches...' });
    const previousCompanies = await getPreviouslyFoundCompanies(productId);
    console.log(`[Previous] Found ${previousCompanies.length} previously saved companies: ${previousCompanies.slice(0, 5).join(', ')}${previousCompanies.length > 5 ? '...' : ''}`);

    // Step 1: OpenClaw finds leads - PASS previousCompanies so it searches for different ones
    updateProgress(productId, 'searching', { message: 'Searching for leads with AI...', stage: 'openclaw' });
    const openClawLeads = await findLeadsWithOpenClaw(productInfo, previousCompanies);
    console.log(`[OpenClaw] Returned ${openClawLeads.length} leads`);
    if (openClawLeads.length > 0) {
      console.log(`[OpenClaw] Leads: ${openClawLeads.map(l => l.companyName || l.company || 'Unknown').join(', ')}`);
    }

    // Step 1.5: Now DON'T filter by previous since OpenClaw should exclude them
    const newLeads = openClawLeads;
    console.log(`[Filter] Skipping dedup with previous (OpenClaw already excluded them)`);

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

    // Filter out only the EXACT previously found companies, not entire chains
    const previousCompanyLower = previousCompanies.map(c => c.toLowerCase());
    console.log(`[Pipeline] Previous companies to exclude (${previousCompanies.length}): ${previousCompanies.slice(0, 5).join(', ')}${previousCompanies.length > 5 ? '...' : ''}`);
    
    const filteredCandidates = candidates.filter(candidate => {
      const candidateNameLower = (candidate.companyName || '').toLowerCase();
      const isExcluded = previousCompanyLower.includes(candidateNameLower);
      if (isExcluded) {
        console.log(`[Pipeline] Filtering out "${candidate.companyName}" - matches previous company`);
      }
      // Only exclude exact name matches, allow different locations of same chain
      return !isExcluded;
    });

    console.log(`[Pipeline] After filtering previous: ${candidates.length} → ${filteredCandidates.length} new candidates`);
    console.log(`[Pipeline] Processing ${filteredCandidates.length} new deduplicated candidates...`);
    updateProgress(productId, 'enriching', { message: `Enriching ${filteredCandidates.length} candidates...`, stage: 'enrichment' });

    const discoveredLeads = [];

    clearTerminate(productId);

    for (let candidateIdx = 0; candidateIdx < filteredCandidates.length; candidateIdx++) {
      const candidate = filteredCandidates[candidateIdx];

      if (isTerminateRequested(productId)) {
        console.log(`[Pipeline] Terminated by user at candidate #${candidateIdx + 1}`);
        clearTerminate(productId);
        updateProgress(productId, 'complete', {
          message: `Stopped early — found ${discoveredLeads.length} lead${discoveredLeads.length === 1 ? '' : 's'}`,
          leadsFound: discoveredLeads.length,
          totalDiscovered: discoveredLeads.length,
          terminated: true,
        });
        return discoveredLeads.slice(offset, offset + MAX_LEADS);
      }

      try {
        console.log(`[Pipeline] Enriching candidate #${candidateIdx + 1}: "${candidate.companyName}"...`);
        updateProgress(productId, 'enriching', {
          message: `Processing: ${candidate.companyName}`,
          stage: 'enrichment',
          progress: candidateIdx + 1,
          total: filteredCandidates.length,
          leadsFound: discoveredLeads.length,
        });

        // Keep going until we have enough leads to satisfy offset + MAX_LEADS
        if (discoveredLeads.length >= offset + MAX_LEADS) break;

        // Step 2: Enrich with Playwright to find contact info + always check for WhatsApp
        const missingContact = !candidate.email && !candidate.phone;
      console.log(`[Pipeline] Missing contact? ${missingContact} (email: ${candidate.email}, phone: ${candidate.phone})`);
      
      let scraped = { emails: [], phones: [], whatsappPhones: [], whatsappLinks: [], socialLinks: [] };
      
      // ALWAYS scrape website to check for WhatsApp, even if contact info exists
      if (candidate.website) {
        console.log(`[Pipeline] Scraping website: ${candidate.website}${missingContact ? ' (missing contact)' : ' (looking for WhatsApp)'}`);
        updateProgress(productId, 'enriching', { message: `Scraping website: ${candidate.companyName}...` });
        scraped = await scrapeCompanyWebsite(candidate.website, candidate.companyName, candidate.location);
        console.log(`[Pipeline] Website scrape result: ${scraped.emails.length} emails, ${scraped.phones.length} phones, ${scraped.whatsappPhones.length} whatsapp phones`);
      }
      
      // Step 2.5: If still no contact found, try SerpAPI + Playwright fallback
      let searchResults = { phones: [], emails: [] };
      if (missingContact && (!scraped.emails.length || !scraped.phones.length)) {
        console.log(`[Pipeline] No contact on website, trying SerpAPI for "${candidate.companyName}"...`);
        updateProgress(productId, 'enriching', { message: `Searching: ${candidate.companyName}...` });
        searchResults = await searchContactInfoViaSerpAPI(candidate.companyName, candidate.location);
        console.log(`[Pipeline] SerpAPI result: ${searchResults.emails.length} emails, ${searchResults.phones.length} phones`);
      }

      const emails = [...new Set([candidate.email, ...scraped.emails, ...searchResults.emails].filter(Boolean))];
      const whatsappNumbers = [...new Set([...scraped.whatsappPhones])]
        .filter(phone => isValidPhoneNumber(phone))
        .map(phone => normalizePhoneNumber(phone)); // Validate WhatsApp numbers
      const phones = [...new Set([candidate.phone, ...scraped.phones, ...searchResults.phones].filter(Boolean))]
        .filter(phone => isValidPhoneNumber(phone))
        .map(phone => normalizePhoneNumber(phone)); // Validate ALL phones including from OpenClaw
      const whatsappLinks = scraped.whatsappLinks || [];
      
      console.log(`[Pipeline] Final contact info: ${emails.length} emails, ${phones.length} valid phones, ${whatsappNumbers.length} whatsapp text numbers, ${whatsappLinks.length} whatsapp links`);
      
      // Extract WhatsApp number from link (prioritize if available)
      const whatsappNumberFromLink = whatsappLinks.length > 0 ? extractWhatsAppNumber(whatsappLinks[0]) : '';
      
      // Determine primary contact with clear channel indication
      // Priority: WhatsApp (text) > WhatsApp (link) > Email > Phone
      let primaryContact = '';
      let contactType = '';
      let channel = '';
    
    // Check WhatsApp text first (e.g., "WhatsApp: +60 16-211 7281")
    if (whatsappNumbers.length > 0) {
      primaryContact = whatsappNumbers[0];
      contactType = 'Whatsapp';
      channel = 'Whatsapp';
      console.log(`[Pipeline] 📱 Detected WhatsApp (from text): ${primaryContact}`);
    } else if (whatsappNumberFromLink) {
      primaryContact = whatsappNumberFromLink;
      contactType = 'Whatsapp';
      channel = 'Whatsapp';
      console.log(`[Pipeline] 📱 Detected WhatsApp (from link): ${primaryContact}`);
    } else if (emails.length > 0) {
      primaryContact = emails[0];
      contactType = 'Email';
      channel = 'Email';
      console.log(`[Pipeline] 📧 Using Email: ${primaryContact}`);
    } else if (phones.length > 0) {
      primaryContact = phones[0];
      contactType = 'Phone';
      channel = 'Phone';
      console.log(`[Pipeline] ☎️ Using Phone: ${primaryContact}`);
    } else {
      // No contact info - skip this lead
      console.log(`[Pipeline] ❌ SKIPPING "${candidate.companyName}" — no valid contact info found after enrichment`);
      continue;
    }
    
    console.log(`[Pipeline] ✅ ACCEPTED "${candidate.companyName}" with channel: ${channel}`);
    
    const primaryEmail = emails[0] || '';
    const primaryPhone = phones[0] || '';
    const primaryWhatsapp = whatsappNumbers[0] || whatsappNumberFromLink || '';


    const savedLead = await upsertLead({
      company: candidate.companyName || 'Unknown Company',
      person: candidate.contactName || '',
      email: primaryEmail,
      phone: primaryPhone,
      whatsapp: primaryWhatsapp,
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

    if (savedLead) {
      discoveredLeads.push(savedLead);
      console.log(`[Pipeline] 💾 Saved lead #${discoveredLeads.length}: "${candidate.companyName}"`);
    } else {
      console.log(`[Pipeline] ⚠️  upsertLead returned null/empty for "${candidate.companyName}"`);
    }
    } catch (enrichError) {
      console.error(`[Pipeline] ❌ Error enriching "${candidate.companyName}":`, enrichError.message);
      continue;
    }
  }

  // Return leads based on pagination offset
  const paginatedLeads = discoveredLeads.slice(offset, offset + MAX_LEADS);
  
  console.log(`[Pagination] Returning leads ${offset + 1}-${offset + paginatedLeads.length} (total discovered: ${discoveredLeads.length})`);
  
  // Update progress with completion status
  updateProgress(productId, 'complete', { 
    message: `Found ${paginatedLeads.length} leads`,
    leadsFound: paginatedLeads.length,
    totalDiscovered: discoveredLeads.length
  });
  
  return paginatedLeads;
  
  } catch (error) {
    console.error('[Pipeline] Fatal error in findLeadsFromProductInfo:', error.message);
    updateProgress(productId, 'error', { message: `Error: ${error.message}` });
    return [];
  }
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
