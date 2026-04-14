const express = require('express');
const router = express.Router();
const {
  saveProductInfo,
  getProductInfo,
  saveTrainingAssetForProductInfo,
  normalizePayload,
  COLLECTION_NAME,
  CURRENT_DOC_ID,
} = require('../services/productInfoService');
const { db } = require('../config/firebase');

const isValidProductInfoId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);

router.get('/', async (req, res) => {
  try {
    let snapshot;

    try {
      snapshot = await db
        .collection(COLLECTION_NAME)
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get();
    } catch (error) {
      // Be resilient to historical data with mixed `updatedAt` types (string vs Timestamp).
      snapshot = await db.collection(COLLECTION_NAME).limit(50).get();
    }

    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const docRef = db.collection(COLLECTION_NAME).doc();
    const id = docRef.id;

    const initialPayload = normalizePayload(req.body || {});
    const now = new Date();
    const record = {
      ...initialPayload,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(record, { merge: true });
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/current', async (req, res) => {
  try {
    const productInfo = await getProductInfo(CURRENT_DOC_ID);

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
    const productInfo = await saveProductInfo(CURRENT_DOC_ID, req.body);
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

    const asset = await saveTrainingAssetForProductInfo(CURRENT_DOC_ID, assetKey, { fileName, mimeType: mimeType || '', contentBase64 });
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    console.error('Training asset upload failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:productInfoId', async (req, res) => {
  try {
    const { productInfoId } = req.params;
    if (!isValidProductInfoId(productInfoId)) {
      return res.status(400).json({ success: false, error: 'Invalid productInfoId' });
    }

    const productInfo = await getProductInfo(productInfoId);
    if (!productInfo) {
      return res.status(404).json({ success: false, error: 'No product info found' });
    }

    res.json({ success: true, data: productInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:productInfoId', async (req, res) => {
  try {
    const { productInfoId } = req.params;
    if (!isValidProductInfoId(productInfoId)) {
      return res.status(400).json({ success: false, error: 'Invalid productInfoId' });
    }

    const productInfo = await saveProductInfo(productInfoId, req.body);
    res.status(201).json({ success: true, data: productInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:productInfoId/upload-asset', async (req, res) => {
  try {
    const { productInfoId } = req.params;
    if (!isValidProductInfoId(productInfoId)) {
      return res.status(400).json({ success: false, error: 'Invalid productInfoId' });
    }

    const { assetKey, fileName, mimeType, contentBase64 } = req.body;

    if (!assetKey || !fileName || !contentBase64) {
      return res.status(400).json({ success: false, error: 'Missing required upload fields' });
    }

    const asset = await saveTrainingAssetForProductInfo(productInfoId, assetKey, { fileName, mimeType: mimeType || '', contentBase64 });
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    console.error('Training asset upload failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
