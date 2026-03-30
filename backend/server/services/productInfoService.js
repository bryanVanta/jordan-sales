/**
 * Product Info Service
 * Persist the Product & Services card into a dedicated Firestore collection.
 */

const { db } = require('../config/firebase');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const COLLECTION_NAME = 'Product-Info';
const CURRENT_DOC_ID = 'current';
const TRAINING_ASSET_KEYS = ['companyInfo', 'knowledgeBase', 'salesPlaybook'];
const execFileAsync = promisify(execFile);

const normalizeAsset = (asset) => {
  if (!asset) {
    return {
      fileName: '',
      mimeType: '',
      extractedText: '',
      uploadedAt: null,
    };
  }

  if (typeof asset === 'string') {
    return {
      fileName: asset,
      mimeType: '',
      extractedText: '',
      uploadedAt: null,
    };
  }

  return {
    fileName: asset.fileName || '',
    mimeType: asset.mimeType || '',
    extractedText: asset.extractedText || '',
    uploadedAt: asset.uploadedAt || null,
  };
};

const normalizePayload = (data = {}) => ({
  productName: data.productName || '',
  productType: data.productType || '',
  description: data.description || '',
  keyBenefit: data.keyBenefit || '',
  targetCustomer: data.targetCustomer || '',
  location: data.location || '',
  moreAboutProduct: data.moreAboutProduct || '',
  trainingAssets: {
    companyInfo: normalizeAsset(data.trainingAssets?.companyInfo),
    knowledgeBase: normalizeAsset(data.trainingAssets?.knowledgeBase),
    salesPlaybook: normalizeAsset(data.trainingAssets?.salesPlaybook),
  },
});

const writeTempFile = (fileName, contentBase64) => {
  const safeName = path.basename(fileName || `asset-${Date.now()}`);
  const tempPath = path.join(os.tmpdir(), `jordan-${Date.now()}-${safeName}`);
  fs.writeFileSync(tempPath, Buffer.from(contentBase64, 'base64'));
  return tempPath;
};

const extractViaTextUtil = async (tempPath) => {
  const { stdout } = await execFileAsync('/usr/bin/textutil', ['-convert', 'txt', '-stdout', tempPath], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
};

const extractViaMdls = async (tempPath) => {
  const { stdout } = await execFileAsync('/usr/bin/mdls', ['-raw', '-name', 'kMDItemTextContent', tempPath], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.replace(/^\(null\)\s*$/i, '').trim();
};

const extractViaStrings = async (tempPath) => {
  const { stdout } = await execFileAsync('/usr/bin/strings', [tempPath], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 4)
    .slice(0, 400)
    .join('\n')
    .trim();
};

const isLikelyGarbagePdfText = (text = '') => {
  if (!text) return true;

  const sample = text.slice(0, 5000);
  const pdfMarkers = [
    /%PDF-/i,
    /\bobj\b/g,
    /\bendobj\b/g,
    /\bstream\b/g,
    /\bendstream\b/g,
    /\bxref\b/g,
    /\bstartxref\b/g,
    /ReportLab/i,
  ];

  const markerHits = pdfMarkers.reduce((count, pattern) => {
    const matches = sample.match(pattern);
    return count + (matches ? matches.length : 0);
  }, 0);

  const naturalWordMatches = sample.match(/\b[A-Za-z]{4,}\b/g) || [];
  const longWordCount = naturalWordMatches.length;
  const lineCount = sample.split('\n').length;

  return markerHits >= 6 || (markerHits >= 3 && longWordCount < 80) || (lineCount > 80 && longWordCount < 60);
};

async function extractDocumentText({ fileName = '', mimeType = '', contentBase64 = '' }) {
  if (!contentBase64) {
    return '';
  }

  const extension = path.extname(fileName).toLowerCase();
  const cleanupTempFile = (tempPath) => {
    try {
      if (tempPath && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {}
  };

  if (
    mimeType.startsWith('text/') ||
    ['.txt'].includes(extension)
  ) {
    return Buffer.from(contentBase64, 'base64').toString('utf8').trim();
  }

  try {
    if (extension === '.pdf' || mimeType === 'application/pdf') {
      const mdlsTempPath = writeTempFile(fileName, contentBase64);
      try {
        const mdlsText = await extractViaMdls(mdlsTempPath);
        if (mdlsText && !isLikelyGarbagePdfText(mdlsText)) return mdlsText;
      } catch {}
      finally {
        cleanupTempFile(mdlsTempPath);
      }

      const stringsTempPath = writeTempFile(fileName, contentBase64);
      try {
        const stringsText = await extractViaStrings(stringsTempPath);
        return isLikelyGarbagePdfText(stringsText) ? '' : stringsText;
      } finally {
        cleanupTempFile(stringsTempPath);
      }
    }

    const tempPath = writeTempFile(fileName, contentBase64);
    try {
      return await extractViaTextUtil(tempPath);
    } finally {
      cleanupTempFile(tempPath);
    }
  } catch (error) {
    console.error(`Document extraction error for ${fileName}:`, error.message);
    return '';
  }
}

async function saveTrainingAsset(assetKey, assetData) {
  const validKeys = TRAINING_ASSET_KEYS;
  if (!validKeys.includes(assetKey)) {
    throw new Error('Invalid training asset key');
  }

  let extractedText = '';
  try {
    extractedText = await extractDocumentText(assetData);
  } catch (error) {
    console.error(`Training asset extraction failed for ${assetData.fileName}:`, error.message);
    extractedText = '';
  }

  const docRef = db.collection(COLLECTION_NAME).doc(CURRENT_DOC_ID);
  const existingDoc = await docRef.get();
  const existingData = existingDoc.exists ? existingDoc.data() : {};
  const normalizedTrainingAssets = normalizePayload(existingData).trainingAssets;

  normalizedTrainingAssets[assetKey] = {
    fileName: assetData.fileName || '',
    mimeType: assetData.mimeType || '',
    extractedText,
    uploadedAt: new Date().toISOString(),
  };

  await docRef.set(
    {
      ...normalizePayload(existingData),
      trainingAssets: normalizedTrainingAssets,
      id: CURRENT_DOC_ID,
      createdAt: existingDoc.exists ? existingData.createdAt || new Date() : new Date(),
      updatedAt: new Date(),
    },
    { merge: true }
  );

  return normalizedTrainingAssets[assetKey];
}

async function saveCurrentProductInfo(data) {
  const payload = normalizePayload(data);
  const docRef = db.collection(COLLECTION_NAME).doc(CURRENT_DOC_ID);
  const existingDoc = await docRef.get();
  const existingData = existingDoc.exists ? existingDoc.data() : {};

  // Merge training assets: preserve extractedText and uploadedAt from Firebase
  // so that saving the form never wipes previously uploaded asset content.
  const mergedTrainingAssets = {};
  for (const key of TRAINING_ASSET_KEYS) {
    const incoming = payload.trainingAssets[key] || {};
    const existing = existingData.trainingAssets?.[key] || {};
    mergedTrainingAssets[key] = {
      ...incoming,
      extractedText: incoming.extractedText || existing.extractedText || '',
      uploadedAt: incoming.uploadedAt || existing.uploadedAt || null,
    };
  }

  const savedData = {
    ...payload,
    trainingAssets: mergedTrainingAssets,
    id: CURRENT_DOC_ID,
    createdAt: existingDoc.exists ? existingData.createdAt || new Date() : new Date(),
    updatedAt: new Date(),
  };

  await docRef.set(savedData, { merge: true });
  return savedData;
}

async function getCurrentProductInfo() {
  const doc = await db.collection(COLLECTION_NAME).doc(CURRENT_DOC_ID).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

module.exports = {
  saveCurrentProductInfo,
  getCurrentProductInfo,
  saveTrainingAsset,
  extractDocumentText,
  normalizePayload,
  COLLECTION_NAME,
  CURRENT_DOC_ID,
};
