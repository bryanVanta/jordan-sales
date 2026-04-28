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
const { PDFParse } = require('pdf-parse');

const COLLECTION_NAME = 'Product-Info';
const CURRENT_DOC_ID = 'current';
const TRAINING_ASSET_KEYS = ['companyInfo', 'knowledgeBase', 'salesPlaybook'];
const execFileAsync = promisify(execFile);
const DEFAULT_CUSTOMER_INSTRUCTIONS = `Jordan helps B2B sales teams create functional sales collateral that helps reps close deals, not generic documents that sit unused.

Default behavior:
- Act like a practical sales-enablement partner for revenue teams, sales leaders, and enablement professionals.
- Create situation-specific collateral: pitch decks, one-pagers, objection handling, demo scripts, playbooks, follow-up messages, and talk tracks.
- Keep outputs scannable, rep-friendly, and easy to use in live selling conversations.
- Connect every product capability to a buyer outcome, business impact, or deal-stage use case.
- Avoid overly comprehensive generic material. Prioritize what a rep can actually say, send, or do next.
- Use clear claims, concise proof points, and language sales teams would naturally use with buyers.`;

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
  personalization: {
    styleAndTone: data.personalization?.styleAndTone || 'Default',
    characteristics: data.personalization?.characteristics || '',
    customerInstructions: data.personalization?.customerInstructions || DEFAULT_CUSTOMER_INSTRUCTIONS,
    autoSales: Boolean(data.personalization?.autoSales),
    referenceMemories: data.personalization?.referenceMemories !== false,
    referenceChatHistory: data.personalization?.referenceChatHistory !== false,
  },
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

const extractViaPdfParse = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return normalizeExtractedText(parsed?.text || '');
  } finally {
    await parser.destroy().catch(() => {});
  }
};

const normalizeExtractedText = (text = '') =>
  String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 120000)
    .trim();

const extractReadableTextFromBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return '';
  const text = buffer.toString('utf8');
  const readable = text
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u024F]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /[A-Za-z0-9]{3,}/.test(line))
    .join('\n');

  return normalizeExtractedText(readable);
};

const decodePdfLiteral = (value = '') =>
  String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');

const extractBasicPdfTextFromBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return '';
  const latin = buffer.toString('latin1');
  const chunks = [];
  const literalPattern = /\((?:\\.|[^\\()]){3,}\)\s*T[jJ]/g;
  let match;

  while ((match = literalPattern.exec(latin)) && chunks.length < 3000) {
    const raw = match[0].replace(/\)\s*T[jJ]$/, '').slice(1);
    const decoded = decodePdfLiteral(raw);
    if (/[A-Za-z0-9]{3,}/.test(decoded)) chunks.push(decoded);
  }

  if (chunks.length) return normalizeExtractedText(chunks.join('\n'));
  return extractReadableTextFromBuffer(buffer);
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
  const buffer = Buffer.from(contentBase64, 'base64');
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
    return normalizeExtractedText(buffer.toString('utf8'));
  }

  try {
    if (extension === '.pdf' || mimeType === 'application/pdf') {
      try {
        const parsedText = await extractViaPdfParse(buffer);
        if (parsedText && !isLikelyGarbagePdfText(parsedText)) return parsedText;
      } catch (error) {
        console.warn(`pdf-parse extraction failed for ${fileName}:`, error.message);
      }

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
        if (stringsText && !isLikelyGarbagePdfText(stringsText)) return normalizeExtractedText(stringsText);
      } finally {
        cleanupTempFile(stringsTempPath);
      }

      const fallbackText = extractBasicPdfTextFromBuffer(buffer);
      return isLikelyGarbagePdfText(fallbackText) ? '' : fallbackText;
    }

    const tempPath = writeTempFile(fileName, contentBase64);
    try {
      const extracted = await extractViaTextUtil(tempPath);
      if (extracted) return normalizeExtractedText(extracted);
    } finally {
      cleanupTempFile(tempPath);
    }

    return extractReadableTextFromBuffer(buffer);
  } catch (error) {
    console.error(`Document extraction error for ${fileName}:`, error.message);
    if (extension === '.pdf' || mimeType === 'application/pdf') {
      return isLikelyGarbagePdfText(extractBasicPdfTextFromBuffer(buffer)) ? '' : extractBasicPdfTextFromBuffer(buffer);
    }
    return extractReadableTextFromBuffer(buffer);
  }
}

async function saveTrainingAssetForProductInfo(productInfoId, assetKey, assetData) {
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

  const resolvedId = productInfoId || CURRENT_DOC_ID;
  const docRef = db.collection(COLLECTION_NAME).doc(resolvedId);
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
      id: resolvedId,
      createdAt: existingDoc.exists ? existingData.createdAt || new Date() : new Date(),
      updatedAt: new Date(),
    },
    { merge: true }
  );

  return normalizedTrainingAssets[assetKey];
}

async function saveProductInfo(productInfoId, data) {
  const resolvedId = productInfoId || CURRENT_DOC_ID;
  const docRef = db.collection(COLLECTION_NAME).doc(resolvedId);
  const existingDoc = await docRef.get();
  const existingData = existingDoc.exists ? existingDoc.data() : {};

  // Only update fields that are explicitly provided (don't wipe with empty strings)
  const updateData = {};
  if (data.productName !== undefined) updateData.productName = data.productName;
  if (data.productType !== undefined) updateData.productType = data.productType;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.keyBenefit !== undefined) updateData.keyBenefit = data.keyBenefit;
  if (data.targetCustomer !== undefined) updateData.targetCustomer = data.targetCustomer;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.moreAboutProduct !== undefined) updateData.moreAboutProduct = data.moreAboutProduct;
  if (data.personalization !== undefined) {
    updateData.personalization = {
      ...normalizePayload(existingData).personalization,
      ...normalizePayload(data).personalization,
    };
  }

  // Preserve training assets with smart merging
  const mergedTrainingAssets = {};
  for (const key of TRAINING_ASSET_KEYS) {
    const incoming = data.trainingAssets?.[key] || {};
    const existing = existingData.trainingAssets?.[key] || {};
    // Only update if incoming has extractedText or fileName
    if (incoming.extractedText || incoming.fileName) {
      mergedTrainingAssets[key] = {
        fileName: incoming.fileName || existing.fileName || '',
        mimeType: incoming.mimeType || existing.mimeType || '',
        extractedText: incoming.extractedText || existing.extractedText || '',
        uploadedAt: incoming.uploadedAt || existing.uploadedAt || null,
      };
    } else {
      // Preserve existing if nothing new provided
      mergedTrainingAssets[key] = existing;
    }
  }

  const savedData = {
    ...existingData, // Start with existing data
    ...updateData, // Apply only specified updates
    trainingAssets: mergedTrainingAssets,
    id: resolvedId,
    createdAt: existingDoc.exists ? existingData.createdAt || new Date() : new Date(),
    updatedAt: new Date(),
  };

  await docRef.set(savedData, { merge: true });
  return savedData;
}

async function getProductInfo(productInfoId) {
  const resolvedId = productInfoId || CURRENT_DOC_ID;
  const doc = await db.collection(COLLECTION_NAME).doc(resolvedId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

module.exports = {
  saveProductInfo,
  getProductInfo,
  saveTrainingAssetForProductInfo,
  extractDocumentText,
  normalizePayload,
  COLLECTION_NAME,
  CURRENT_DOC_ID,
  DEFAULT_CUSTOMER_INSTRUCTIONS,
};
