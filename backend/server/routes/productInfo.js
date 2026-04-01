const express = require('express');
const router = express.Router();
const {
  saveCurrentProductInfo,
  getCurrentProductInfo,
  saveTrainingAsset,
} = require('../services/productInfoService');

router.get('/current', async (req, res) => {
  try {
    const productInfo = await getCurrentProductInfo();

    if (!productInfo) {
      return res.status(404).json({ success: false, error: 'No product info found' });
    }

    res.json({ success: true, data: productInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/current', async (req, res) => {
  try {
    const productInfo = await saveCurrentProductInfo(req.body);
    res.status(201).json({ success: true, data: productInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/upload-asset', async (req, res) => {
  try {
    const { assetKey, fileName, mimeType, contentBase64 } = req.body;

    if (!assetKey || !fileName || !contentBase64) {
      return res.status(400).json({ success: false, error: 'Missing required upload fields' });
    }

    const asset = await saveTrainingAsset(assetKey, { fileName, mimeType: mimeType || '', contentBase64 });
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    console.error('Training asset upload failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
