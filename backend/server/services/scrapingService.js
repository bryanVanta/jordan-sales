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

const MAX_LEADS = 3;

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
      const allSocialLinks = Array.from(
        document.querySelectorAll('a[href*="linkedin"], a[href*="facebook"], a[href*="instagram"], a[href*="twitter"], a[href*="t.me"]')
      )
        .map((node) => node.getAttribute('href') || '')
        .filter(Boolean);

      // Split Telegram out of social links
      const telegramLinks = allSocialLinks.filter((url) => url.includes('t.me'));
      const socialLinks = allSocialLinks.filter((url) => !url.includes('t.me'));

      const textEmails = text.match(emailRegex) || [];
      const textPhones = text.match(phoneRegex) || [];

      return {
        emails: [...new Set([...mailtoEmails, ...textEmails])].slice(0, 5),
        phones: [...new Set([...telPhones, ...textPhones])].slice(0, 5),
        whatsappLinks: [...new Set(whatsappLinks)].slice(0, 3),
        socialLinks: [...new Set(socialLinks)].slice(0, 5),
        telegramLinks: [...new Set(telegramLinks)].slice(0, 5),
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
    const contacts = { emails: [], phones: [], whatsappLinks: [], socialLinks: [], telegramLinks: [] };

    for (const pageUrl of [...new Set(candidatePages)]) {
      const pageContacts = await extractPageContacts(page, pageUrl);
      contacts.emails.push(...pageContacts.emails);
      contacts.phones.push(...pageContacts.phones);
      contacts.whatsappLinks.push(...pageContacts.whatsappLinks);
      contacts.socialLinks.push(...pageContacts.socialLinks);
      contacts.telegramLinks.push(...pageContacts.telegramLinks);
    }

    // Extract from social media pages (Facebook, Instagram, Telegram)
    const socialContacts = await extractSocialMediaContacts(browser, contacts.socialLinks, contacts.telegramLinks);
    contacts.emails.push(...socialContacts.emails);
    contacts.phones.push(...socialContacts.phones);
    contacts.whatsappLinks.push(...socialContacts.whatsappLinks);
    contacts.telegramLinks.push(...socialContacts.telegramHandles);

    return {
      emails: [...new Set(contacts.emails)].slice(0, 5),
      phones: [...new Set(contacts.phones)].slice(0, 5),
      whatsappLinks: [...new Set(contacts.whatsappLinks)].slice(0, 3),
      socialLinks: [...new Set(contacts.socialLinks)].slice(0, 5),
      telegramLinks: [...new Set(contacts.telegramLinks)].slice(0, 5),
    };
  } catch (error) {
    console.error(`Website scraping failed for ${url}:`, error.message);
    return { emails: [], phones: [], whatsappLinks: [], socialLinks: [], telegramLinks: [] };
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
// Generate smart search queries using Ollama
// ---------------------------------------------------------------------------

async function generateSearchQueries(productInfo) {
  const { targetCustomer, location } = productInfo;

  try {
    console.log(`🤖 [OLLAMA] Generating search query variations...`);

    // Extract key customer type from target customer (first entry before comma)
    const customerType = targetCustomer.split(',')[0].trim();

    const prompt = `You are a search expert. Generate 5 varied Google search queries to find REAL companies that match the customer profile.

GOAL: Find actual companies/businesses, NOT information about a specific product.

Target Customer: ${customerType} in ${location}

Generate 5 different searches with different strategies:
1. "{Customer Type} {Location} contact email phone" — direct contact search
2. "{Customer Type} {Location} facebook page" — social media search
3. "{Customer Type} {Location} directory" — directory listing search
4. "{Customer Type} {Location} official website" — official websites
5. "{Customer Type} {Location} phone number directory" — phone listing

Use the actual customer type and location. Focus on finding REAL businesses, not the product itself.

Return ONLY valid JSON in this exact format:
{
  "queries": ["full query 1", "full query 2", "full query 3", "full query 4", "full query 5"]
}

No markdown, no explanation, JSON only.`;

    const axios = require('axios');
    const ollamaResponse = await axios.post('http://192.168.100.210:11434/api/generate', {
      model: 'qwen3.5:4b',
      prompt,
      stream: false,
      format: 'json',
      timeout: 45000,
    }, { timeout: 50000 }).catch((err) => {
      console.log(`   Ollama connection failed: ${err.message}`);
      return null;
    });

    if (!ollamaResponse) {
      console.log(`⚠️  [OLLAMA] Could not connect — using fallback query`);
      const fallbackQuery = `${targetCustomer.split(',')[0].trim()} ${location} contact email phone`;
      return [fallbackQuery];
    }

    let result = {};
    try {
      const responseText = ollamaResponse.data?.response || ollamaResponse.data?.thinking || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.log(`   Could not parse Ollama response, using fallback`);
      const fallbackQuery = `${targetCustomer.split(',')[0].trim()} ${location} contact email phone`;
      return [fallbackQuery];
    }

    const queries = result?.queries || [];
    if (queries.length > 0) {
      console.log(`📋 [OLLAMA] Generated ${queries.length} query variation(s)`);
      return queries.slice(0, 5);
    } else {
      const fallbackQuery = `${targetCustomer.split(',')[0].trim()} ${location} contact email phone`;
      return [fallbackQuery];
    }
  } catch (error) {
    console.log(`⚠️  [OLLAMA] Fallback query used: ${error.message}`);
    const fallbackQuery = `${productInfo.targetCustomer.split(',')[0].trim()} ${productInfo.location} contact email phone`;
    return [fallbackQuery];
  }
}

// ---------------------------------------------------------------------------
// Google search with stealth + DuckDuckGo fallback
// ---------------------------------------------------------------------------

async function searchGoogleForCompanies(browser, query) {
  let page = null;

  try {
    console.log(`🔍 [SEARCH] Searching: "${query}"`);

    // Launch page with enhanced stealth settings
    page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    });

    // Enhanced stealth - hide more fingerprint properties
    await page.addInitScript(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // Realistic navigator properties
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
      Object.defineProperty(navigator, 'plugins', { get: () => [] });
      // Disable chrome detection
      window.chrome = { runtime: {} };
      // Spoof permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (params) => (
        params.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(params)
      );
    });

    // Set realistic headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Try Google first
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
    await page.goto(googleUrl, { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000 + Math.floor(Math.random() * 2000)); // Longer human-like delay

    let results = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Try primary selector
      let items = document.querySelectorAll('div.g, div[data-sokoban-container], div[data-result]');

      items.forEach((item, index) => {
        if (index >= 8) return;

        // Try different title selectors
        let titleEl = item.querySelector('h3, h2, [data-heading]');
        const linkEl = item.querySelector('a[href]');

        if (titleEl && linkEl) {
          const title = titleEl.textContent?.trim() || '';
          const url = linkEl.href || '';

          if (
            title &&
            url &&
            !seen.has(url.toLowerCase()) &&
            !url.includes('google.com') &&
            !url.includes('accounts.google') &&
            !url.startsWith('javascript:') &&
            (url.startsWith('http://') || url.startsWith('https://'))
          ) {
            results.push({
              companyName: title,
              website: url,
              source: 'google',
            });
            seen.add(url.toLowerCase());
          }
        }
      });

      return results;
    });

    // Check if Google blocked or returned CAPTCHA
    const isBlocked = results.length === 0 || (await page.url()).includes('sorry');

    if (isBlocked) {
      console.log(`⚠️  [SEARCH] Google blocked, trying alternative search approach...`);

      // Try using query.com (faster.com) which is more permissive
      const queryUrl = `https://www.query.com/?q=${encodeURIComponent(query)}`;
      try {
        await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(async () => {
          // If query.com fails, try Startpage which doesn't require JavaScript
          const startpageUrl = `https://www.startpage.com/do/search?query=${encodeURIComponent(query)}&language=english`;
          await page.goto(startpageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        });
      } catch (err) {
        console.log(`   Alternative search failed: ${err.message}`);
        return [];
      }
      await page.waitForTimeout(1500);

      results = await page.evaluate(() => {
        const results = [];
        const seen = new Set();

        // Helper to extract clean text (avoiding HTML markup)
        const getCleanText = (element) => {
          if (!element) return '';

          // Clone to avoid modifying original
          const clone = element.cloneNode(true);

          // Remove script and style tags first
          clone.querySelectorAll('script, style, img, svg, i[class*="icon"]').forEach(el => el.remove());

          // Try to get text content
          let text = '';

          // Strategy 1: Get first direct text node
          for (const node of clone.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              text = node.textContent.trim();
              if (text.length > 2) break;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              // Try to get text from first child element
              const childText = node.textContent?.trim();
              if (childText && childText.length > 2) {
                text = childText;
                break;
              }
            }
          }

          // Strategy 2: Fallback to full textContent if strategy 1 didn't work
          if (!text || text.length < 3) {
            text = clone.textContent?.trim() || '';
          }

          // Clean up whitespace
          text = text.replace(/\s+/g, ' ').trim();

          // Remove common HTML-like patterns
          text = text.replace(/<[^>]*>/g, '');

          // Remove CSS-like patterns (anything that looks like CSS property: value;)
          if (text.includes('{') || text.includes('}') || text.includes(':') || text.includes('px;') || text.includes('.css-')) {
            return '';  // Likely CSS or HTML markup, reject it
          }

          // Remove common URL patterns
          if (text.includes('http://') || text.includes('https://') || text.includes('www.') || text.includes('› ')) {
            text = text.split(/https?:\/\//)[0].split('www\.')[0].split(' › ')[0].trim();
          }

          // Take first meaningful portion
          if (text.length > 100) {
            // Try to find a natural break point (space, period, etc)
            const breakPoint = text.substring(0, 100).lastIndexOf(' ');
            text = (breakPoint > 50 ? text.substring(0, breakPoint) : text.substring(0, 100)).trim();
          }

          // Only return if it has meaningful content (not just symbols or short fragments)
          if (text.length < 2 || /^[\s\-\_\|\.]+$/.test(text)) {
            return '';
          }

          return text;
        };

        let resultContainers = [];

        // Try multiple result container selectors for different search engines
        resultContainers = Array.from(document.querySelectorAll(
          '.result, ' +  // Generic/Startpage
          'li.b_algo, li.b_sr, ' +  // Bing
          '.result__heading, ' +  // DuckDuckGo
          '[class*="search-result"], [class*="serp-result"], ' + // Generic patterns
          'div[data-result], [role="listitem"], h3'  // Data attributes + headings
        )).filter(el => el.querySelector('a[href]'));  // Only containers with links

        // If we found containers, extract links from within them
        if (resultContainers.length > 0) {
          let resultIndex = 0;
          resultContainers.forEach((container) => {
            if (resultIndex >= 8) return;

            // Try different selectors for the main link
            let titleLink = container.querySelector('a[href^="http"], a[href^="https"]');
            if (!titleLink) titleLink = container.querySelector('a');

            if (!titleLink) return;

            const href = titleLink.getAttribute('href');
            let text = getCleanText(titleLink);

            // Fallback: if we didn't get good text, try parent's text
            if (!text || text.length < 3) {
              text = getCleanText(container);
            }

            if (href && !seen.has(href.toLowerCase())) {
              // Filter out search engine and common aggregator sites
              const blocked = [
                'duckduckgo.com', 'start.duckduckgo', 'bing.com', 'google.com',
                'reddit.com', 'wikipedia.org', 'youtube.com', 'facebook.com/search',
                'twitter.com/search', 'linkedin.com/search', 'query.com', 'startpage.com'
              ];

              const isAllowed = !blocked.some(b => href.includes(b)) &&
                !href.startsWith('javascript:') &&
                !href.startsWith('#') &&
                (href.startsWith('http://') || href.startsWith('https://'));

              if (isAllowed) {
                // Use extracted text if good, otherwise use domain name
                let companyName = text && text.length > 2 ? text : '';
                if (!companyName) {
                  // Fallback: extract domain name from URL
                  try {
                    const urlObj = new URL(href);
                    companyName = urlObj.hostname.replace('www.', '').split('.')[0];
                    companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);
                  } catch (e) {
                    companyName = 'Unknown Company';
                  }
                }

                results.push({
                  companyName: companyName,
                  website: href,
                  source: 'search',
                });
                seen.add(href.toLowerCase());
                resultIndex++;
              }
            }
          });
        }

        // If still no results, fallback to aggressive link extraction
        if (results.length === 0) {
          const allLinks = Array.from(document.querySelectorAll('a[href^="http"], a[href^="https"]'));

          let linkIndex = 0;
          for (const link of allLinks) {
            if (linkIndex >= 8) break;

            const href = link.getAttribute('href');
            let text = getCleanText(link);

            if (href && !seen.has(href.toLowerCase())) {
              const blocked = ['duckduckgo.com', 'bing.com', 'google.com', 'reddit.com', 'wikipedia.org', 'query.com', 'startpage.com'];
              const isAllowed = !blocked.some(b => href.includes(b)) &&
                !href.startsWith('javascript:') &&
                !href.startsWith('#');

              if (isAllowed) {
                // Use extracted text if good, otherwise use domain name
                let companyName = text && text.length > 2 ? text : '';
                if (!companyName) {
                  // Fallback: extract domain name from URL
                  try {
                    const urlObj = new URL(href);
                    companyName = urlObj.hostname.replace('www.', '').split('.')[0];
                    companyName = companyName.charAt(0).toUpperCase() + companyName.slice(1);
                  } catch (e) {
                    companyName = 'Unknown Company';
                  }
                }

                results.push({
                  companyName: companyName,
                  website: href,
                  source: 'search',
                });
                seen.add(href.toLowerCase());
                linkIndex++;
              }
            }
          }
        }

        return results;
      });
    }

    if (results.length > 0) {
      const source = results[0].source || 'unknown';
      console.log(`📋 [SEARCH] Found ${results.length} result(s) from ${source}`);
      results.forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.companyName.substring(0, 60)} — ${r.website.substring(0, 50)}...`);
      });
    } else {
      console.log(`⚠️  [SEARCH] No results found for: "${query}"`);
    }

    return results;
  } catch (error) {
    console.log(`❌ [SEARCH] Search failed: ${error.message}`);
    return [];
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Extract contacts from social media pages
// ---------------------------------------------------------------------------

async function extractSocialMediaContacts(browser, socialLinks = [], telegramLinks = []) {
  const result = { emails: [], phones: [], whatsappLinks: [], telegramHandles: [] };

  if (!socialLinks || (!socialLinks.length && !telegramLinks.length)) {
    return result;
  }

  try {
    // Extract Telegram handles (no page navigation needed)
    telegramLinks.forEach((url) => {
      const match = url.match(/t\.me\/([a-zA-Z0-9_]+)/);
      if (match) {
        const handle = `@${match[1]}`;
        result.telegramHandles.push(handle);
        console.log(`✉️  [TELEGRAM] Found: ${handle}`);
      }
    });

    // Visit Facebook pages
    const facebookLinks = socialLinks.filter((url) => url.includes('facebook.com'));
    for (const fbUrl of facebookLinks) {
      if (result.emails.length + result.phones.length >= 3) break; // Stop if we have enough

      try {
        console.log(`🔗 [SOCIAL] Visiting Facebook page...`);

        const page = await browser.newPage({
          viewport: { width: 1280, height: 800 },
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        });

        // Navigate to About page
        const aboutUrl = fbUrl.replace(/\/$/, '') + '/about';
        await page.goto(aboutUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

        // Check if redirected to login
        if ((await page.url()).includes('/login')) {
          await page.close().catch(() => {});
          continue;
        }

        await page.waitForTimeout(2000);

        const fbContacts = await page.evaluate(() => {
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const phoneRegex = /(?:\+?\d[\d\s().-]{7,}\d)/g;

          // Try to get About/Contact info boxes
          const aboutBoxes = [
            ...document.querySelectorAll('.timeline_about_box'),
            ...document.querySelectorAll('[data-testid*="contact"]'),
            ...document.querySelectorAll('[data-pagelet*="ProfileTile"]'),
            ...document.querySelectorAll('div[role="main"]'),
          ];

          let text = aboutBoxes.map((el) => el.innerText || '').join('\n');

          // Fallback to body text
          if (text.length < 50) {
            text = document.body?.innerText || '';
          }

          // Explicit mailto/tel links
          const mailtoEmails = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map((a) =>
            a.href.replace('mailto:', '').split('?')[0]
          );
          const telPhones = Array.from(document.querySelectorAll('a[href^="tel:"]')).map((a) =>
            a.href.replace('tel:', '')
          );
          const waLinks = Array.from(
            document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]')
          ).map((a) => a.href);

          return {
            emails: [...new Set([...mailtoEmails, ...(text.match(emailRegex) || [])])].slice(0, 3),
            phones: [...new Set([...telPhones, ...(text.match(phoneRegex) || [])])].slice(0, 3),
            whatsappLinks: [...new Set(waLinks)].slice(0, 2),
          };
        });

        result.emails.push(...fbContacts.emails);
        result.phones.push(...fbContacts.phones);
        result.whatsappLinks.push(...fbContacts.whatsappLinks);

        await page.close().catch(() => {});
      } catch (fbErr) {
        console.log(`   Facebook extraction failed: ${fbErr.message}`);
      }
    }

    return result;
  } catch (error) {
    console.log(`⚠️  [SOCIAL] Social media extraction failed: ${error.message}`);
    return result;
  }
}


// ---------------------------------------------------------------------------
// Main lead finding pipeline
// ---------------------------------------------------------------------------

async function findLeadsFromProductInfo(productInfo) {
  console.log(`\n🔍 [SEARCH] Asking OpenClaw for leads...`);
  console.log(`   📍 Target: "${productInfo.targetCustomer}" in "${productInfo.location}"`);
  console.log(`   🏢 Product: ${productInfo.productName || 'Unnamed'}`);

  // Step 1: Try OpenClaw (primary source)
  let openClawLeads = await findLeadsWithOpenClaw(productInfo);

  if (openClawLeads.length > 0) {
    console.log(`📋 [SEARCH] OpenClaw returned ${openClawLeads.length} candidate(s)`);

    const candidates = dedupeByWebsite(
      openClawLeads.map((lead) => ({
        companyName: lead.companyName || lead.company || '',
        website: lead.website || lead.url || '',
        snippet: lead.notes || lead.intent || '',
        source: lead.source || 'openclaw',
        location: lead.location || productInfo.location || '',
        email: lead.email || '',
        phone: lead.phone || '',
        contactName: lead.contactName || lead.person || '',
        channel: lead.channel || '',
      }))
    ).slice(0, MAX_LEADS);

    console.log(`✨ [SEARCH] Deduped to ${candidates.length} unique candidate(s)`);

    const discoveredLeads = await processCandidates(
      candidates,
      productInfo
    );

    const finalCount = discoveredLeads.length;
    console.log(`\n✅ [DONE] ${finalCount} lead(s) saved and ready to review\n`);

    return discoveredLeads.slice(0, MAX_LEADS);
  }

  // Step 2: Google search + retry loop (fallback when OpenClaw returns nothing)
  console.log(`⛔ [SEARCH] OpenClaw returned no results, switching to Google search...`);

  const queries = await generateSearchQueries(productInfo);
  console.log(`📋 [SEARCH] Generated ${queries.length} query variation(s)`);

  let browser = null;

  try {
    browser = await chromium.launch({ headless: true });

    const allCandidates = [];
    const discoveredLeads = [];
    const processedWebsites = new Set();

    for (let queryIdx = 0; queryIdx < queries.length; queryIdx++) {
      if (discoveredLeads.length >= MAX_LEADS) break;

      const query = queries[queryIdx];
      console.log(`\n🔍 [SEARCH] Trying query ${queryIdx + 1}/${queries.length}: "${query}"`);

      if (allCandidates.length > 0 && discoveredLeads.length < MAX_LEADS) {
        console.log(
          `🔄 [RETRY] Fetched ${allCandidates.length} candidates so far, need ${MAX_LEADS} valid leads — trying next query...`
        );
      }

      const rawCandidates = await searchGoogleForCompanies(browser, query);

      // Filter to unique websites only
      const newUnique = rawCandidates.filter(
        (c) => c.website && !processedWebsites.has(c.website.toLowerCase())
      );

      allCandidates.push(...newUnique);

      // Process each new candidate
      for (const candidate of newUnique) {
        if (discoveredLeads.length >= MAX_LEADS) break;

        processedWebsites.add(candidate.website.toLowerCase());

        console.log(`\n🌐 [CRAWL] Visiting "${candidate.companyName}" — ${candidate.website}`);

        // Scrape website + social media
        const scraped = await scrapeCompanyWebsite(candidate.website);

        const emails = [...new Set([candidate.email, ...scraped.emails].filter(Boolean))];
        const phones = [...new Set([candidate.phone, ...scraped.phones].filter(Boolean))];
        const whatsappLinks = scraped.whatsappLinks || [];
        const telegramLinks = scraped.telegramLinks || [];

        // Log what was found
        if (emails.length > 0 || phones.length > 0 || whatsappLinks.length > 0 || telegramLinks.length > 0) {
          const parts = [];
          if (emails.length > 0) parts.push(`📧 ${emails[0]}`);
          if (phones.length > 0) parts.push(`📞 ${phones[0]}`);
          if (whatsappLinks.length > 0) parts.push(`💬 WhatsApp`);
          if (telegramLinks.length > 0) parts.push(`✉️  Telegram`);
          console.log(`📧 [EXTRACT] Found: ${parts.join(' | ')}`);
        } else {
          console.log(`📧 [EXTRACT] No contact info found`);
        }

        // UPDATED validation gate: include Telegram
        if (!emails[0] && !phones[0] && whatsappLinks.length === 0 && telegramLinks.length === 0) {
          console.log(`⛔ [VALIDATE] "${candidate.companyName}" — skipped, no contact info`);
          continue;
        }

        console.log(`✅ [VALIDATE] "${candidate.companyName}" — has contact info`);

        const channel = detectPreferredChannel({ emails, phones, whatsappLinks });
        const primaryEmail = emails[0] || '';
        const primaryPhone = phones[0] || '';

        const savedLead = await upsertLead({
          company: candidate.companyName || 'Unknown Company',
          person: candidate.contactName || '',
          email: primaryEmail,
          phone: primaryPhone,
          website: candidate.website || '',
          location: candidate.location || productInfo.location || '',
          temp: 'Neutral',
          status: 'new',
          intent: `Matched ${productInfo.targetCustomer || 'target customer'} in ${productInfo.location || 'target location'}`,
          next: 'Follow Up',
          channel,
          telegramLinks,
          whatsappLinks,
          productInfoId: productInfo.id || 'current',
        });

        if (savedLead) {
          const contact = primaryEmail || primaryPhone || (whatsappLinks.length > 0 ? 'WhatsApp' : 'Telegram');
          console.log(`💾 [SAVE] Upserted lead: "${savedLead.company}" (${contact})`);
          discoveredLeads.push(savedLead);
        }
      }
    }

    const finalCount = discoveredLeads.length;
    console.log(`\n✅ [DONE] ${finalCount} lead(s) saved and ready to review\n`);

    return discoveredLeads.slice(0, MAX_LEADS);
  } catch (error) {
    console.error(`Lead discovery failed: ${error.message}`);
    return [];
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// Helper function to process candidates (reused by both OpenClaw and Google paths)
async function processCandidates(candidates, productInfo) {
  const discoveredLeads = [];

  for (const candidate of candidates) {
    if (discoveredLeads.length >= MAX_LEADS) break;

    console.log(`\n🌐 [CRAWL] Visiting "${candidate.companyName}" — ${candidate.website || 'no website'}`);

    // Scrape website + social media
    const scraped = candidate.website
      ? await scrapeCompanyWebsite(candidate.website)
      : { emails: [], phones: [], whatsappLinks: [], socialLinks: [], telegramLinks: [] };

    const emails = [...new Set([candidate.email, ...scraped.emails].filter(Boolean))];
    const phones = [...new Set([candidate.phone, ...scraped.phones].filter(Boolean))];
    const whatsappLinks = scraped.whatsappLinks || [];
    const telegramLinks = scraped.telegramLinks || [];

    // Log what was found
    if (emails.length > 0 || phones.length > 0 || whatsappLinks.length > 0 || telegramLinks.length > 0) {
      const parts = [];
      if (emails.length > 0) parts.push(`📧 ${emails[0]}`);
      if (phones.length > 0) parts.push(`📞 ${phones[0]}`);
      if (whatsappLinks.length > 0) parts.push(`💬 WhatsApp`);
      if (telegramLinks.length > 0) parts.push(`✉️  Telegram`);
      console.log(`📧 [EXTRACT] Found: ${parts.join(' | ')}`);
    } else {
      console.log(`📧 [EXTRACT] No contact info found`);
    }

    // UPDATED validation gate: include Telegram
    if (!emails[0] && !phones[0] && whatsappLinks.length === 0 && telegramLinks.length === 0) {
      console.log(`⛔ [VALIDATE] "${candidate.companyName}" — skipped, no contact info`);
      continue;
    }

    console.log(`✅ [VALIDATE] "${candidate.companyName}" — has contact info`);

    const channel = detectPreferredChannel({ emails, phones, whatsappLinks });
    const primaryEmail = emails[0] || '';
    const primaryPhone = phones[0] || '';

    const savedLead = await upsertLead({
      company: candidate.companyName || 'Unknown Company',
      person: candidate.contactName || '',
      email: primaryEmail,
      phone: primaryPhone,
      website: candidate.website || '',
      location: candidate.location || productInfo.location || '',
      temp: 'Neutral',
      status: 'new',
      intent: candidate.snippet || `Matched ${productInfo.targetCustomer || 'target customer'} in ${productInfo.location || 'target location'}`,
      next: 'Follow Up',
      channel,
      telegramLinks,
      whatsappLinks,
      productInfoId: productInfo.id || 'current',
    });

    if (savedLead) {
      const contact = primaryEmail || primaryPhone || (whatsappLinks.length > 0 ? 'WhatsApp' : 'Telegram');
      console.log(`💾 [SAVE] Upserted lead: "${savedLead.company}" (${contact})`);
      discoveredLeads.push(savedLead);
    }
  }

  return discoveredLeads;
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
