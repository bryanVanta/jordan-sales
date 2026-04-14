const express = require('express');
const router = express.Router();
const { saveProductInfo, getProductInfo, CURRENT_DOC_ID } = require('../services/productInfoService');
const { findLeadsFromProductInfo } = require('../services/scrapingService');
const { getProductInfoCache, refreshProductInfo } = require('../services/initializationService');

router.post('/find-leads', async (req, res) => {
  try {
    let incomingProductInfo;
    const requestedProductInfoId = req.body?.productInfoId || req.query?.productInfoId || CURRENT_DOC_ID;

    if (req.body && Object.keys(req.body).length > 0) {
      // New data provided: save it and use it
      const payload = { ...(req.body || {}) };
      delete payload.productInfoId;
      delete payload.offset;
      incomingProductInfo = await saveProductInfo(requestedProductInfoId, payload);
    } else {
      // No new data: try cached version first, then fetch from Firebase
      incomingProductInfo =
        (requestedProductInfoId === CURRENT_DOC_ID ? getProductInfoCache() : null) ||
        await getProductInfo(requestedProductInfoId);
    }

    if (!incomingProductInfo) {
      return res.status(400).json({
        success: false,
        error: 'Product & Services details are required before finding leads.',
      });
    }

    const offset = parseInt(req.body?.offset || req.query?.offset || '0', 10) || 0;
    const leads = await findLeadsFromProductInfo(incomingProductInfo, offset);

    res.json({
      success: true,
      data: {
        productInfo: incomingProductInfo,
        leads,
        count: leads.length,
        offset,
      },
    });
  } catch (error) {
    console.error('Error finding leads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reload-product-info', async (req, res) => {
  try {
    const updatedProductInfo = await refreshProductInfo();

    res.json({
      success: true,
      message: 'Product & Services information reloaded from Firebase',
      data: updatedProductInfo,
    });
  } catch (error) {
    console.error('Error reloading product info:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
