const express = require('express');
const router = express.Router();
const { startOutreach, scrapeWithIntelligence } = require('../services/scrapingService');
const { bulkCreateLeads } = require('../services/leadsService');

/**
 * POST /api/scraping/start-outreach
 * Start outreach campaign for a product
 */
router.post('/start-outreach', async (req, res) => {
  try {
    const { productId, productName, targetCustomer, location } = req.body;

    if (!productId || !productName || !targetCustomer || !location) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: productId, productName, targetCustomer, location',
      });
    }

    // Start scraping process
    console.log(`Starting outreach for product: ${productName}`);
    const result = await startOutreach({
      productId,
      productName,
      targetCustomer,
      location,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    // Save leads to database
    if (result.leads.length > 0) {
      const savedLeads = await bulkCreateLeads(result.leads);
      return res.status(200).json({
        success: true,
        message: result.message,
        leadsCount: savedLeads.length,
        leads: savedLeads,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      leadsCount: 0,
      leads: [],
    });
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error starting outreach',
    });
  }
});

/**
 * POST /api/scraping/intelligence
 * NEW: 3-Stage scraping with LLM intelligence
 * 
 * Request body:
 * {
 *   "companyName": "Shangri-la Hotels",
 *   "domain": "https://www.shangri-la.com"
 * }
 * 
 * Returns structured contact data with confidence scores
 */
router.post('/intelligence', async (req, res) => {
  try {
    const { companyName, domain } = req.body;

    if (!companyName || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: companyName, domain',
      });
    }

    // Normalize domain
    let normalizedDomain = domain;
    if (!normalizedDomain.startsWith('http')) {
      normalizedDomain = `https://${normalizedDomain}`;
    }

    try {
      normalizedDomain = new URL(normalizedDomain).origin;
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid domain URL',
      });
    }

    console.log(`\n[API] Intelligent scraping request for ${companyName} (${normalizedDomain})`);

    // Run intelligent scraping
    const result = await scrapeWithIntelligence(companyName, normalizedDomain);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Intelligence scraping error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error with intelligent scraping',
    });
  }
});

module.exports = router;
