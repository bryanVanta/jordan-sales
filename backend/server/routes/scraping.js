const express = require('express');
const router = express.Router();
const { saveCurrentProductInfo, getCurrentProductInfo } = require('../services/productInfoService');
const { findLeadsFromProductInfo } = require('../services/scrapingService');

router.post('/find-leads', async (req, res) => {
  try {
    const incomingProductInfo = req.body && Object.keys(req.body).length > 0
      ? await saveCurrentProductInfo(req.body)
      : await getCurrentProductInfo();

    if (!incomingProductInfo) {
      return res.status(400).json({
        success: false,
        error: 'Product & Services details are required before finding leads.',
      });
    }

    const leads = await findLeadsFromProductInfo(incomingProductInfo);

    res.json({
      success: true,
      data: {
        productInfo: incomingProductInfo,
        leads,
        count: leads.length,
      },
    });
  } catch (error) {
    console.error('Error finding leads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
