const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { query, hasPostgresConfig } = require('../config/postgres');
const { extractDocumentText } = require('./productInfoService');

const TRAINING_UPLOAD_DIR = path.resolve(process.cwd(), process.env.TRAINING_UPLOAD_DIR || './uploads/training');
const CHUNK_SIZE = Number(process.env.TRAINING_TEXT_CHUNK_SIZE || 1800);
const CHUNK_OVERLAP = Number(process.env.TRAINING_TEXT_CHUNK_OVERLAP || 200);

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const safeName = (value = '') =>
  path
    .basename(String(value || 'document'))
    .replace(/[^\w.\- ]+/g, '_')
    .slice(0, 180);

const normalizeAssetKey = (value = '') => {
  const key = String(value || '').trim();
  if (!['companyInfo', 'knowledgeBase', 'salesPlaybook'].includes(key)) {
    throw new Error('Invalid training asset key');
  }
  return key;
};

const chunkText = (text = '') => {
  const clean = String(text || '').trim();
  if (!clean) return [];

  const chunks = [];
  let cursor = 0;
  while (cursor < clean.length) {
    chunks.push(clean.slice(cursor, cursor + CHUNK_SIZE).trim());
    cursor += Math.max(1, CHUNK_SIZE - CHUNK_OVERLAP);
  }
  return chunks.filter(Boolean);
};

const toAssetSummary = (row) => ({
  id: row.id,
  fileName: row.file_name,
  mimeType: row.mime_type || '',
  fileSizeBytes: Number(row.file_size_bytes || 0),
  extractedChars: Number(row.extracted_chars || 0),
  uploadedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  extractionStatus: row.extraction_status || 'completed',
});

async function saveTrainingDocument({ productInfoId, assetKey, fileName, mimeType = '', contentBase64 = '' }) {
  if (!hasPostgresConfig()) {
    throw new Error('PostgreSQL is not configured for training document storage');
  }

  const resolvedProductInfoId = String(productInfoId || 'current').trim();
  const resolvedAssetKey = normalizeAssetKey(assetKey);
  if (!fileName || !contentBase64) throw new Error('Missing required upload fields');

  const buffer = Buffer.from(contentBase64, 'base64');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const id = crypto.randomUUID();
  const targetDir = path.join(TRAINING_UPLOAD_DIR, resolvedProductInfoId, resolvedAssetKey);
  ensureDir(targetDir);

  const extension = path.extname(fileName);
  const targetPath = path.join(targetDir, `${id}${extension || ''}`);
  fs.writeFileSync(targetPath, buffer);

  let extractedText = '';
  let extractionStatus = 'completed';
  let extractionError = null;
  try {
    extractedText = await extractDocumentText({ fileName, mimeType, contentBase64 });
  } catch (error) {
    extractionStatus = 'failed';
    extractionError = error.message;
  }

  const insertResult = await query(
    `insert into training_documents
      (id, product_info_id, asset_key, file_name, mime_type, file_size_bytes, local_path, sha256, extracted_text, extraction_status, extraction_error)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning id, file_name, mime_type, file_size_bytes, length(coalesce(extracted_text, '')) as extracted_chars, extraction_status, created_at`,
    [
      id,
      resolvedProductInfoId,
      resolvedAssetKey,
      safeName(fileName),
      mimeType || '',
      buffer.length,
      targetPath,
      sha256,
      extractedText,
      extractionStatus,
      extractionError,
    ]
  );

  const chunks = chunkText(extractedText);
  if (chunks.length) {
    for (let index = 0; index < chunks.length; index += 1) {
      await query(
        `insert into training_document_chunks (document_id, chunk_index, chunk_text)
         values ($1, $2, $3)
         on conflict (document_id, chunk_index) do update set chunk_text = excluded.chunk_text`,
        [id, index, chunks[index]]
      );
    }
  }

  return toAssetSummary(insertResult.rows[0]);
}

async function listTrainingDocuments(productInfoId, assetKey = '') {
  if (!hasPostgresConfig()) return [];
  const resolvedProductInfoId = String(productInfoId || 'current').trim();
  const params = [resolvedProductInfoId];
  let where = 'product_info_id = $1';
  if (assetKey) {
    params.push(normalizeAssetKey(assetKey));
    where += ` and asset_key = $${params.length}`;
  }

  const result = await query(
    `select id, file_name, mime_type, file_size_bytes, length(coalesce(extracted_text, '')) as extracted_chars, extraction_status, created_at
     from training_documents
     where ${where}
     order by created_at asc`,
    params
  );
  return result.rows.map(toAssetSummary);
}

async function getTrainingAssetText(productInfoId, assetKey) {
  if (!hasPostgresConfig()) return '';
  const result = await query(
    `select file_name, extracted_text
     from training_documents
     where product_info_id = $1 and asset_key = $2 and extraction_status = 'completed'
     order by created_at asc`,
    [String(productInfoId || 'current').trim(), normalizeAssetKey(assetKey)]
  );

  return result.rows
    .map((row) => {
      const text = String(row.extracted_text || '').trim();
      if (!text) return '';
      return `File: ${row.file_name}\n${text}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

async function deleteTrainingDocument(productInfoId, documentId) {
  if (!hasPostgresConfig()) throw new Error('PostgreSQL is not configured for training document storage');
  const result = await query(
    `delete from training_documents
     where product_info_id = $1 and id = $2
     returning local_path`,
    [String(productInfoId || 'current').trim(), String(documentId || '').trim()]
  );

  const localPath = result.rows[0]?.local_path;
  if (localPath) {
    try {
      fs.unlinkSync(localPath);
    } catch {}
  }
  return result.rowCount > 0;
}

module.exports = {
  saveTrainingDocument,
  listTrainingDocuments,
  getTrainingAssetText,
  deleteTrainingDocument,
};
