/**
 * Improved strategy for extracting contact info for enterprise hotel chains
 * 
 * Problem: Direct hotel property pages are behind anti-bot protection
 * Solution: Search for hotel contact info via Google and fallback to corporate
 */

const axios = require('axios');

const SERPAPI_KEY = process.env.SERPAPI_API_KEY;

/**
 * Search for hotel contact information using SerpAPI
 * Instead of scraping the hotel page, search for "hotel name contact kuala lumpur"
 */
const searchHotelContact = async (hotelName, location) => {
  try {
    if (!SERPAPI_KEY) {
      console.log('[HotelSearch] SerpAPI not configured');
      return null;
    }

    // Try multiple search strategies to find contact info
    const searchQueries = [
      `"${hotelName}" "${location}" contact phone email`,
      `"${hotelName}" "${location}" reservations phone`,
      `"${hotelName}" ${location} contact`,
      `${hotelName} ${location} phone number`,
      `${hotelName.split(' ')[0]} hotels ${location} contact`,
    ];

    for (const query of searchQueries) {
      console.log(`[HotelSearch] Searching: "${query}"`);
      
      try {
        const response = await axios.get('https://serpapi.com/search', {
          params: {
            q: query,
            type: 'news', // Use news search for recent contact info
            api_key: SERPAPI_KEY,
            num: 5,
          },
        });

        const results = response.data.news_results || [];
        if (results.length > 0) {
          console.log(`[HotelSearch] Found ${results.length} results`);
          
          // Extract contact info from snippets
          let contactInfo = {
            emails: [],
            phones: [],
            sources: []
          };

          for (const result of results) {
            const { title, snippet, link } = result;
            const searchText = `${title} ${snippet || ''}`;

            // Extract emails
            const emailMatches = searchText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
            contactInfo.emails.push(...emailMatches);

            // Extract phone numbers (flexible for any format)
            const phoneMatches = searchText.match(/[\d\s\-\(\)\+]{10,30}/g) || [];
            phoneMatches.forEach(phone => {
              if (phone.replace(/\D/g, '').length >= 9) {
                contactInfo.phones.push(phone.trim());
              }
            });

            if (emailMatches.length > 0 || phoneMatches.length > 0) {
              contactInfo.sources.push({
                title: title.substring(0, 60),
                link: link.substring(0, 80),
                emails: emailMatches,
                phones: phoneMatches
              });
            }
          }

          if (contactInfo.emails.length > 0 || contactInfo.phones.length > 0) {
            console.log(`[HotelSearch] ✓ Found contact info in search results`);
            return contactInfo;
          }
        }
      } catch (queryError) {
        console.log(`[HotelSearch] Query failed, trying next...`);
      }
    }

    return null;
  } catch (error) {
    console.error('[HotelSearch] Search error:', error.message);
    return null;
  }
};

/**
 * For major hotel brands, try to extract from brand corporate site
 */
const extractBrandContactInfo = async (brandName, location) => {
  try {
    const { chromium } = require('playwright');
    let browser;
    
    // Map brand to corporate site + likely contact paths
    const brandMapping = {
      'hilton': { domain: 'hilton.com', paths: ['/en/reservations', '/info/about/contact-us', '/about'] },
      'hyatt': { domain: 'hyatt.com', paths: ['/contact', '/about-us', '/reservations'] },
      'marriott': { domain: 'marriott.com', paths: ['/en/contact-us', '/about', '/reservations'] },
      'four seasons': { domain: 'fourseasons.com', paths: ['/en/contact', '/about'] },
    };

    const brand = brandMapping[brandName.toLowerCase()];
    if (!brand) return null;

    console.log(`[BrandContact] Trying ${brandName} corporate site...`);
    
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Add headers to bypass bot detection
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': `https://${brand.domain}`,
    });

    let pageContent = '';

    for (const path of brand.paths) {
      try {
        const url = `https://${brand.domain}${path}`;
        console.log(`[BrandContact] Checking ${url}...`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(3000);

        pageContent = await page.content();
        
        // Look for contact info patterns
        const emails = pageContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        const phones = pageContent.match(/[\d\s\-\(\)\+]{10,30}/g) || [];
        
        if (emails.length > 0 || phones.length > 3) {
          console.log(`[BrandContact] ✓ Found contact info on ${path}`);
          await browser.close();
          return {
            source: url,
            emails: [...new Set(emails)],
            phones: [...new Set(phones)].slice(0, 5)
          };
        }
      } catch (pathError) {
        // Try next path
      }
    }

    await browser.close();
    return null;

  } catch (error) {
    console.error('[BrandContact] Error:', error.message);
    return null;
  }
};

/**
 * Use combination approach to get hotel contact info
 */
const getHotelContactInfo = async (hotelName, location, brandName) => {
  console.log(`\n[HotelExtraction] Getting contact for ${hotelName} in ${location}`);
  
  // Strategy 1: Search for this specific hotel's contact
  const specificSearch = await searchHotelContact(hotelName, location);
  if (specificSearch && (specificSearch.emails.length > 0 || specificSearch.phones.length > 0)) {
    return {
      method: 'specific-search',
      ...specificSearch
    };
  }

  // Strategy 2: Try brand corporate site
  const brandContact = await extractBrandContactInfo(brandName, location);
  if (brandContact) {
    return {
      method: 'brand-corporate',
      ...brandContact
    };
  }

  // Strategy 3: Search for generic location + hotel type
  const genericSearch = await searchHotelContact(`${brandName} hotels`, location);
  if (genericSearch && (genericSearch.emails.length > 0 || genericSearch.phones.length > 0)) {
    return {
      method: 'generic-brand-search',
      ...genericSearch
    };
  }

  return {
    method: 'not-found',
    emails: [],
    phones: []
  };
};

// Quick test
(async () => {
  const result = await getHotelContactInfo(
    'Hilton Kuala Lumpur', 
    'Kuala Lumpur, Malaysia',
    'Hilton'
  );
  
  console.log('\n✓ Result:', JSON.stringify(result, null, 2));
  process.exit(0);
})();
