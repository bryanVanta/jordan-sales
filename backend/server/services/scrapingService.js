/**
 * Scraping Service
 */

const axios = require('axios');
const { chromium } = require('playwright');
const { crawlDomain } = require('./crawlService');
const { extractContacts, aggregateResults } = require('./extractionService');

const SERPAPI_KEY = process.env.SERPAPI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODELS = (process.env.OPENROUTER_FILTER_MODELS ||
  'openai/gpt-oss-120b:free,openai/gpt-4o-mini,meta-llama/llama-3.1-8b-instruct:free,google/gemini-2.0-flash-exp:free')
  .split(',')
  .map(m => m.trim())
  .filter(Boolean);
const STRICT_AI_FILTER = process.env.STRICT_AI_FILTER !== 'false';
const OPENAI_FILTER_MODEL = process.env.OPENAI_FILTER_MODEL || 'gpt-4o-mini';
const MIN_AI_KEEP = Number.parseInt(process.env.MIN_AI_KEEP || '3', 10);

const extractJsonPayload = (text = '') => {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch { }
  }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try { return JSON.parse(objectMatch[0]); } catch { }
  }
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) {
    try { return JSON.parse(arrayMatch[0]); } catch { }
  }
  return null;
};

const extractKeepIndices = (text = '', maxLen = 0) => {
  const payload = extractJsonPayload(text);
  if (payload && Array.isArray(payload.keep)) {
    return payload.keep.filter(i => Number.isInteger(i) && i >= 0 && i < maxLen);
  }

  // Fallback: parse any numeric array that looks like keep indices.
  const arrayMatch = text.match(/\[(\s*\d+\s*(,\s*\d+\s*)*)\]/);
  if (arrayMatch?.[0]) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter(i => Number.isInteger(i) && i >= 0 && i < maxLen);
      }
    } catch { }
  }

  return [];
};

const callOpenRouterWithFallback = async (messages, options = {}) => {
  if (!OPENROUTER_API_KEY) return null;
  const models = OPENROUTER_MODELS.length > 0 ? OPENROUTER_MODELS : ['openai/gpt-4o-mini'];

  for (const model of models) {
    try {
      const response = await axios.post(
        `${OPENROUTER_BASE_URL}/chat/completions`,
        {
          model,
          messages,
          temperature: options.temperature ?? 0,
          max_tokens: options.maxTokens ?? 700,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { model, content: response.data?.choices?.[0]?.message?.content || '' };
    } catch (error) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.error?.message || error.message;
      console.log(`[AI Filter] Model ${model} failed (${status || 'no-status'}): ${msg}`);
    }
  }

  return null;
};

const callOpenAIWithFallback = async (messages, options = {}) => {
  if (!OPENAI_API_KEY) return null;
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: options.model || OPENAI_FILTER_MODEL,
        messages,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 700,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return {
      provider: 'openai',
      model: options.model || OPENAI_FILTER_MODEL,
      content: response.data?.choices?.[0]?.message?.content || '',
    };
  } catch (error) {
    const status = error?.response?.status;
    const msg = error?.response?.data?.error?.message || error.message;
    console.log(`[AI Filter] OpenAI fallback failed (${status || 'no-status'}): ${msg}`);
    return null;
  }
};

const callAIWithFallback = async (messages, options = {}) => {
  const openRouterResult = await callOpenRouterWithFallback(messages, options);
  if (openRouterResult) {
    return { provider: 'openrouter', ...openRouterResult };
  }
  return callOpenAIWithFallback(messages, options);
};

/**
 * Use AI to extract actual hotel names from page content
 */
const extractHotelNamesFromContent = async (pageContent, searchQuery) => {
  try {
    if (!OPENROUTER_API_KEY) {
      console.log('[AI] OpenRouter not configured, returning empty');
      return [];
    }

    const prompt = `You are an expert at extracting business names from hotel booking pages.

I'm scraping a page about: ${searchQuery}

Here's the page content (first 2000 chars):
${pageContent.substring(0, 2000)}

TASK: Extract 5-10 ACTUAL HOTEL NAMES from this page content. 
These should be real hotel names like "Marriott Grand Hotel", "Hilton Kuala Lumpur", etc.
NOT website titles or category names.

Return ONLY a JSON array of hotel names, no other text. Example:
["Hotel Name 1", "Hotel Name 2", "Hotel Name 3"]`;

    const ai = await callAIWithFallback(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 500 }
    );
    if (!ai) return [];
    const content = ai.content;
    
    // Parse JSON response
    const jsonMatch = content.match(/\[.*\]/s);
    if (jsonMatch) {
      const hotelNames = JSON.parse(jsonMatch[0]);
      console.log(`[AI] Extracted ${hotelNames.length} hotel names`);
      return hotelNames;
    }

    return [];
  } catch (error) {
    console.error('[AI] Error extracting hotel names:', error.message);
    return [];
  }
};

/**
 * Use AI to dynamically filter out aggregators, directories, agencies, and blogs
 * and return only genuine company sites offering the target service.
 */
const llmFilterResults = async (results, targetCustomer, location = '', sector = '') => {
  try {
    if (results.length === 0) {
      return results;
    }

    if (!OPENROUTER_API_KEY && !OPENAI_API_KEY) {
      console.log('[AI Filter] No AI provider key configured.');
      return STRICT_AI_FILTER ? [] : results;
    }

    const domainsText = results
      .map((r, i) => `[${i}] URL: ${r.website} | Domain: ${new URL(r.website).hostname} | Title: ${r.title || r.companyName || ''} | Snippet: ${r.snippet || ''}`)
      .join('\n');

    const prompt = `Classify EACH search result for B2B lead scraping.

Target customer: "${targetCustomer}"
Location: "${location}"
Sector: "${sector}"

Rules:
1) keep ONLY official websites of real operating businesses in this sector (restaurant operators in this case).
2) reject aggregators/directories/listicles/blog/media/reviews/forum/reddit.
3) reject job boards/recruitment portals/franchise marketplaces/investment portals.
4) reject mall/store-category pages and generic "best/top/list" pages.
5) if uncertain, reject.

Results:
${domainsText}

Return ONLY strict JSON object:
{
  "decisions": [
    { "i": 0, "label": "genuine_company|aggregator|job_board|media_or_blog|directory|marketplace_or_franchise|professional_service|unknown", "confidence": 0.0, "keep": true }
  ]
}`;

    const ai = await callAIWithFallback([{ role: 'user', content: prompt }], { temperature: 0, maxTokens: 900 });
    if (!ai) {
      console.log('[AI Filter] All provider/model attempts failed.');
      return STRICT_AI_FILTER ? [] : results;
    }

    let keepIndices = [];
    const parsed = extractJsonPayload(ai.content);
    if (parsed && Array.isArray(parsed.decisions)) {
      keepIndices = parsed.decisions
        .filter(d => Number.isInteger(d?.i))
        .filter(d => d.i >= 0 && d.i < results.length)
        .filter(d => d.keep === true || (d.label === 'genuine_company' && Number(d.confidence || 0) >= 0.65))
        .map(d => d.i);
    }
    if (keepIndices.length === 0) {
      keepIndices = extractKeepIndices(ai.content, results.length);
    }
    if (keepIndices.length === 0) {
      const repairPrompt = `Convert this output into STRICT JSON only.

Original output:
${ai.content}

Required format:
{"decisions":[{"i":0,"label":"genuine_company","confidence":0.9,"keep":true}]}

Rules:
- keep only valid indices that appear in the original output.
- if none, return {"keep":[],"decisions":[]}.
- no markdown, no explanation.`;

      const repaired = await callAIWithFallback([{ role: 'user', content: repairPrompt }], { temperature: 0, maxTokens: 400 });
      if (repaired) {
        const repairedParsed = extractJsonPayload(repaired.content);
        if (repairedParsed && Array.isArray(repairedParsed.decisions)) {
          keepIndices = repairedParsed.decisions
            .filter(d => Number.isInteger(d?.i))
            .filter(d => d.i >= 0 && d.i < results.length)
            .filter(d => d.keep === true || (d.label === 'genuine_company' && Number(d.confidence || 0) >= 0.65))
            .map(d => d.i);
        }
        if (keepIndices.length === 0) {
          keepIndices = extractKeepIndices(repaired.content, results.length);
        }
      }
    }

    if (keepIndices.length === 0) {
      const compactPrompt = `From the results list, output ONLY comma-separated indices to KEEP (example: 1,3,5). If none, output NONE.

Target: "${targetCustomer}"
Location: "${location}"
Sector: "${sector}"

Results:
${domainsText}`;
      const compact = await callAIWithFallback([{ role: 'user', content: compactPrompt }], { temperature: 0, maxTokens: 120 });
      if (compact?.content) {
        const raw = compact.content.trim();
        if (!/^none$/i.test(raw)) {
          keepIndices = (raw.match(/\d+/g) || [])
            .map(n => Number.parseInt(n, 10))
            .filter(i => Number.isInteger(i) && i >= 0 && i < results.length);
        }
      }
    }

    if (keepIndices.length === 0 && STRICT_AI_FILTER) {
      const fallbackHeuristic = results.filter(r =>
        isLikelyCompanyWebsite({
          url: r.website,
          title: r.title || r.companyName || '',
          snippet: r.snippet || '',
          targetCustomer,
          location,
          sector,
        })
      );
      console.log(`[AI Filter] Could not parse usable keep indices from ${ai.provider}:${ai.model}. Falling back to heuristic gate (${fallbackHeuristic.length}/${results.length}).`);
      return fallbackHeuristic;
    }

    const aiKept = results.filter((_, i) => keepIndices.includes(i));
    let filtered = aiKept.filter(r =>
      isLikelyCompanyWebsite({
        url: r.website,
        title: r.title || r.companyName || '',
        snippet: r.snippet || '',
        targetCustomer,
        location,
        sector,
      })
    );

    if (filtered.length < MIN_AI_KEEP) {
      const heuristic = results.filter(r =>
        isLikelyCompanyWebsite({
          url: r.website,
          title: r.title || r.companyName || '',
          snippet: r.snippet || '',
          targetCustomer,
          location,
          sector,
        })
      );
      const seen = new Set(filtered.map(r => r.website));
      for (const r of heuristic) {
        if (filtered.length >= MIN_AI_KEEP) break;
        if (!seen.has(r.website)) {
          filtered.push(r);
          seen.add(r.website);
        }
      }
    }

    console.log(`[AI Filter] ${ai.provider}:${ai.model} retained ${filtered.length} out of ${results.length} results (${aiKept.length} before post-check).`);
    return filtered;
  } catch (error) {
    console.error('[AI Filter] Error:', error.message);
    return STRICT_AI_FILTER ? [] : results;
  }
};

/**
 * Search for a specific company's website using SerpAPI
 */
const searchCompanyWebsite = async (companyName, location) => {
  try {
    if (!SERPAPI_KEY) {
      throw new Error('SERPAPI_KEY not configured');
    }

    // Search specifically for this company's official website
    const searchQueries = [
      `${companyName} official website ${location}`,
      `${companyName} ${location} contact`,
      `${companyName} website`,
      `${companyName} ${location}`,
    ];

    for (const searchQuery of searchQueries) {
      console.log(`[CompanySearch] Searching for "${companyName}": "${searchQuery}"`);
      
      try {
        const response = await axios.get('https://serpapi.com/search', {
          params: {
            q: searchQuery,
            type: 'search',
            api_key: SERPAPI_KEY,
            num: 5,
          },
        });

        if (response.data.organic_results && response.data.organic_results.length > 0) {
          const topResult = response.data.organic_results[0];
          console.log(`[CompanySearch] Found primary: ${topResult.link}`);
          
          // Try to access contact page if available
          let contactPageUrl = null;
          try {
            const baseUrl = new URL(topResult.link);
            const potentialContactUrls = [
              `${baseUrl.origin}/contact`,
              `${baseUrl.origin}/contact-us`,
              `${baseUrl.origin}/en/contact`,
              topResult.link, // fallback to original
            ];
            contactPageUrl = potentialContactUrls[0]; // default to /contact
          } catch (urlError) {
            contactPageUrl = topResult.link;
          }
          
          return {
            website: topResult.link,
            contactPage: contactPageUrl,
            title: topResult.title,
            snippet: topResult.snippet,
          };
        }
      } catch (queryError) {
        console.log(`[CompanySearch] Query failed, trying next...`);
      }
    }

    console.log(`[CompanySearch] No results found for ${companyName}`);
    return null;
  } catch (error) {
    console.error('[CompanySearch] Error:', error.message);
    return null;
  }
};

/**
 * Search for companies using SerpAPI
 */
// Extract company name from domain URL
const extractCompanyNameFromDomain = (url) => {
  try {
    const domain = new URL(url).hostname.toLowerCase();
    const cleanDomain = domain.replace('www.', '');
    
    // Map common domains to company names
    const companyMap = {
      'marriott': 'Marriott',
      'fourseasons': 'Four Seasons',
      'intercontinental': 'InterContinental',
      'sheraton': 'Sheraton',
      'hilton': 'Hilton',
      'hyatt': 'Hyatt',
      'accor': 'Accor',
      'mandarin': 'Mandarin Oriental',
      'shangrila': 'Shangri-La',
      'peninsula': 'The Peninsula',
    };
    
    // Check the ENTIRE domain (hostname) first for brand matches
    // This handles subdomains like kualalumpur.intercontinental.com
    for (const [key, company] of Object.entries(companyMap)) {
      if (cleanDomain.includes(key)) {
        return company;
      }
    }
    
    // If no brand found, get the main domain part and prettify it
    const parts = cleanDomain.split('.');
    const mainDomain = parts[0];
    return prettyCompanyNameFromSlug(mainDomain);
  } catch (error) {
    return 'Unknown';
  }
};

/**
 * Sector-specific configurations for filtering
 */
const sectorConfigs = {
  hotel: {
    brands: /marriott|fourseasons|intercontinental|hilton|sheraton|hyatt|accor|shangri|peninsula|mandarin|sofitel|ibis|novotel|pullman|parkroyal|thistle|crowne|wyndham|radisson|reikartz|premier|ihg|starwood|ritz|westin|palace|raffles|belmond|oberoi|taj|leela/i,
    keywords: /hotel|inn|resort|motel|accommodation|lodge|hospitality/i,
  },
  restaurant: {
    brands: /mcdonald|burger king|kfc|pizza hut|subway|taco bell|chick-fil-a|wendy|starbucks|chipotle|panda express|olive garden|applebee|buffalo wild|outback|red lobster|popeyes|chick-fil|in-n-out|shake shack|five guys|smashburger|panera|noodles|pho|ramen|sushi|thai|italian|french|indian|steakhouse|bbq|grill/i,
    keywords: /restaurant|cafe|diner|bistro|pizzeria|food|dining|eatery|cuisine|pub|bar|brasserie|tavern/i,
  },
  manufacturer: {
    brands: /siemens|bosch|philips|samsung|lg|panasonic|toyota|volkswagen|bmw|mercedes|audi|hp|dell|lenovo|apple|microsoft/i,
    keywords: /manufacture|factory|production|industry|engineering/i,
  },
  retail: {
    brands: /amazon|walmart|target|costco|ikea|h&m|zara|gap|nike|adidas|puma|uniqlo/i,
    keywords: /retail|store|shop|ecommerce|commerce/i,
  },
  software: {
    brands: /microsoft|google|apple|amazon|ibm|oracle|salesforce|adobe|atlassian|jetbrains/i,
    keywords: /software|technology|saas|cloud|development/i,
  },
};

/**
 * Generic aggregator/directory blocklist - works across all sectors
 */
const genericAggregatorDomains = /facebook\.com|instagram\.com|twitter\.com|tiktok\.com|linkedin\.com|youtube\.com|reddit\.com|yelp\.com|wikipedia\.org|reservations\.com|audleytravel\.com|virtuoso\.com|klook\.com|getyourguide\.com|viator\.com|skyscanner|wanderlust|onetravel|google\..*\/maps|google\..*\/travel|booking\.com|booking(?!$)|hotels\.com|agoda|expedia|trivago|kayak|hostelworld|airbnb|vrbo|tripadvisor|momondo|mrandmrssmith|hotelchains|hoteltonight|orbitz|priceline|lastminute|google.*travel|travelweekly|travelandleisure|fodors|timeout|lonelyplanet|directory|companies|listings|portal|site|platform|guide(?!s\.)|travel(?:ers?)?[-_]?agency|tour[-_]?operator|vacation[-_]?rental|travel.*aggregat|travel.*booking|travel.*search|blog|aggregat|search-results|results\.com|find.*\.com|list.*\.com|all\.accor|worlds?50?best|theworlds|worldsbesthotels|reviews\.|review-|rating|ratings|googleplaces|maps\.google/i;

/**
 * Restaurant-specific aggregator list
 */
const restaurantAggregatorDomains = /zomato\.com|deliveroo\.com|ubereats|doordash|foodpanda|grubhub|seamless|eatstreet|justeat|deliveryclub|foodora|grab\.com.*food|lalamove|honestbee|hungryhub|slurrp|fatsecret|yelp\.com|tripadvisor.*restaurant|googleplaces|review|ratings|food.*deliv|restaurant.*review|dine(?!r\.)|order.*online|delivery.*service|food.*guide|best.*restaurant|top.*restaurant|where.*eat/i;

/**
 * Parent company portal patterns - these are GROUP pages, not specific hotel properties
 * E.g., ihg.com/kuala-lumpur-malaysia is a portal listing many IHG hotels, not a specific property
 * Only match LOCATION LISTING pages, not specific property booking pages
 */
const parentCompanyPortalPaths = /\/(properties|locations|destinations|search|directory|guide|all-properties|careers|investors|about)\/?$|(kuala-lumpur|bangkok|singapore|dubai|london|tokyo|sydney|paris)[-\s]?(malaysia|thailand|philippines|uae|uk|japan)?$|\/kuala-lumpur[-\s]?|\/bangkok[-\s]?|\/singapore[-\s]?|\/dubai[-\s]?/i;

/**
 * Generic aggregator URL patterns - works across all sectors
 */
const genericAggregatorPaths = /\/search\/?$|\/results|\/find-|\/listings?|\/destinations|\/locality|\/collection|\/category|\/browse|\/search|\/find\?|\/filter|top-\d+|best-\d+|\/compare|\/destination\/city|\/hoteldetail|\/hotel\/|\/hotels\/|\/search-results|\?|&search/i;

/**
 * Generic company intent signals that work across sectors.
 */
const companyIntentSignals = /official|about|contact|team|company|corporate|careers|services?|solutions?|products?|portfolio|clients?/i;
const nonCompanyContentSignals = /blog|news|press|media|review|rating|guide|directory|top\s?\d+|best\s?\d+|comparison|vs\.?|list of|where to|things to do|aggregator/i;
const nonOfficialPathSignals = /(blog|news|press|article|stories|insights|review|guide|directory|list|top|best|category|store-category|tag|collections?|search|results?|jobs?|jobsearch|careers?|franchise|opportunit(?:y|ies)|knowledge|forum|threads?|questions?|how-to|must-try|where-to-eat|things-to-do|food-chains|chains?-in|in-malaysia)/i;
const publisherOrServiceSignals = /(travel|visitor|bucketlist|magazine|editorial|media|newsroom|cpa|accounting|tax|advisory|consulting|lawfirm|attorney|recruit|jobstreet|maukerja|indeed)/i;

const normalizeHost = (urlOrHost = '') => {
  try {
    const host = urlOrHost.includes('://') ? new URL(urlOrHost).hostname : urlOrHost;
    return host.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
};

const inferSectorFromTarget = (targetCustomer = '', sector = '') => {
  const text = `${targetCustomer} ${sector}`.toLowerCase();
  if (/restaurant|cafe|diner|bistro|eatery|food/.test(text)) return 'restaurant';
  if (/hotel|resort|accommodation|inn|lodge/.test(text)) return 'hotel';
  if (/software|saas|app|technology|tech/.test(text)) return 'software';
  if (/retail|store|shop|ecommerce/.test(text)) return 'retail';
  if (/manufactur|factory|industrial|production/.test(text)) return 'manufacturer';
  return sector || 'hotel';
};

/**
 * Sector-agnostic validator to keep only likely official business websites.
 */
const isLikelyCompanyWebsite = ({ url = '', title = '', snippet = '', targetCustomer = '', location = '', sector = '' }) => {
  const host = normalizeHost(url);
  if (!host) return false;

  const pageText = `${title} ${snippet}`.toLowerCase();
  const urlLower = url.toLowerCase();
  let pathname = '/';
  try {
    pathname = new URL(url).pathname.toLowerCase() || '/';
  } catch {
    pathname = '/';
  }

  const isAggregatorDomain = genericAggregatorDomains.test(host);
  const isAggregatorPath = genericAggregatorPaths.test(urlLower);
  const looksLikeListingOrArticle = nonCompanyContentSignals.test(pageText) || nonOfficialPathSignals.test(urlLower);
  const isParentPortal = parentCompanyPortalPaths.test(urlLower);
  const isGoogleTravel = /google/i.test(host) && /\/travel/.test(urlLower);
  const looksLikePublisherOrService = publisherOrServiceSignals.test(host) || publisherOrServiceSignals.test(pageText);

  if (isAggregatorDomain || isAggregatorPath || looksLikeListingOrArticle || isParentPortal || isGoogleTravel || looksLikePublisherOrService) {
    return false;
  }

  const hasCompanyIntentSignal = companyIntentSignals.test(pageText) ||
    /\/(about|contact|company|corporate|careers|services?|solutions?|products?)\b/i.test(urlLower);
  const isLikelyHomepage = pathname === '/' || /^\/[a-z0-9-]+\/?$/.test(pathname);
  const hasBusinessEntitySignal = /\b(hotel|resort|restaurant|cafe|group|company|official|inc|llc|ltd|sdn|berhad|corp|clinic|studio|agency)\b/i.test(`${title} ${snippet}`);
  const domainToken = host.split('.')[0].replace(/[-_]/g, ' ').trim();
  const normalizedDomainToken = domainToken.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const normalizedPageText = pageText.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const titleMentionsDomain = normalizedDomainToken.length >= 4 && normalizedPageText.includes(normalizedDomainToken);

  const effectiveSector = inferSectorFromTarget(targetCustomer, sector);
  const targetTokens = targetCustomer
    .toLowerCase()
    .split(/\s+/)
    .filter(token => token.length > 3 && !['company', 'business', 'services', 'service', 'best', 'list', 'directory'].includes(token));
  const targetMatch = targetTokens.length === 0 || targetTokens.some(token => pageText.includes(token) || host.includes(token));
  const locationTokens = location
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(token => token.length > 3 && !['federal', 'territory', 'malaysia'].includes(token));
  const locationMatch = locationTokens.length > 0 && locationTokens.some(token => pageText.includes(token) || host.includes(token));
  const sectorKeywordMatch = effectiveSector === 'restaurant'
    ? /\b(restaurant|cafe|dining|eatery|bistro|food)\b/i.test(`${title} ${snippet}`)
    : effectiveSector === 'hotel'
      ? /\b(hotel|resort|hospitality|inn|lodge)\b/i.test(`${title} ${snippet}`)
      : false;
  const brandHomepageSignal = isLikelyHomepage && titleMentionsDomain && /\b(home|official)\b/i.test(pageText);

  const confidenceScore =
    (hasCompanyIntentSignal ? 1 : 0) +
    (isLikelyHomepage ? 1 : 0) +
    (hasBusinessEntitySignal ? 1 : 0) +
    (titleMentionsDomain ? 1 : 0);

  // Require at least one strong company signal and relevance via target/location/sector,
  // while still allowing clear brand homepages (e.g., "Brand: Home").
  return confidenceScore >= 1 && (targetMatch || locationMatch || sectorKeywordMatch || brandHomepageSignal);
};

const searchCompanies = async (targetCustomer, location, query, sector = 'hotel') => {
  try {
    if (!SERPAPI_KEY) {
      throw new Error('SERPAPI_KEY not configured');
    }

    const effectiveSector = inferSectorFromTarget(targetCustomer, sector);
    console.log(`[SerpAPI] Using sector: ${effectiveSector}`);

    // Generate better search queries - try multiple approaches
    let searchQueries = [
      `${targetCustomer} ${location}`,
      `${targetCustomer} companies ${location}`,
      `best ${targetCustomer} in ${location}`,
      `list of ${targetCustomer} in ${location}`,
      `${targetCustomer} directory ${location}`,
    ];

    // For hotels, add brand-specific searches
    if (effectiveSector === 'hotel') {
      // Add searches for specific high-end hotel brands in this location
      const hotelBrands = ['Marriott', 'Four Seasons', 'Hilton', 'Hyatt', 'Sheraton', 'InterContinental', 'Mandarin Oriental'];
      const brandQueries = hotelBrands.map(brand => `${brand} ${location} hotel`);
      searchQueries = [...searchQueries, ...brandQueries];
    }

    // For restaurants, add more specific queries targeting actual websites
    else if (effectiveSector === 'restaurant') {
      searchQueries = [
        `${location} restaurants cafe business`,
        `restaurant group ${location}`,
        `fine dining restaurants ${location}`,
        `best local restaurants ${location}`,
        `cafe restaurant operator ${location}`,
        `restaurant chain Malaysia`,
      ];
    }

    let results = [];
    
    // Try each search query and collect results (don't stop after first success)
    for (let i = 0; i < searchQueries.length && results.length < 20; i++) {
      const searchQuery = searchQueries[i];
      console.log(`[SerpAPI] Searching (attempt ${i + 1}/${searchQueries.length}): "${searchQuery}"`);
      
      try {
        const response = await axios.get('https://serpapi.com/search', {
          params: {
            q: searchQuery,
            type: 'search',
            api_key: SERPAPI_KEY,
            num: 10,
          },
        });

        console.log(`[SerpAPI] Response status`, response.status);
        console.log(`[SerpAPI] Organic results count:`, response.data.organic_results?.length || 0);

        if (response.data.organic_results && response.data.organic_results.length > 0) {
          response.data.organic_results.forEach((result) => {
            if (results.length >= 25) return; // Stop at 25 results max
            
            const url = result.link;
            const title = result.title || '';
            const domain = new URL(url).hostname.toLowerCase();
            
            const isSectorSpecificAggregator =
              effectiveSector === 'restaurant' &&
              (restaurantAggregatorDomains.test(domain) || restaurantAggregatorDomains.test(title));
            const shouldInclude = !isSectorSpecificAggregator && isLikelyCompanyWebsite({
              url,
              title,
              snippet: result.snippet || '',
              targetCustomer,
              location,
              sector: effectiveSector,
            });
            
            if (shouldInclude) {
              // Extract company name from domain instead of using title
              const companyName = extractCompanyNameFromDomain(url);
              
              // Check if this exact company+domain combo already exists (prevent duplicates)
              const isDuplicate = results.some(r => 
                r.companyName === companyName && r.website === result.link
              );
              
              if (!isDuplicate) {
                results.push({
                  companyName: companyName,
                  website: result.link,
                  snippet: result.snippet,
                });
                console.log(`[SerpAPI] âœ“ Added: ${companyName}`);
              }
            } else {
              let reason = 'not likely an official company site';
              if (isSectorSpecificAggregator) reason = 'sector aggregator';
              console.log(`[SerpAPI] âœ— Filtered out (${reason}): ${title}`);
            }
          });
          
          if (results.length === 0) {
            console.log(`[SerpAPI] All results were filtered, trying next query...`);
          }
        } else {
          console.log(`[SerpAPI] No organic results for this query, trying next approach...`);
        }
      } catch (queryError) {
        console.error(`[SerpAPI] Error with query attempt ${i + 1}:`, queryError.message);
        if (i === searchQueries.length - 1) {
          throw queryError; // Last attempt failed, throw error
        }
      }
    }

    // STEP 2: Try Google Places/Maps results for more hotel listings
    console.log(`\n[SerpAPI] Attempting Google Places search for "${location} ${targetCustomer}"...`);
    try {
      const placesResponse = await axios.get('https://serpapi.com/search', {
        params: {
          q: `${targetCustomer} near ${location}`,
          location: location,
          google_domain: 'google.com',
          api_key: SERPAPI_KEY,
          num: 10,
        },
      });

      // Check multiple possible Places data structures from SerpAPI
      const placesData = placesResponse.data.places || 
                        placesResponse.data.local_results || 
                        placesResponse.data.map_results || 
                        placesResponse.data.places_results || 
                        [];

      if (Array.isArray(placesData) && placesData.length > 0) {
        console.log(`[SerpAPI] Places/Local results count: ${placesData.length}`);
        
        placesData.forEach((place) => {
          if (results.length >= 30) return; // Stop at 30 results total
          
          // Handle different Places result structures
          const placeName = place.title || place.name || place.business_name || '';
          const placeWebsite = place.website || place.link || place.url || '';
          const placePhone = place.phone || place.phone_number || '';
          
          if (!placeName || !placeWebsite) return; // Skip if no name or website
          
          // Filter out aggregators and non-company websites from Places results
          if (
            genericAggregatorDomains.test(placeWebsite) ||
            genericAggregatorDomains.test(placeName) ||
            !isLikelyCompanyWebsite({
              url: placeWebsite,
              title: placeName,
              snippet: place.address || placePhone || '',
              targetCustomer,
              location,
              sector: effectiveSector,
            })
          ) {
            console.log(`[SerpAPI Places] âœ— Skipped aggregator: ${placeName} (${placeWebsite})`);
            return;
          }
          
          // Check if already added
          const isDuplicate = results.some(r => 
            r.companyName.toLowerCase() === placeName.toLowerCase() ||
            r.website === placeWebsite
          );
          
          if (!isDuplicate) {
            results.push({
              companyName: placeName,
              website: placeWebsite,
              snippet: place.address || placePhone || '',
              source: 'places'
            });
            console.log(`[SerpAPI Places] âœ“ Added: ${placeName} (${placeWebsite})`);
          }
        });
      }
    } catch (placesError) {
      console.log(`[SerpAPI] Places search not available:`, placesError.message);
      // Continue with organic results only
    }

    // Remove duplicates based on company name (keep first occurrence)
    const uniqueResults = [];
    const seenComapnies = new Set();
    for (const result of results) {
      if (!seenComapnies.has(result.companyName)) {
        uniqueResults.push(result);
        seenComapnies.add(result.companyName);
      }
    }

    console.log(`[SerpAPI] Found ${uniqueResults.length} potential companies (pre-AI)`);
    const aiFilteredResults = await llmFilterResults(uniqueResults, targetCustomer, location, effectiveSector);
    return aiFilteredResults;
  } catch (error) {
    console.error('[SerpAPI] Search error:', error.message);
    throw error;
  }
};

const normalizeValidEmails = (emails = []) => {
  const strictEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
  const blocked = /example@|email@|test@|noreply|no-reply|donotreply|form@|submit|domain\.com|yourcompany|sample|placeholder/i;
  const blockedTlds = /(?:^|\.)(?:webp|png|jpg|jpeg|gif|svg|ico|css|js|map|woff2?|ttf|eot|mp4|webm|mov|avi|pdf|zip|rar)$/i;

  return [...new Set(
    emails
      .map(e => (e || '').trim().toLowerCase())
      .filter(Boolean)
      .map(e => e.replace(/^mailto:/i, ''))
      .filter(e => strictEmail.test(e))
      .filter(e => {
        const domain = e.split('@')[1] || '';
        if (!domain.includes('.')) return false;
        if (blockedTlds.test(domain)) return false;
        // Block common image sprite patterns like *@2x.webp
        if (/@\d+x\./i.test(e)) return false;
        return true;
      })
      .filter(e => !blocked.test(e))
  )];
};

const normalizeTextForPhone = (text = '') =>
  text
    .replace(/[\u00A0\u2000-\u200B\t]/g, ' ')
    .replace(/[\u2010-\u2015\u2212]/g, '-') // normalize unicode dashes
    .replace(/\s+/g, ' ');

const rankPhone = (phone = '') => {
  const normalized = phone.trim();
  const digits = normalized.replace(/\D/g, '');
  if (/^\+60/.test(normalized)) return 3;
  if (/^60/.test(digits)) return 2;
  if (/^0[1-9]/.test(normalized)) return 1;
  return 0;
};

const cleanPhoneCandidate = (phone = '') =>
  normalizeTextForPhone(phone)
    .replace(/[^\d+\-\s().]/g, '')
    .replace(/\./g, '')
    .replace(/\)\-/g, '-')
    .replace(/-{2,}/g, '-')
    .trim()
    .replace(/-\d{1,2}$/, ''); // strip trailing "-1", "-2" artifacts

const canonicalizeMyPhoneDigits = (digits = '') => {
  const d = (digits || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('60')) return d;
  if (d.startsWith('0')) return `60${d.slice(1)}`;
  return d;
};

const isLikelyValidMalaysianPhone = (phone = '') => {
  let p = cleanPhoneCandidate(phone);
  const digits = p.replace(/\D/g, '');
  if (!digits || p.startsWith('00')) return false;

  // Toll-free/special.
  if (/^(1300|1400|1800)/.test(digits)) return digits.length >= 10 && digits.length <= 11;

  // Local mobile.
  if (/^01\d/.test(digits)) return digits.length >= 10 && digits.length <= 11;

  // Local landline area codes (Malaysia common 03-09).
  if (/^0[3-9]\d/.test(digits)) return digits.length >= 9 && digits.length <= 10;

  // International +60 / 60 equivalents.
  if (/^\+60/.test(p) || /^60/.test(digits)) {
    const local = digits.replace(/^60/, '');
    if (/^1\d/.test(local)) return local.length >= 9 && local.length <= 10;
    if (/^[3-9]\d/.test(local)) return local.length >= 8 && local.length <= 9;
    return false;
  }

  return false;
};

const mergeAndRankPhoneCandidates = (candidates = []) => {
  // candidates: [{ value: string, score: number }]
  const best = new Map(); // canonicalDigits -> { value, score, count, hasCountryCode }
  for (const c of candidates) {
    const cleaned = cleanPhoneCandidate(c.value || '');
    if (!isLikelyValidMalaysianPhone(cleaned)) continue;
    const rawDigits = cleaned.replace(/\D/g, '');
    const key = canonicalizeMyPhoneDigits(rawDigits);
    if (!key) continue;
    const prev = best.get(key);
    const nextScore = Number.isFinite(c.score) ? c.score : 0;
    const hasCountryCode = cleaned.trim().startsWith('+60') || rawDigits.startsWith('60');
    if (!prev) {
      best.set(key, { value: cleaned, score: nextScore, count: 1, hasCountryCode });
      continue;
    }
    prev.count += 1;
    // Prefer country-code formatting if we have it
    if (!prev.hasCountryCode && hasCountryCode) {
      prev.value = cleaned;
      prev.hasCountryCode = true;
    } else if (nextScore > prev.score) {
      prev.value = cleaned;
    }
    prev.score = Math.max(prev.score, nextScore);
  }

  return Array.from(best.values())
    .sort((a, b) => {
      const ra = rankPhone(a.value);
      const rb = rankPhone(b.value);
      if (rb !== ra) return rb - ra;
      if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
      return (b.score || 0) - (a.score || 0);
    })
    .map(x => x.value);
};

const prettyCompanyNameFromSlug = (slug = '') => {
  if (!slug) return 'Unknown';
  const cleaned = slug
    .replace(/^www\./i, '')
    .replace(/\.(com|net|org|my|sg|co|io|biz|info)$/i, '')
    .replace(/[_\-]+/g, ' ')
    .trim();

  if (!cleaned) return 'Unknown';
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Scrape website for contact information using Playwright
 */
const scrapeContactInfo = async (url, companyName) => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Add anti-bot detection headers to bypass Akamai, Cloudflare, etc.
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Not_A_Brand";v="8", "Chromium";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    });

    // Increase Playwright timeout and add retry logic for navigation
    const navigateWithRetries = async (page, url, retries = 3) => {
      // Try multiple navigation strategies with different wait conditions
      const strategies = [
        { waitUntil: 'domcontentloaded', timeout: 30000, name: 'domcontentloaded' },
        { waitUntil: 'load', timeout: 45000, name: 'load' },
        { waitUntil: 'networkidle', timeout: 45000, name: 'networkidle (60s timeout)' },
      ];
      
      for (const strategy of strategies) {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            console.log(`[Playwright] Navigation attempt ${attempt}/${retries} using "${strategy.name}" (timeout: ${strategy.timeout}ms)`);
            await page.goto(url, { 
              waitUntil: strategy.waitUntil, 
              timeout: strategy.timeout 
            });
            console.log(`[Playwright] âœ“ Navigation successful with strategy "${strategy.name}"`);
            return true; // Navigation successful
          } catch (error) {
            if (attempt === retries) {
              console.log(`[Playwright] Strategy "${strategy.name}" failed after ${retries} attempts`);
              // Try next strategy instead of throwing
              continue;
            }
            console.log(`[Playwright] Strategy "${strategy.name}" attempt ${attempt} failed, retrying...`);
          }
        }
      }
      
      // If all strategies fail, try once more with minimal waiting
      try {
        console.log(`[Playwright] Attempting minimal-wait fallback navigation...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(3000); // Give JS time to execute
        return true;
      } catch (finalError) {
        throw new Error(`Failed to navigate to ${url} after all strategies: ${finalError.message}`);
      }
    };

    await navigateWithRetries(page, url);
    
    // Wait longer for dynamic content - hotel booking sites need significant time
    // For enterprise sites like Hilton/Hyatt, wait longer and scroll to trigger lazy loading
    await page.waitForTimeout(8000);
    
    // Scroll to trigger lazy loading of contact elements
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
      window.scrollBy(0, window.innerHeight);
      window.scrollTo(0, 0); // Scroll back to top
    });
    
    await page.waitForTimeout(5000);
    
    // Try to find contact page link first
    const contactPageLinks = await page.$$eval('a', anchors => 
      anchors
        .filter(a => /contact|reach|get in touch|inquiry|reservations?|phone|call/i.test(a.textContent || a.href))
        .map(a => a.href)
        .filter(href => href && !href.startsWith('#'))
    ).catch(() => []);
    
    // Also try common contact page paths - only on main domain
    try {
      const baseUrl = new URL(url);
      const mainDomain = baseUrl.origin; // e.g., https://www.example.com
      
      const commonPaths = [
        '/contact',
        '/contact-us',
        '/contact_us',
        '/en/contact',
        '/en/contact-us',
        '/my/contact',
        '/about/contact',
        '/info',
        '/support',
        '/help',
        '/help/contact/contact-us',
        '/help/contact-us'
      ];
      
      for (const path of commonPaths) {
        const potentialUrl = `${mainDomain}${path}`;
        contactPageLinks.push(potentialUrl);
      }
    } catch (e) {
      // Ignore URL parsing errors
    }
    
    // Filter contact links to only include main domain links
    const mainDomainOnly = contactPageLinks.filter(link => {
      try {
        const linkUrl = new URL(link);
        const pageUrl = new URL(url);
        // Only include links that match the main domain (not subdomains like blog.example.com)
        return linkUrl.hostname === pageUrl.hostname;
      } catch {
        return false;
      }
    });
    
    console.log(`[Playwright] Found ${mainDomainOnly.length} potential contact links on main domain`);
    
    let emailsFound = [];
    let phonesFound = [];
    let pageUrl = url;
    
    // Try main page first
    let content = await page.content();
    const pageText = await page.evaluate(() => document.body.innerText);
    let latestPageContent = content;
    let latestPageText = pageText;
    
    // Extract emails from HTML source first - use multiple regex patterns
    let emailMatches = [];
    
    // Pattern 1: Standard email format
    emailMatches = emailMatches.concat(content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []);
    
    // Pattern 2: Email in JSON-LD structured data (common in hotel sites)
    try {
      const jsonLdMatches = content.match(/"email"\s*:\s*"([^"]*@[^"]*)"/gi) || [];
      const extractedEmails = jsonLdMatches.map(m => m.match(/"email"\s*:\s*"([^"]*)"/i)?.[1]).filter(Boolean);
      emailMatches = emailMatches.concat(extractedEmails);
    } catch { }
    
    // Pattern 3: Email in data attributes or aria labels
    try {
      const dataAttrMatches = content.match(/(?:data-email|aria-label)="([^"]*@[^"]*)"/gi) || [];
      const extracted = dataAttrMatches.map(m => m.match(/"([^"]*@[^"]*)"/)?.[1]).filter(Boolean);
      emailMatches = emailMatches.concat(extracted);
    } catch { }
    
    // Pattern 4: Email with spaces/encoded characters (common obfuscation)
    emailMatches = emailMatches.concat(content.match(/[a-zA-Z0-9._%+-]+\s*(?:\[@at\]|@)\s*[a-zA-Z0-9.-]+\s*(?:\[\.dot\]|\.)\s*[a-zA-Z]{2,}/g) || []);
    
    console.log(`[Playwright DEBUG] HTML content length: ${content.length}, emails found: ${emailMatches.length}`, emailMatches.slice(0, 5));
    
    // Also extract emails from rendered text (JavaScript-rendered content)
    let emailsFromText = pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    console.log(`[Playwright DEBUG] pageText length: ${pageText.length}, emails found: ${emailsFromText.length}`, emailsFromText);
    emailMatches = [...new Set([...emailMatches, ...emailsFromText])];
    console.log(`[Playwright DEBUG] After combining HTML and text matches:`, emailMatches);
    
    // Extract emails from mailto: links
    let emailsFromMailto = await page.evaluate(() => {
      const emails = [];
      document.querySelectorAll('[href*="mailto:"]').forEach(elem => {
        const href = elem.getAttribute('href') || '';
        const match = href.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (match && match[1]) emails.push(match[1]);
      });
      return emails;
    });
    emailMatches = [...new Set([...emailMatches, ...emailsFromMailto])];
    
    // Deep email search on main page - look in ALL text nodes
    let deepEmailsFromDOM = [];
    if (emailMatches.length === 0) {  // Only do deep search if nothing found yet
      deepEmailsFromDOM = await page.evaluate(() => {
        const emails = new Set();
        const bodyText = document.body.innerText || '';
        const matches = bodyText.match(/[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}/g);
        if (matches) {
          matches.forEach(e => emails.add(e));
        }
        return Array.from(emails);
      });
      
      if (deepEmailsFromDOM && deepEmailsFromDOM.length > 0) {
        console.log(`[Playwright] Main page - Deep search found ${deepEmailsFromDOM.length} emails:`, deepEmailsFromDOM);
        emailMatches = [...new Set([...emailMatches, ...deepEmailsFromDOM])];
      }
    }
    
    // Filter and assign main page emails
    const mainPageEmails = [...new Set(emailMatches)];
    console.log(`[Playwright] Main page emails found (before filter):`, mainPageEmails);
    
    // Also try to find emails anywhere in the HTML and text - more aggressive approach
    let aggressiveEmails = [];
    const htmlContent = content + pageText; // Combine HTML and visible text
    const aggressiveMatch = htmlContent.match(/[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}/g) || [];
    if (aggressiveMatch && aggressiveMatch.length > mainPageEmails.length) {
      console.log(`[Playwright] Found ${aggressiveMatch.length} emails with aggressive regex (vs ${mainPageEmails.length})`, aggressiveMatch);
      aggressiveEmails = aggressiveMatch;
    }
    
    emailMatches = [...new Set([...emailMatches, ...aggressiveEmails])];
    emailsFound = normalizeValidEmails(emailMatches);
    console.log(`[Playwright] Main page emails found (after filter):`, emailsFound);
    
    // Extract phone numbers from tel: links FIRST (highest priority - from live DOM after JS executes)
    let telLinkPhones = await page.evaluate(() => {
      const telLinks = [];
      // Look for all elements with tel: links (including in iframes and data attributes)
      document.querySelectorAll('[href*="tel:"], [onclick*="tel:"], [data-href*="tel:"], a[href], button[onclick], [data-phone]').forEach(elem => {
        let phone = null;
        const href = elem.getAttribute('href') || elem.getAttribute('data-href') || elem.getAttribute('data-phone') || elem.getAttribute('onclick') || '';
        const text = elem.textContent || '';
        
        // Check href/onclick for tel: format
        if (href.includes('tel:')) {
          const match = href.match(/tel:(\+?[\d\s\-\(\)\.]+)/);
          if (match) phone = match[1];
        }
        
        // Check data-phone attributes (common in modern hotel websites)
        if (!phone && href.match(/^[\d\s\-\(\)+\.]{8,20}$/)) {
          phone = href;
        }
        
        // Also try to extract from visible text on phone-like elements or elements with aria-labels suggesting phone
        if (!phone) {
          const ariaLabel = elem.getAttribute('aria-label') || '';
          if (ariaLabel.match(/phone|call|contact/i) && text.match(/[\d\s\-\(\)\.]+/)) {
            phone = text.trim();
          }
        }
        
        if (phone) telLinks.push(phone);
      });
      return telLinks;
    });
    
    // Extract Malaysian phone numbers from visible text
    // Expanded patterns: +60X XXXX XXXX, +603 XXXX XXXX, 0X XXXX XXXX, etc.
    // Allow 2-4 digit groups for flexibility (e.g., +60 1 800 81 9047)
    const normalizedPageText = normalizeTextForPhone(pageText);
    let phoneMatches = normalizedPageText.match(
      /(\+60\s?[\d\s\-\.\(\)]{8,18})|(\+60-?[\d\s\-\.]{8,18})|(0[\d\s\-\.\(\)]{9,18})|(1800[\s\-\.]?[\d\s\-\.]{5,10})|(1300[\s\-\.]?[\d\s\-\.]{5,10})|(1400[\s\-\.]?[\d\s\-\.]{5,10})|(\(\+?60[\s\-\.]?[\d\s\-\.]{8,15})/g
    ) || [];

    // Also search raw HTML for phone-like patterns (helps when visible text is rendered/styled strangely)
    let htmlPhoneMatches = normalizeTextForPhone(content).match(
      /\+60[\s\-\.]?\d(?:[\s\-\.]?\d){7,12}|0[1-9](?:[\s\-\.]?\d){7,11}|(?:1800|1300|1400)(?:[\s\-\.]?\d){5,10}/g
    ) || [];
    phoneMatches = phoneMatches.concat(htmlPhoneMatches);

    // Context-specific extraction (e.g., "kindly contact 016-227 7075")
    const contextPhoneMatches = normalizeTextForPhone(`${content} ${pageText}`).match(
      /(?:contact|call|whatsapp|for franchising|hotline|mobile)[^0-9+]{0,30}(\+60[\s\-\.]?\d(?:[\s\-\.]?\d){7,12}|0[1-9](?:[\s\-\.]?\d){7,11})/gi
    ) || [];
    contextPhoneMatches.forEach(m => {
      const num = m.match(/(\+60[\s\-\.]?\d(?:[\s\-\.]?\d){7,12}|0[1-9](?:[\s\-\.]?\d){7,11})/i)?.[1];
      if (num) phoneMatches.push(num);
    });

    // Also search using JSON-LD schema extraction for phone (common in hotel sites with structured data)
    try {
      const schemaPhones = content.match(/"telephone"\s*:\s*"([^"]*)"/gi) || [];
      const extractedPhones = schemaPhones.map(m => m.match(/"telephone"\s*:\s*"([^"]*)"/i)?.[1]).filter(Boolean);
      phoneMatches = phoneMatches.concat(extractedPhones);
    } catch { }
    
    // Also search for numbers that might have escaped whitespace (non-breaking spaces, tabs)
    const textWithoutSpecialSpaces = normalizedPageText;
    let additionalMatches = textWithoutSpecialSpaces.match(
      /\+60\s?[\d\s]{8,18}|0[1-9]\s?[\d\s\-]{8,15}|1[34]00\s?[\d\s]{5,10}/g
    ) || [];

    const phoneCandidates = [];
    telLinkPhones.forEach(p => phoneCandidates.push({ value: p, score: 100 }));
    phoneMatches.forEach(p => phoneCandidates.push({ value: p, score: 60 }));
    additionalMatches.forEach(p => phoneCandidates.push({ value: p, score: 50 }));

    let validPhones = mergeAndRankPhoneCandidates(phoneCandidates).slice(0, 5);
    
    phonesFound = validPhones;
    
    console.log(`[Playwright] Main page: ${emailsFound.length} emails ${emailsFound.length > 0 ? '(' + emailsFound.join(', ') + ')' : ''}, ${phonesFound.length} phones`, phonesFound);
    
    // If contact data seems incomplete or noisy, try a contact-ish page to get a cleaner signal.
    const shouldTryContactPage =
      mainDomainOnly.length > 0 &&
      (
        emailsFound.length === 0 ||
        phonesFound.length === 0 ||
        phonesFound.length > 2 ||
        telLinkPhones.length === 0
      );

    if (shouldTryContactPage) {
      console.log(`[Playwright] Trying contact page for cleaner contact info...`);
      console.log(`[Playwright DEBUG] mainDomainOnly URLs:`, mainDomainOnly);
      try {
        let contactPageContent = '';
        let contactPageText = '';
        let successfulContactUrl = null;
        
	        const prioritizeContactUrl = (u) => {
	          const s = (u || '').toLowerCase();
	          // Prefer actual contact pages, avoid outlet/reservation/hash-heavy URLs.
	          if (s.includes('/contact')) return 0;
	          if (s.includes('contact-us') || s.includes('contact_us')) return 1;
	          if (s.includes('/about/contact')) return 2;
	          if (s.includes('/support') || s.includes('/help')) return 3;
	          if (s.includes('/reservations') || s.includes('#outlet')) return 9;
	          if (s.includes('#')) return 8;
	          return 5;
	        };

	        const contactUrlCandidates = Array.from(new Set(mainDomainOnly))
	          .sort((a, b) => prioritizeContactUrl(a) - prioritizeContactUrl(b))
	          .slice(0, 5);

	        // Try multiple contact URLs if first one fails or returns empty content
	        for (const contactPageUrl of contactUrlCandidates) {
          try {
            console.log(`[Playwright DEBUG] Trying contact page: ${contactPageUrl}`);
            
            // Try multiple navigation strategies for contact pages too
            let contactPageLoaded = false;
            const contactStrategies = [
              { waitUntil: 'domcontentloaded', timeout: 15000 },
              { waitUntil: 'load', timeout: 20000 },
            ];
            
            for (const strategy of contactStrategies) {
              try {
                await page.goto(contactPageUrl, strategy).catch(() => {});
                contactPageLoaded = true;
                break;
              } catch {
                // Try next strategy
              }
            }
            
            if (!contactPageLoaded) {
              continue; // Try next URL
            }
            
            // Wait for page to fully load - dynamic content
            try {
              await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
            } catch { }
            
            // Give JS time to fully render
            await page.waitForTimeout(2000);
            
            // Quick scroll to trigger lazy loading and reveal contact form
            await page.evaluate(() => {
              window.scrollBy(0, window.innerHeight * 2);
            });
            await page.waitForTimeout(1000);
            
            // Get page content
            contactPageContent = await page.content();
            contactPageText = await page.evaluate(() => document.body.innerText);
            
            console.log(`[Playwright DEBUG] Contact attempt - HTML: ${contactPageContent.length}, Text: ${contactPageText.length}`);
            
            // If we got meaningful content, use it
            if (contactPageText.length > 30 || contactPageContent.length > 500) {
              successfulContactUrl = contactPageUrl;
              latestPageContent = contactPageContent;
              latestPageText = contactPageText;
              console.log(`[Playwright] âœ“ Contact page loaded`);
              break;
            }
          } catch (urlError) {
            console.log(`[Playwright DEBUG] Contact URL failed:`, urlError.message);
            continue;
          }
        }
        
        if (successfulContactUrl === null) {
          console.log(`[Playwright] Could not find working contact page URL`);
          throw new Error('No working contact URLs');
        }
        
        // Extract emails from HTML source AND rendered text
        let contactEmailMatches = contactPageContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        let emailsFromContactText = contactPageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        
        // Extract emails from JSON-LD schema data
        try {
          const jsonLdMatches = contactPageContent.match(/"email"\s*:\s*"([^"]*@[^"]*)"/gi) || [];
          const schemaEmails = jsonLdMatches.map(m => m.match(/"email"\s*:\s*"([^"]*)"/i)?.[1]).filter(Boolean);
          emailsFromContactText = emailsFromContactText.concat(schemaEmails);
        } catch { }
        
        // Extract emails from mailto: links
        let contactEmailsFromMailto = await page.evaluate(() => {
          const emails = [];
          document.querySelectorAll('[href*="mailto:"]').forEach(elem => {
            const href = elem.getAttribute('href') || '';
            const match = href.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (match && match[1]) emails.push(match[1]);
          });
          return emails;
        });
        
        // Deep email search on contact page - look in ALL text nodes (simplified from TreeWalker)
        let deepEmailsFromDOM = [];
        if (emailMatches.length === 0) {  // Only do deep search if nothing found yet
          deepEmailsFromDOM = await page.evaluate(() => {
            const emails = new Set();
            const bodyText = document.body.innerText || '';
            const matches = bodyText.match(/[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}/g);
            if (matches) {
              matches.forEach(e => emails.add(e));
            }
            return Array.from(emails);
          });
          
          if (deepEmailsFromDOM && deepEmailsFromDOM.length > 0) {
            console.log(`[Playwright] Contact page - Deep search found ${deepEmailsFromDOM.length} emails:`, deepEmailsFromDOM);
            emailMatches = [...new Set([...emailMatches, ...deepEmailsFromDOM])];
          }
        }
        
        emailMatches = [...new Set([...contactEmailMatches, ...emailsFromContactText, ...contactEmailsFromMailto, ...deepEmailsFromDOM])];
        
        // Try aggressive regex for contact page - find any email pattern
        let aggressiveContactEmails = [];
        const contactHtmlContent = contactPageContent + ' ' + contactPageText;
        const aggressiveContactMatch = contactHtmlContent.match(/[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}/g) || [];
        if (aggressiveContactMatch && aggressiveContactMatch.length > emailMatches.length) {
          console.log(`[Playwright] Contact page - Found ${aggressiveContactMatch.length} emails with aggressive regex (vs ${emailMatches.length}):`, aggressiveContactMatch);
          aggressiveContactEmails = aggressiveContactMatch;
        }
        emailMatches = [...new Set([...emailMatches, ...aggressiveContactEmails])];
        
        // Extract phone numbers from tel: links FIRST (highest priority - from live DOM)
        let contactTelLinkPhones = await page.evaluate(() => {
          const telLinks = [];
          document.querySelectorAll('[href*="tel:"], [onclick*="tel:"], [data-href*="tel:"]').forEach(elem => {
            let phone = null;
            const content = elem.getAttribute('href') || elem.getAttribute('data-href') || elem.getAttribute('onclick') || '';
            if (content.includes('tel:')) {
              const match = content.match(/tel:(\+?[\d\s\-\(\)]+)/);
              if (match) phone = match[1];
            }
            if (phone) telLinks.push(phone);
          });
          return telLinks;
        });
        
        // Match Malaysian phone numbers from visible text - Allow flexible spacing and 2-4 digit groups
        const normalizedContactText = normalizeTextForPhone(contactPageText);
        let phoneMatches = normalizedContactText.match(/\+60[\s\.\-]?\d[\s\.\-]?\d{2,4}[\s\.\-]?\d{2,4}|0[\s\.\-]?\d[\s\.\-]?\d{2,4}[\s\.\-]?\d{2,4}|\(60[\s\.\-]?\d\)[\s\.\-]?\d{2,4}[\s\.\-]?\d{2,4}|(?:1800|1300|1400)[\s\.\-]?\d{1,4}[\s\.\-]?\d{2,4}/g) || [];
        
        // Search raw contact-page HTML for phone-like patterns
        const htmlContactPhoneMatches = normalizeTextForPhone(contactPageContent).match(
          /\+60[\s\-\.]?\d(?:[\s\-\.]?\d){7,12}|0[1-9](?:[\s\-\.]?\d){7,11}|(?:1800|1300|1400)(?:[\s\-\.]?\d){5,10}/g
        ) || [];
        phoneMatches = phoneMatches.concat(htmlContactPhoneMatches);

        // Context-specific extraction on contact page
        const contextContactPhoneMatches = normalizeTextForPhone(`${contactPageContent} ${contactPageText}`).match(
          /(?:contact|call|whatsapp|for franchising|hotline|mobile)[^0-9+]{0,30}(\+60[\s\-\.]?\d(?:[\s\-\.]?\d){7,12}|0[1-9](?:[\s\-\.]?\d){7,11})/gi
        ) || [];
        contextContactPhoneMatches.forEach(m => {
          const num = m.match(/(\+60[\s\-\.]?\d(?:[\s\-\.]?\d){7,12}|0[1-9](?:[\s\-\.]?\d){7,11})/i)?.[1];
          if (num) phoneMatches.push(num);
        });

        // Extract phone numbers from JSON-LD schema data
        try {
          const schemaTelMatches = contactPageContent.match(/"telephone"\s*:\s*"([^"]*)"/gi) || [];
          const schemaPhones = schemaTelMatches.map(m => m.match(/"telephone"\s*:\s*"([^"]*)"/i)?.[1]).filter(Boolean);
          phoneMatches = phoneMatches.concat(schemaPhones);
        } catch { }
        
        // Also try broader international format to catch all +60 numbers
        const internationalPhones = normalizedContactText.match(/\+60[\s\.\-]?\d[\s\.\-\d]{8,15}|\(\+60\)[\s\.\-\d]{8,15}/g) || [];
        const broaderMalaysia = internationalPhones.filter(p => p.includes('60'));
        if (broaderMalaysia.length > phoneMatches.length) {
          console.log(`[Playwright DEBUG] Contact page - Found additional +60 numbers with broader regex:`, broaderMalaysia);
          phoneMatches = [...new Set([...phoneMatches, ...broaderMalaysia])];
        }
        
        // Combine tel: links + text matches
        allPhoneMatches = [...contactTelLinkPhones, ...phoneMatches];
        if (allPhoneMatches.length > 0) {
          console.log(`[Playwright DEBUG] Contact page - Phone matches before filter:`, allPhoneMatches);
        }
        
        // Filter and deduplicate emails
        const allEmails = [...new Set(emailMatches)];
        console.log(`[Playwright] Contact page emails found (before filter):`, allEmails);
        emailsFound = normalizeValidEmails(emailMatches);
        console.log(`[Playwright] Contact page emails found (after filter):`, emailsFound);
        
        const contactPhoneCandidates = [];
        contactTelLinkPhones.forEach(p => contactPhoneCandidates.push({ value: p, score: 130 }));
        // Context hits (contact/call/whatsapp/hotline/mobile) are typically the "main" number.
        contextContactPhoneMatches.forEach(p => contactPhoneCandidates.push({ value: p, score: 220 }));
        phoneMatches.forEach(p => contactPhoneCandidates.push({ value: p, score: 80 }));
        let validPhones = mergeAndRankPhoneCandidates(contactPhoneCandidates).slice(0, 5);
        // MERGE contact page phones with main page phones (don't replace)
        phonesFound = Array.from(new Set([...validPhones, ...phonesFound]))
          .sort((a, b) => rankPhone(b) - rankPhone(a))
          .slice(0, 5);
        
        pageUrl = mainDomainOnly[0];
        console.log(`[Playwright] Contact page: ${emailsFound.length} emails ${emailsFound.length > 0 ? '(' + emailsFound.join(', ') + ')' : ''}, ${phonesFound.length} phones (merged)`);      } catch (contactError) {
        console.log(`[Playwright] Could not access contact page:`, contactError.message);
      }
    }
    
    // Extract other contact info
    const whatsappRegex = /wa\.me|whatsapp|whatsapp:\/\/|wa\.link/gi;
    const hasWhatsappMention = whatsappRegex.test(`${latestPageContent}\n${latestPageText}`);

    // Explicitly extract WhatsApp numbers from wa.me links
    let whatsappNumbers = [];
    try {
      whatsappNumbers = await page.evaluate(() => {
        const nums = [];
        document.querySelectorAll('a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href*="whatsapp"], a[href*="wa.link"]').forEach(a => {
          const href = a.href || '';
          const text = `${a.textContent || ''} ${a.getAttribute('aria-label') || ''}`;
          let match = href.match(/(?:wa\.me\/|phone=|whatsapp:\/\/send\?phone=)(\+?\d+)/i);
          if (!match) {
            match = text.match(/(\+?\d[\d\s\-\(\)\.]{7,})/);
          }
          if (match && match[1]) {
            nums.push(match[1].replace(/\D/g, ''));
          }
        });
        const bodyText = document.body?.innerText || '';
        const waText = bodyText.match(/whatsapp[^0-9+]{0,30}(\+?\d[\d\s\-\(\)\.]{7,})/i);
        if (waText && waText[1]) {
          nums.push(waText[1].replace(/\D/g, ''));
        }
        return nums;
      });
    } catch(e) {}
    whatsappNumbers = [...new Set(whatsappNumbers.filter(n => n.length >= 9 && n.length <= 15))];

    const hasTelegram = await page.evaluate(() =>
      !!document.querySelector('a[href*="t.me"], a[href*="telegram.me"], a[href*="telegram.org"]')
    ).catch(() => false);

    // Determine best contact channel: WhatsApp > Telegram > Email > Phone
    const hasWhatsappNumber = whatsappNumbers.length > 0;
    let preferredChannel = 'phone';
    if (emailsFound.length > 0) preferredChannel = 'email';
    if (hasTelegram) preferredChannel = 'telegram';
    if (hasWhatsappNumber) preferredChannel = 'whatsapp';

    console.log(`[Playwright] ${companyName} - Final: ${emailsFound.length} emails, ${phonesFound.length} phones, Channel: ${preferredChannel}`);

    await browser.close();

    return {
      companyName,
      emails: emailsFound.slice(0, 3),
      phones: phonesFound.slice(0, 2),
      whatsapp: whatsappNumbers.length > 0 ? whatsappNumbers.slice(0, 2) : [],
      channel: preferredChannel,
      hasWhatsapp: hasWhatsappMention || hasWhatsappNumber,
      hasTelegram,
      primaryEmail: emailsFound.length > 0 ? emailsFound[0] : null,
    };
  } catch (error) {
    console.error(`[Playwright] Error scraping ${url}:`, error.message);
    if (browser) await browser.close();
    return {
      companyName,
      emails: [],
      phones: [],
      whatsapp: [],
      channel: 'email',
      error: error.message,
      primaryEmail: null,
    };
  }
};

/**
 * Fallback: Search for hotel contact info via SerpAPI when direct scraping fails
 * This is useful for enterprise hotel chains behind bot protection
 */
const searchForHotelContactInfo = async (hotelName, location) => {
  try {
    if (!SERPAPI_KEY) {
      console.log('[HotelSearch] SerpAPI not configured');
      return null;
    }

    // Try multiple search strategies - location-specific with contact types
    const searchQueries = [
      // More specific patterns with location and contact type
      `${hotelName} ${location} email`,
      `${hotelName} ${location} contact`,
      `${hotelName} ${location} phone`,
      `"${hotelName}" ${location} email address`,
      `${hotelName.split(' ')[0]} hotel ${location} email`,
      `${hotelName} ${location} whatsapp`,
      // Fallback to broader patterns
      `"${hotelName}" contact phone`,
      `${hotelName} reservations phone`,
      `"${hotelName}" "${location}" phone`,
    ];

    for (const query of searchQueries) {
      try {
        console.log(`[HotelSearch] Query: "${query}"`);
        
        const response = await axios.get('https://serpapi.com/search', {
          params: {
            q: query,
            api_key: SERPAPI_KEY,
            num: 5,
          },
        });

        const results = response.data.organic_results || [];
        if (results.length === 0) continue;

        let contactInfo = { emails: [], phones: [], whatsapp: [], telegram: [] };

        for (const result of results) {
          const searchText = `${result.title || ''} ${result.snippet || ''}`;

          // Extract emails
          const emailMatches = searchText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
          // Sanitize emails - remove common prefixes like "Email" or "Contact"
          const sanitizedEmails = emailMatches
            .map(email => email.replace(/^(email|contact|info)?-?/i, ''))
            .filter(email => email.includes('@')); // Make sure it still has @
          contactInfo.emails.push(...sanitizedEmails);

          // Extract phone numbers - especially Malaysian/international formats
          const phoneMatches = searchText.match(/[\+\d][\d\s\-\(\)\.]{8,20}/g) || [];
          phoneMatches.forEach(phone => {
            const digits = phone.replace(/\D/g, '');
            // Accept numbers with 9-15 digits
            if (digits.length >= 9 && digits.length <= 15) {
              contactInfo.phones.push(phone.trim());
            }
          });
          
          // Extract WhatsApp mentions - prioritize API links
          if (/whatsapp|wa\.me/i.test(searchText)) {
            // First try to find WhatsApp API links (most reliable)
            const apiLinks = searchText.match(/(?:https?:\/\/)?(?:api\.)?whatsapp\.com\/send[?\w=&%.\-]*/gi) || [];
            const waLinks = searchText.match(/wa\.me\/[\d+]+/gi) || [];
            
            // Extract numbers from API links
            apiLinks.forEach(link => {
              const phoneMatch = link.match(/phone=([\d+]+)/);
              if (phoneMatch && phoneMatch[1]) {
                const digits = phoneMatch[1].replace(/\D/g, '');
                if (digits.length >= 9 && digits.length <= 15) {
                  contactInfo.whatsapp.push(digits);
                }
              }
            });
            
            // Extract numbers from wa.me links
            waLinks.forEach(link => {
              const digits = link.replace(/\D/g, '');
              if (digits.length >= 9 && digits.length <= 15) {
                contactInfo.whatsapp.push(digits);
              }
            });
            
            // Fallback: if no API links found, try text mentions
            if (contactInfo.whatsapp.length === 0) {
              const waMatches = searchText.match(/(?:whatsapp|wa)[:\s]*[\+\d][\d\s\-\(\)\.]{8,20}/gi) || [];
              waMatches.forEach(wa => {
                const digits = wa.replace(/\D/g, '').replace(/^(?:whatsapp|wa)/i, '');
                if (digits.length >= 9 && digits.length <= 15) {
                  contactInfo.whatsapp.push(digits);
                }
              });
            }
          }
          
          // Extract Telegram mentions
          if (/telegram|t\.me/i.test(searchText)) {
            const teleMatches = searchText.match(/@[\w]+/g) || [];
            teleMatches.forEach(handle => {
              // Sanitize - remove @ and any non-alphanumeric characters except underscore
              const cleanHandle = handle.replace(/^@/, '').replace(/[^\w]/g, '');
              if (cleanHandle.length > 2) { // Min 3 chars for valid Telegram handle
                contactInfo.telegram.push(cleanHandle);
              }
            });
          }
        }

        if (contactInfo.emails.length > 0 || contactInfo.phones.length > 0 || contactInfo.whatsapp.length > 0 || contactInfo.telegram.length > 0) {
          console.log(`[HotelSearch] âœ“ Found contact info: ${contactInfo.emails.length} emails, ${contactInfo.phones.length} phones, ${contactInfo.whatsapp.length} whatsapp, ${contactInfo.telegram.length} telegram`);
          // Deduplicate
          return {
            emails: [...new Set(contactInfo.emails)].slice(0, 3),
            phones: [...new Set(contactInfo.phones)].slice(0, 2),
            whatsapp: [...new Set(contactInfo.whatsapp)].slice(0, 1),
            telegram: [...new Set(contactInfo.telegram)].slice(0, 1),
            source: 'search'
          };
        }
      } catch (queryError) {
        // Try next query
      }
    }

    console.log(`[HotelSearch] No contact info found in search results`);
    return null;

  } catch (error) {
    console.error('[HotelSearch] Error:', error.message);
    return null;
  }
};

/**
 * Start outreach campaign by scraping companies
 */
const startOutreach = async (productData) => {
  try {
    const { productName, targetCustomer, location, productId, sector = 'hotel' } = productData;
    const effectiveSector = inferSectorFromTarget(targetCustomer, sector);
    const startTime = Date.now();  // Track execution time

    console.log(`\n========== STARTING OUTREACH ==========`);
    console.log(`Product: ${productName}`);
    console.log(`Target: ${targetCustomer} in ${location}`);
    console.log(`Sector: ${effectiveSector}`);
    console.log(`========================================\n`);

    // Search for companies with sector-specific filtering
    console.log(`[Outreach] Searching for ${targetCustomer} company ${location}...`);
    const searchResults = await searchCompanies(targetCustomer, location, productName, effectiveSector);

    console.log(`[Outreach] Search completed. Results:`, {
      count: searchResults?.length || 0,
      urls: searchResults?.slice(0, 3).map(r => r.website) || [],
    });

    if (!searchResults || searchResults.length === 0) {
      console.log(`[Outreach] âš ï¸  No search results found for "${targetCustomer} in ${location}"`);
      return {
        success: true,
        leadsCount: 0,
        leads: [],
        message: `No companies found for "${targetCustomer} in ${location}"`,
      };
    }

    const leads = [];
    let processedCount = 0;
    let contactsFoundCount = 0;

    // Scrape each search result directly for contact info
    for (const result of searchResults) {
      processedCount++;
      const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n[Outreach] [${processedCount}/${searchResults.length}] Processing: ${result.companyName} (${elapsedSeconds}s elapsed)`);
      console.log(`[Outreach] URL: ${result.website}`);
      
      try {
        // Scrape this hotel's website directly for contact information
        const contactInfo = await scrapeContactInfo(result.website, result.companyName);
        
        console.log(`[Contact Check] ${result.companyName}:`, {
          primaryEmail: contactInfo.primaryEmail,
          phoneCount: contactInfo.phones?.length || 0,
          phones: contactInfo.phones?.slice(0, 2) || [],
          hasError: contactInfo.error || null,
        });
        
        if (contactInfo.primaryEmail || (contactInfo.phones && contactInfo.phones.length > 0) || (contactInfo.whatsapp && contactInfo.whatsapp.length > 0)) {
          contactsFoundCount++;
          
          let finalPhone = contactInfo.phones?.[0] || null;
          let finalChannel = contactInfo.channel;
          
          if (contactInfo.whatsapp && contactInfo.whatsapp.length > 0) {
            finalPhone = contactInfo.whatsapp[0];
            finalChannel = 'whatsapp';
          }
          
          leads.push({
            companyName: contactInfo.companyName,
            email: contactInfo.primaryEmail,
            phone: finalPhone,
            channel: finalChannel,
            leadTemperature: 'NEUTRAL',
            website: result.website,
            snippet: result.snippet,
            productId,
            productName,
            scraped: true,
            scrapedAt: new Date(),
          });
          console.log(`[Outreach] âœ“ Lead created: ${result.companyName} - ${contactInfo.primaryEmail || contactInfo.phones[0]}`);
        } else {
          // FALLBACK: For hotels, try searching for contact info via Google Search if direct scraping fails
          if (effectiveSector === 'hotel') {
            console.log(`[Outreach] âš ï¸  No contact on ${result.companyName} website, trying search fallback...`);
            
            try {
              const searchContactInfo = await searchForHotelContactInfo(
                result.companyName, 
                location
              );
              
              if (searchContactInfo && (searchContactInfo.emails?.length > 0 || searchContactInfo.phones?.length > 0)) {
                contactsFoundCount++;
                
                // Determine channel priority: WhatsApp > Telegram > Email > Phone
                let searchChannel = 'phone';
                if (searchContactInfo.emails?.length > 0) searchChannel = 'email';
                if (searchContactInfo.whatsapp?.length > 0) searchChannel = 'whatsapp';
                if (searchContactInfo.telegram?.length > 0) searchChannel = 'telegram';
                
                leads.push({
                  companyName: result.companyName,
                  email: searchContactInfo.emails?.[0] || null,
                  phone: searchContactInfo.phones?.[0] || null,
                  channel: searchChannel, // Use priority: WhatsApp > Telegram > Email > Phone
                  leadTemperature: 'NEUTRAL',
                  website: result.website,
                  snippet: result.snippet,
                  productId,
                  productName,
                  scraped: true,
                  scrapedAt: new Date(),
                });
                console.log(`[Outreach] âœ“ Lead created (via search): ${result.companyName} - ${searchContactInfo.emails?.[0] || searchContactInfo.phones?.[0]}`);
              } else {
                console.log(`[Outreach] âœ— No contact info found (even via search) for ${result.website}`);
              }
            } catch (searchError) {
              console.log(`[Outreach] Search fallback failed:`, searchError.message);
              console.log(`[Outreach] âœ— No contact info found on ${result.website}`);
            }
          } else {
            console.log(`[Outreach] âœ— No contact info found on ${result.website}`);
          }
        }

      } catch (error) {
        console.error(`[Outreach] Error processing ${result.companyName}:`, error.message);
      }

      // Small delay to avoid overwhelming servers
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n========== OUTREACH COMPLETE ==========`);
    console.log(`Websites processed: ${processedCount}`);
    console.log(`Contacts found: ${contactsFoundCount}`);
    console.log(`Leads created: ${leads.length}`);
    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Total time: ${totalSeconds}s`);
    console.log(`========================================\n`);

    return {
      success: true,
      leadsCount: leads.length,
      leads,
      message: `Found ${leads.length} leads with contact info`,
    };
  } catch (error) {
    console.error('[Outreach] Error:', error.message);
    console.error(error);
    return {
      success: false,
      leadsCount: 0,
      leads: [],
      error: error.message,
    };
  }
};

/**
 * NEW: 3-Stage Scraping with LLM Intelligence
 * 
 * Stage A: Discovery (uses SerpAPI)
 * Stage B: Crawling (uses Playwright to visit multiple pages)
 * Stage C: Extraction (uses LLM + regex to parse content)
 * 
 * This returns structured contact data with confidence scores
 */
const scrapeWithIntelligence = async (companyName, domain) => {
  try {
    console.log(`\n========== INTELLIGENT SCRAPING ==========`);
    console.log(`Company: ${companyName}`);
    console.log(`Domain: ${domain}`);
    console.log(`==========================================\n`);

    // STAGE B: Crawling - Visit homepage + contact/about pages
    console.log('[Stage B] Starting crawl of domain...');
    const crawlResults = await crawlDomain(domain);
    
    if (!crawlResults.pages || crawlResults.pages.length === 0) {
      throw new Error('Failed to crawl domain');
    }

    console.log(`[Stage B] Crawled ${crawlResults.pages.length} pages`);

    // STAGE C: Extraction - Parse all pages with LLM + regex
    console.log('[Stage C] Extracting contact information...');
    
    const extractionResults = [];
    
    for (const pageResult of crawlResults.pages) {
      // Extract from each page, passing structured data for high-confidence extraction
      const extraction = await extractContacts(
        pageResult.text,
        pageResult.url,
        companyName,
        pageResult.structuredData
      );

      extractionResults.push({
        pageUrl: pageResult.url,
        ...extraction,
      });
    }

    // Aggregate results from all pages
    const aggregated = aggregateResults(extractionResults);

    // Return structured result
    const finalResult = {
      company: companyName,
      domain,
      extractionMethod: extractionResults.some(r => r.method === 'llm') ? 'hybrid (LLM+Regex)' : 'regex',
      emails: aggregated.emails.slice(0, 3),
      phones: aggregated.phones.slice(0, 3),
      whatsapp: aggregated.whatsapp.slice(0, 2),
      social: aggregated.social.slice(0, 5),
      personNames: aggregated.personNames.slice(0, 3),
      pagesScanned: aggregated.pages.length,
      confidence: {
        emailsFound: aggregated.emails.length > 0 ? Math.round(aggregated.emails[0].confidence * 100) : 0,
        phonesFound: aggregated.phones.length > 0 ? Math.round(aggregated.phones[0].confidence * 100) : 0,
      },
      scrapedAt: new Date(),
    };

    console.log(`\n========== EXTRACTION COMPLETE ==========`);
    console.log(`Emails found: ${aggregated.emails.length}`);
    console.log(`Phones found: ${aggregated.phones.length}`);
    console.log(`Pages scanned: ${aggregated.pages.length}`);
    console.log(`========================================\n`);

    return finalResult;
  } catch (error) {
    console.error('[Intelligent Scraping] Error:', error.message);
    return {
      company: companyName,
      domain,
      error: error.message,
      emails: [],
      phones: [],
      whatsapp: [],
      social: [],
    };
  }
};

module.exports = {
  searchCompanies,
  searchCompanyWebsite,
  scrapeContactInfo,
  startOutreach,
  scrapeWithIntelligence, // NEW: 3-stage LLM-powered scraping
  sectorConfigs, // Export for future configuration/extension
};
