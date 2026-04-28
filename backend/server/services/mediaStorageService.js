const crypto = require('crypto');
const axios = require('axios');

const CLOUDINARY_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const CLOUDINARY_API_KEY = String(process.env.CLOUDINARY_API_KEY || '').trim();
const CLOUDINARY_API_SECRET = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const CLOUDINARY_FOLDER = String(process.env.CLOUDINARY_FOLDER || 'jordan-salesbot').trim();

const TWILIO_ACCOUNT_SID = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
const TWILIO_AUTH_TOKEN = String(process.env.TWILIO_AUTH_TOKEN || '').trim();

const cloudinaryEnabled = () => Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

const withTimeout = async (promise, timeoutMs, label = 'operation') => {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return await promise;

  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const sha1Hex = (input) => crypto.createHash('sha1').update(String(input)).digest('hex');

const guessExtension = (mimeType = '') => {
  const mt = String(mimeType || '').toLowerCase();
  if (mt === 'image/jpeg') return 'jpg';
  if (mt === 'image/jpg') return 'jpg';
  if (mt === 'image/png') return 'png';
  if (mt === 'image/webp') return 'webp';
  if (mt === 'image/gif') return 'gif';
  if (mt === 'audio/ogg') return 'ogg';
  if (mt === 'audio/opus') return 'opus';
  if (mt === 'audio/mpeg') return 'mp3';
  if (mt === 'audio/mp3') return 'mp3';
  if (mt === 'audio/wav') return 'wav';
  if (mt === 'video/mp4') return 'mp4';
  return '';
};

const isHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const parseDataUrl = (value) => {
  const text = String(value || '').trim();
  const match = text.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;

  const mimeType = String(match[1] || 'application/octet-stream').trim();
  const isBase64 = Boolean(match[2]);
  const data = String(match[3] || '');
  if (!data) return null;

  try {
    const buffer = isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8');
    if (!buffer.length || buffer.length > 20 * 1024 * 1024) return null;
    return { buffer, mimeType };
  } catch {
    return null;
  }
};

const isTwilioMediaUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    return host.endsWith('twilio.com');
  } catch {
    return false;
  }
};

const downloadMediaBuffer = async ({ url, timeoutMs = 15000 }) => {
  if (!isHttpUrl(url)) throw new Error('media url must be http(s)');

  const config = {
    method: 'GET',
    url: String(url),
    responseType: 'arraybuffer',
    timeout: Number.isFinite(timeoutMs) ? Math.max(1000, Math.floor(timeoutMs)) : 15000,
    maxContentLength: 20 * 1024 * 1024,
    maxBodyLength: 20 * 1024 * 1024,
    validateStatus: (status) => status >= 200 && status < 300,
  };

  if (isTwilioMediaUrl(url) && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    config.auth = { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN };
  }

  const resp = await axios.request(config);
  const buffer = Buffer.from(resp.data);
  const contentType = String(resp.headers?.['content-type'] || '').trim();
  return { buffer, contentType };
};

const cloudinarySignature = (params, apiSecret) => {
  const pairs = Object.keys(params)
    .sort()
    .filter((key) => params[key] !== undefined && params[key] !== null && String(params[key]) !== '')
    .map((key) => `${key}=${params[key]}`);
  const base = pairs.join('&');
  return sha1Hex(`${base}${apiSecret}`);
};

const uploadBufferToCloudinary = async ({ buffer, mimeType, fileName, kind }) => {
  if (!cloudinaryEnabled()) throw new Error('cloudinary not configured');
  if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('runtime missing FormData/Blob (requires Node 18+)');
  }
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('missing media buffer');

  const resourceType = kind === 'audio' ? 'video' : 'image';
  const timestamp = Math.floor(Date.now() / 1000);

  const paramsToSign = {
    folder: CLOUDINARY_FOLDER,
    timestamp,
  };
  const signature = cloudinarySignature(paramsToSign, CLOUDINARY_API_SECRET);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/${resourceType}/upload`;
  const form = new FormData();

  const inferredExt = guessExtension(mimeType);
  const safeNameRaw = String(fileName || '').trim() || `whatsapp-${kind}-${timestamp}${inferredExt ? `.${inferredExt}` : ''}`;
  const safeName = safeNameRaw.replace(/[^\w.\-]+/g, '_').slice(0, 120);

  const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  form.append('file', blob, safeName);
  form.append('api_key', CLOUDINARY_API_KEY);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', CLOUDINARY_FOLDER);

  const resp = await fetch(endpoint, { method: 'POST', body: form });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`cloudinary upload failed (${resp.status}): ${text.slice(0, 300)}`);
  }

  const json = await resp.json().catch(() => null);
  if (!json || !json.secure_url) throw new Error('cloudinary upload returned no secure_url');

  return {
    url: String(json.secure_url),
    publicId: json.public_id ? String(json.public_id) : undefined,
    bytes: typeof json.bytes === 'number' ? json.bytes : undefined,
    resourceType,
  };
};

const normalizeMediaList = (media) => {
  if (!media) return [];
  if (Array.isArray(media)) return media.filter(Boolean);
  if (typeof media === 'object') return [media];
  return [];
};

const inferKindFromMedia = (mediaItem) => {
  const kind = String(mediaItem?.kind || '').trim().toLowerCase();
  if (kind === 'image' || kind === 'audio') return kind;

  const mimeType = String(mediaItem?.mimeType || mediaItem?.mimetype || '').trim().toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';

  return 'unknown';
};

/**
 * Best-effort media storage for inbound messages:
 * - If Cloudinary is configured and media contains a reachable URL, download and upload it.
 * - Returns the same structure with `url` swapped to the Cloudinary `secure_url` when successful.
 */
const maybeStoreInboundMedia = async ({ media, timeoutMs = 20000 } = {}) => {
  const items = normalizeMediaList(media);
  if (items.length === 0) return null;
  if (!cloudinaryEnabled()) return items.length === 1 ? items[0] : items;

  const stored = [];
  for (const item of items.slice(0, 10)) {
    try {
      const originalUrl = String(item?.url || '').trim();
      const mimeTypeHint = String(item?.mimeType || item?.mimetype || '').trim();
      const fileNameHint = String(item?.fileName || item?.filename || item?.name || '').trim();
      const kind = inferKindFromMedia(item);

      const dataUrl = parseDataUrl(originalUrl);
      if (dataUrl) {
        const mimeType = mimeTypeHint || dataUrl.mimeType || 'application/octet-stream';
        const uploaded = await withTimeout(
          uploadBufferToCloudinary({ buffer: dataUrl.buffer, mimeType, fileName: fileNameHint, kind: kind === 'audio' ? 'audio' : 'image' }),
          timeoutMs,
          'cloudinary upload'
        );

        stored.push({
          ...item,
          kind: kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : item?.kind || 'unknown',
          url: uploaded.url,
          cloudinary: {
            publicId: uploaded.publicId,
            bytes: uploaded.bytes,
            resourceType: uploaded.resourceType,
          },
          originalUrl: 'data-url',
          mimeType,
        });
        continue;
      }

      if (!originalUrl || !isHttpUrl(originalUrl)) {
        stored.push(item);
        continue;
      }

      const { buffer, contentType } = await withTimeout(
        downloadMediaBuffer({ url: originalUrl, timeoutMs: Math.min(15000, timeoutMs) }),
        timeoutMs,
        'media download'
      );

      const mimeType = mimeTypeHint || contentType || 'application/octet-stream';
      const uploaded = await withTimeout(
        uploadBufferToCloudinary({ buffer, mimeType, fileName: fileNameHint, kind: kind === 'audio' ? 'audio' : 'image' }),
        timeoutMs,
        'cloudinary upload'
      );

      stored.push({
        ...item,
        kind: kind === 'audio' ? 'audio' : kind === 'image' ? 'image' : item?.kind || 'unknown',
        url: uploaded.url,
        cloudinary: {
          publicId: uploaded.publicId,
          bytes: uploaded.bytes,
          resourceType: uploaded.resourceType,
        },
        originalUrl,
        mimeType,
      });
    } catch (error) {
      stored.push(item);
    }
  }

  return stored.length === 1 ? stored[0] : stored;
};

module.exports = {
  maybeStoreInboundMedia,
};
