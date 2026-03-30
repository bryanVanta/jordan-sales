/**
 * Crawling Service - Stage B: Visit and collect content from multiple pages
 * 
 * Handles:
 * - Visiting homepage
 * - Finding and visiting contact/about/team pages
 * - Extracting raw text and HTML
 * - Discovering links and social profiles
 * - Handling JavaScript-rendered content
 */

const { chromium } = require('playwright');
const axios = require('axios');

const CRAWL_TIMEOUT = 10000;  // Reduced from 15s
const PAGE_WAIT = 5000;       // Reduced from 12s - 5 seconds is usually enough
const MAX_PAGES_PER_DOMAIN = 3;  // Reduced from 5 to speed up crawling

/**
 * Find candidate pages to crawl based on internal links
 */
const discoverPages = async (page, mainDomain) => {
  try {
    const links = await page.evaluate(() => {
      const discovered = new Set();
      
      // Get all internal links
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href');
        const text = link.textContent.toLowerCase();
        
        if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
          const isRelevant = /contact|about|team|support|reach|inquiry|company|career|help|service|phone/i.test(text) ||
                            /\/(contact|about|team|support|inquiry|company|career|help|phone)/.test(href);
          
          if (isRelevant || text.length < 50) { // Short text is likely nav menu
            discovered.add(href);
          }
        }
      });
      
      return Array.from(discovered).slice(0, 15);
    });

    // Resolve relative URLs
    const resolvedLinks = links.map(link => {
      try {
        return new URL(link, mainDomain).toString();
      } catch {
        return null;
      }
    }).filter(l => l && l.includes(mainDomain));

    return resolvedLinks;
  } catch (error) {
    console.log('[Crawler] Error discovering pages:', error.message);
    return [];
  }
};

/**
 * Crawl a single page and extract content
 */
const crawlPage = async (url, browser) => {
  let page = null;
  try {
    page = await browser.newPage();
    
    // Add anti-bot detection headers to bypass Akamai, Cloudflare, etc.
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Not_A_Brand";v="8", "Chromium";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    });
    
    // Avoid loading images/videos for speed
    await page.route('**/*.{png,jpg,jpeg,gif,webp}', route => route.abort());
    
    // Set tight page timeout
    page.setDefaultNavigationTimeout(CRAWL_TIMEOUT);
    page.setDefaultTimeout(CRAWL_TIMEOUT);

    // Try to navigate to page
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: CRAWL_TIMEOUT,
      });
    } catch (navError) {
      console.log(`[Crawler] Navigation timeout for ${url}, continuing with partial page`);
    }

    // Wait for page to settle (reduced time)
    await Promise.race([
      page.waitForTimeout(PAGE_WAIT),
      page.waitForLoadState('networkidle').catch(() => {}),
    ]);

    // Scroll once quickly
    try {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(800);
    } catch (e) {}

    // Try to interact with contact elements
    try {
      const contactSelectors = [
        'a[href*="contact"]',
        'a[href*="about"]',
        'button[aria-label*="contact" i]',
      ];

      for (const selector of contactSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            await elements[0].click().catch(() => {});
            await page.waitForTimeout(500);
            break;
          }
        } catch (e) {}
      }
    } catch (e) {}

    // Extract content with timeout
    let pageText = '';
    let pageHTML = '';
    try {
      pageText = await Promise.race([
        page.evaluate(() => document.body.innerText),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
    } catch (e) {
      console.log(`[Crawler] Content extraction timeout for ${url}`);
    }

    try {
      pageHTML = await Promise.race([
        page.content(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
    } catch (e) {}

    // Extract structured data with timeout
    let structuredData = {};
    try {
      structuredData = await Promise.race([
        page.evaluate(() => {
      const data = {
        emailLinks: [],
        emailTexts: [],
        phoneLinks: [],
        phoneTexts: [],
        whatsappLinks: [],
        socialLinks: [],
      };

      // Email links (mailto:)
      document.querySelectorAll('a[href^="mailto:"]').forEach(link => {
        const email = link.getAttribute('href').replace('mailto:', '').split('?')[0];
        if (email && !data.emailLinks.includes(email)) {
          data.emailLinks.push(email);
        }
      });

      // Phone links (tel:)
      document.querySelectorAll('a[href^="tel:"]').forEach(link => {
        const phone = link.getAttribute('href').replace('tel:', '');
        if (phone && !data.phoneLinks.includes(phone)) {
          data.phoneLinks.push(phone);
        }
      });

      // Also check for phone numbers in data attributes
      document.querySelectorAll('[data-phone], [data-tel], [data-contactnumber]').forEach(element => {
        const phone = element.getAttribute('data-phone') || element.getAttribute('data-tel') || element.getAttribute('data-contactnumber');
        if (phone && !data.phoneLinks.includes(phone)) {
          data.phoneLinks.push(phone);
        }
      });

      // Email in data attributes
      document.querySelectorAll('[data-email], [data-contact-email]').forEach(element => {
        const email = element.getAttribute('data-email') || element.getAttribute('data-contact-email');
        if (email && !data.emailLinks.includes(email)) {
          data.emailLinks.push(email);
        }
      });

      // WhatsApp links
      document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').forEach(link => {
        data.whatsappLinks.push(link.getAttribute('href'));
      });

      // Social links
      document.querySelectorAll('a[href*="facebook"], a[href*="linkedin"], a[href*="instagram"], a[href*="twitter"]').forEach(link => {
        data.socialLinks.push(link.getAttribute('href'));
      });

      // Extract emails from visible text (common patterns)
      const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const textEmails = document.body.innerText.match(emailPattern) || [];
      data.emailTexts = [...new Set(textEmails.filter(e => !e.includes('example.com') && !e.includes('placeholder')))];

      // Extract phone-like patterns from text (Malaysia format: +60, 0X, (60 X))
      const phonePattern = /(\+?60\s?[\d\s-]{8,}|0[1-9][-.\s]?[\d]{4}[-.\s]?[\d]{4}|\(60\s\d\)\s[\d\s-]{7,}|1[3-4]00[-.\s]?[\d]{6})/g;
      const textPhones = document.body.innerText.match(phonePattern) || [];
      data.phoneTexts = [...new Set(textPhones)];

      return data;
    }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
    } catch (e) {
      console.log(`[Crawler] Structured data extraction timeout for ${url}`);
    }

    await page.close();

    return {
      url,
      text: pageText,
      html: pageHTML,
      structuredData,
      success: true,
    };
  } catch (error) {
    if (page) await page.close();
    
    console.log(`[Crawler] Error crawling ${url}:`, error.message);
    return {
      url,
      text: '',
      html: '',
      structuredData: {},
      success: false,
      error: error.message,
    };
  }
};

/**
 * Crawl a domain and collect content from multiple relevant pages
 */
const crawlDomain = async (domain, targetPages = null) => {
  let browser = null;
  const results = {
    domain,
    pages: [],
    errors: null,
  };

  try {
    browser = await chromium.launch({ headless: true });
    
    // Priority pages to crawl
    const priorityPages = targetPages || [
      '/',
      '/contact',
      '/contact-us',
      '/about',
      '/about-us',
      '/team',
      '/support',
      '/help',
      '/help/contact/contact-us',
      '/help/contact-us'
    ];

    let pagesToCrawl = [];

    // Start with homepage
    const homeUrl = `${domain}/`;
    console.log(`[Crawler] Starting crawl of ${domain}`);

    const homePage = await crawlPage(homeUrl, browser);
    if (homePage.success) {
      results.pages.push(homePage);
      
      // Discover additional pages from homepage
      const discovered = await browser.newPage();
      await discovered.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: CRAWL_TIMEOUT }).catch(() => {});
      
      const additionalPages = await discoverPages(discovered, domain);
      await discovered.close();
      
      pagesToCrawl = Array.from(new Set([...priorityPages.map(p => `${domain}${p}`), ...additionalPages]))
        .slice(0, MAX_PAGES_PER_DOMAIN - 1);
    }

    // Crawl discovered pages
    for (const pageUrl of pagesToCrawl) {
      if (results.pages.length >= MAX_PAGES_PER_DOMAIN) break;
      
      const pageResult = await crawlPage(pageUrl, browser);
      if (pageResult.success) {
        results.pages.push(pageResult);
      }
    }

    await browser.close();
    
    console.log(`[Crawler] Crawled ${results.pages.length} pages from ${domain}`);
    return results;
  } catch (error) {
    if (browser) await browser.close();
    
    results.errors = error.message;
    console.error('[Crawler] Fatal error:', error.message);
    return results;
  }
};

module.exports = {
  crawlDomain,
  crawlPage,
  discoverPages,
  CRAWL_TIMEOUT,
  PAGE_WAIT,
  MAX_PAGES_PER_DOMAIN,
};
