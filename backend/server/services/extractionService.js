/**
 * Extraction Service - Stage C: Parse scraped content with LLM intelligence
 * 
 * This service takes raw crawled content and intelligently extracts:
 * - Emails (including obfuscated patterns)
 * - Phone numbers (region-aware, normalized)
 * - WhatsApp links
 * - Contact forms
 * - Social profiles
 * - Confidence scores
 */

const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Use LLM to intelligently extract contact info from raw content
 */
const extractContactsWithLLM = async (pageText, pageUrl, companyName) => {
  try {
    if (!OPENROUTER_API_KEY) {
      console.log('[Extraction] OpenRouter not configured, falling back to regex');
      return null;
    }

    const prompt = `You are an expert at extracting contact information from websites.

Company: ${companyName}
Page URL: ${pageUrl}
Page Text (first 3000 chars):
${pageText.substring(0, 3000)}

TASK: Extract ALL contact information you can find. Look for:
1. Email addresses (including obfuscated like "info at company dot com")
2. Phone numbers (including various formats: +60X XXXX XXXX, 03-XXXX XXXX, etc.)
3. WhatsApp links (wa.me/...)
4. Contact forms
5. Social profiles
6. Person names with titles/roles

IMPORTANT RULES:
- For emails: Only extract if they look official (not @gmail, @hotmail, @yahoo unless company uses it)
- For phones: Include region code if visible (+60 for Malaysia)
- For obfuscated emails: Convert patterns like "info [at] company [dot] com" into proper format
- Normalize phone numbers: remove spaces, dashes, but keep in readable format

Return ONLY valid JSON (no markdown, no extra text):
{
  "emails": [
    {
      "value": "email@company.com",
      "type": "support|sales|info|general",
      "confidence": 0.95,
      "notes": "found in mailto link"
    }
  ],
  "phones": [
    {
      "value": "+60312345678",
      "raw": "03-1234 5678",
      "type": "general|sales|support",
      "confidence": 0.92,
      "notes": "found in footer"
    }
  ],
  "whatsapp": [
    {
      "value": "60123456789",
      "confidence": 0.88
    }
  ],
  "social": [
    {
      "platform": "facebook|linkedin|instagram",
      "url": "https://...",
      "confidence": 0.85
    }
  ],
  "personNames": [
    {
      "name": "John Doe",
      "title": "Managing Director",
      "confidence": 0.80
    }
  ],
  "contactForm": {
    "exists": true,
    "url": "https://example.com/contact"
  },
  "summary": "Found 2 emails in contact section, 1 phone in footer"
}`;

    const response = await axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model: 'openai/gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        },
      }
    );

    const content = response.data.choices[0].message.content;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Extraction] Could not parse LLM response');
      return null;
    }

    const extracted = JSON.parse(jsonMatch[0]);
    return extracted;
  } catch (error) {
    console.error('[Extraction] LLM extraction error:', error.message);
    return null;
  }
};

/**
 * Regex-based fallback extraction for when LLM is not available
 */
const extractContactsWithRegex = (pageText, pageUrl) => {
  const results = {
    emails: [],
    phones: [],
    whatsapp: [],
    social: [],
  };

  // Email extraction with obfuscation patterns
  const emailPatterns = [
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    /([a-zA-Z0-9._%+-]+)\s*\[\s*at\s*\]\s*([a-zA-Z0-9.-]+)\s*\[\s*dot\s*\]\s*([a-zA-Z]{2,})/gi,
    /([a-zA-Z0-9._%+-]+)\s*\(\s*at\s*\)\s*([a-zA-Z0-9.-]+)\s*\(\s*dot\s*\)\s*([a-zA-Z]{2,})/gi,
    /([a-zA-Z0-9._%+-]+)\s*@\s*([a-zA-Z0-9.-]+)/g,
  ];

  emailPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(pageText)) !== null) {
      let email = match[0];
      
      // Normalize obfuscated formats
      if (match.length > 2) {
        email = `${match[1]}@${match[2]}.${match[3]}`;
      }
      
      // Filter out obvious non-company emails
      if (!email.includes('@gmail') && !email.includes('@yahoo') && !email.includes('@hotmail')) {
        results.emails.push({
          value: email.toLowerCase(),
          confidence: 0.7,
          notes: 'regex extracted',
        });
      }
    }
  });

  // Phone extraction - Malaysian focus
  const phonePatterns = [
    /\+60[\s.-]?\d[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
    /0[\s.-]?\d[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
    /\(60[\s.-]?\d\)[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
    /(?:1800|1300|1400)[\s.-]?\d{2}[\s.-]?\d{4}/g,
  ];

  phonePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(pageText)) !== null) {
      const cleaned = match[0].replace(/[\s().-]/g, '');
      const digitCount = (cleaned.match(/\d/g) || []).length;
      
      if (digitCount >= 10 && digitCount <= 12) {
        results.phones.push({
          value: match[0].trim(),
          confidence: 0.65,
          notes: 'regex extracted',
        });
      }
    }
  });

  // WhatsApp extraction
  const whatsappMatches = pageText.match(/wa\.me\/(\+?\d+)|whatsapp[:\s]+(\+?\d+)/gi) || [];
  whatsappMatches.forEach(match => {
    const number = match.replace(/[^\d+]/g, '');
    if (number && number.length >= 10) {
      results.whatsapp.push({
        value: number,
        confidence: 0.75,
      });
    }
  });

  // Social media extraction
  const socialPatterns = {
    facebook: /facebook\.com\/([a-zA-Z0-9.-]+)/gi,
    linkedin: /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9-]+)/gi,
    instagram: /instagram\.com\/([a-zA-Z0-9_.]+)/gi,
  };

  Object.entries(socialPatterns).forEach(([platform, pattern]) => {
    let match;
    while ((match = pattern.exec(pageText)) !== null) {
      results.social.push({
        platform,
        url: match[0],
        confidence: 0.7,
      });
    }
  });

  // Deduplicate
  results.emails = Array.from(new Set(results.emails.map(e => e.value))).map(value => 
    results.emails.find(e => e.value === value)
  );
  results.phones = Array.from(new Set(results.phones.map(p => p.value))).map(value => 
    results.phones.find(p => p.value === value)
  );

  return results;
};

/**
 * Main extraction function - tries structured data first, then LLM, then regex
 */
const extractContacts = async (pageText, pageUrl, companyName, structuredData = {}) => {
  console.log('[Extraction] Starting extraction for', companyName);

  const results = {
    method: 'hybrid',
    emails: [],
    phones: [],
    whatsapp: [],
    social: [],
  };

  // Process structured data first (highest confidence)
  if (structuredData.emailLinks && structuredData.emailLinks.length > 0) {
    console.log('[Extraction] Found', structuredData.emailLinks.length, 'email links');
    structuredData.emailLinks.forEach(email => {
      results.emails.push({
        value: email.toLowerCase(),
        confidence: 0.95,
        notes: 'from mailto link',
      });
    });
  }

  if (structuredData.phoneLinks && structuredData.phoneLinks.length > 0) {
    console.log('[Extraction] Found', structuredData.phoneLinks.length, 'phone links');
    structuredData.phoneLinks.forEach(phone => {
      results.phones.push({
        value: phone,
        confidence: 0.93,
        notes: 'from tel link',
      });
    });
  }

  if (structuredData.phoneTexts && structuredData.phoneTexts.length > 0) {
    console.log('[Extraction] Found', structuredData.phoneTexts.length, 'phone patterns in text');
    structuredData.phoneTexts.forEach(phone => {
      if (!results.phones.some(p => p.value.replace(/[\s.\-()]/g, '') === phone.replace(/[\s.\-()]/g, ''))) {
        results.phones.push({
          value: phone,
          confidence: 0.85,
          notes: 'from page text pattern',
        });
      }
    });
  }

  if (structuredData.emailTexts && structuredData.emailTexts.length > 0) {
    console.log('[Extraction] Found', structuredData.emailTexts.length, 'email patterns in text');
    structuredData.emailTexts.forEach(email => {
      if (!results.emails.some(e => e.value === email.toLowerCase())) {
        results.emails.push({
          value: email.toLowerCase(),
          confidence: 0.88,
          notes: 'from page text pattern',
        });
      }
    });
  }

  if (structuredData.whatsappLinks && structuredData.whatsappLinks.length > 0) {
    structuredData.whatsappLinks.forEach(link => {
      results.whatsapp.push({
        value: link,
        confidence: 0.90,
        notes: 'from WhatsApp link',
      });
    });
  }

  if (structuredData.socialLinks && structuredData.socialLinks.length > 0) {
    structuredData.socialLinks.forEach(link => {
      const platform = link.includes('facebook') ? 'facebook' : 
                       link.includes('linkedin') ? 'linkedin' :
                       link.includes('instagram') ? 'instagram' :
                       link.includes('twitter') ? 'twitter' : 'other';
      results.social.push({
        platform,
        url: link,
        confidence: 0.85,
      });
    });
  }

  // If structured data found good results, return early
  if (results.emails.length > 0 || results.phones.length > 0) {
    console.log('[Extraction] Structured data extraction successful');
    return results;
  }

  // Try LLM extraction next
  const llmExtraction = await extractContactsWithLLM(pageText, pageUrl, companyName);
  
  if (llmExtraction) {
    console.log('[Extraction] LLM extraction successful');
    return {
      method: 'llm',
      ...llmExtraction,
    };
  }

  // Fallback to regex
  console.log('[Extraction] Falling back to regex extraction');
  const regexExtraction = extractContactsWithRegex(pageText, pageUrl);
  
  return {
    method: 'regex',
    ...regexExtraction,
  };
};

/**
 * Aggregate results from multiple pages
 */
const aggregateResults = (pageResults) => {
  const aggregated = {
    emails: [],
    phones: [],
    whatsapp: [],
    social: [],
    personNames: [],
    pages: [],
  };

  pageResults.forEach(result => {
    aggregated.pages.push({
      url: result.pageUrl,
      method: result.method,
    });

    result.emails?.forEach(email => {
      if (!aggregated.emails.find(e => e.value === email.value)) {
        aggregated.emails.push(email);
      }
    });

    result.phones?.forEach(phone => {
      if (!aggregated.phones.find(p => p.value === phone.value)) {
        aggregated.phones.push(phone);
      }
    });

    result.whatsapp?.forEach(wa => {
      if (!aggregated.whatsapp.find(w => w.value === wa.value)) {
        aggregated.whatsapp.push(wa);
      }
    });

    result.social?.forEach(social => {
      if (!aggregated.social.find(s => s.url === social.url)) {
        aggregated.social.push(social);
      }
    });

    result.personNames?.forEach(person => {
      if (!aggregated.personNames.find(p => p.name === person.name)) {
        aggregated.personNames.push(person);
      }
    });
  });

  // Sort by confidence
  aggregated.emails.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  aggregated.phones.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  aggregated.social.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  return aggregated;
};

module.exports = {
  extractContacts,
  extractContactsWithLLM,
  extractContactsWithRegex,
  aggregateResults,
};
