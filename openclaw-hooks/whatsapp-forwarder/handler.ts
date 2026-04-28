type OpenClawHookEvent = {
  type?: string;
  action?: string;
  timestamp?: string | number;
  sessionKey?: string;
  context?: {
    from?: string;
    to?: string;
    content?: string;
    channelId?: string;
    metadata?: Record<string, any>;
    bodyForAgent?: string;
  };
  messages?: any[];
};

declare const process: { env: Record<string, string | undefined> };

const env = (key: string) => String(process.env[key] || '').trim();

// Optional: hardcode values here if you REALLY want (not recommended for git repos).
// Leave as empty strings to keep using environment variables.
const STATIC = {
  SALESBOT_BACKEND_URL: '',
  SALESBOT_WEBHOOK_TOKEN: '',
  CLOUDINARY_CLOUD_NAME: 'dkgwqd1yy',
  CLOUDINARY_UPLOAD_PRESET: '',
  CLOUDINARY_API_KEY: '146166915439214',
  CLOUDINARY_API_SECRET: 'FOEATuiQ4bZ00K6RBC-tS1gaBmA',
  CLOUDINARY_FOLDER: 'jordan-salesbot',
  WHATSAPP_FORWARDER_DEBUG: '',
} as const;

const cfg = (key: keyof typeof STATIC) => String((STATIC as any)[key] || env(String(key))).trim();

const CLOUDINARY_CLOUD_NAME = cfg('CLOUDINARY_CLOUD_NAME');
const CLOUDINARY_UPLOAD_PRESET = cfg('CLOUDINARY_UPLOAD_PRESET'); // unsigned upload
const CLOUDINARY_API_KEY = cfg('CLOUDINARY_API_KEY'); // signed upload (optional)
const CLOUDINARY_API_SECRET = cfg('CLOUDINARY_API_SECRET'); // signed upload (optional)
const CLOUDINARY_FOLDER = cfg('CLOUDINARY_FOLDER') || 'jordan-salesbot';

const hasFetch = () => typeof (globalThis as any)?.fetch === 'function';
const hasFormData = () => typeof (globalThis as any)?.FormData !== 'undefined';

console.log('[whatsapp-forwarder] module loaded', {
  hasFetch: hasFetch(),
  hasFormData: hasFormData(),
  cloudinaryConfigured: Boolean(CLOUDINARY_CLOUD_NAME && (CLOUDINARY_UPLOAD_PRESET || (CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET))),
  salesbotBackendUrlConfigured: Boolean(cfg('SALESBOT_BACKEND_URL')),
});

const cloudinaryEnabled = () =>
  Boolean(
    CLOUDINARY_CLOUD_NAME &&
      (CLOUDINARY_UPLOAD_PRESET || (CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) &&
      hasFetch() &&
      hasFormData()
  );

const stripTrailingSlash = (v: string) => (v.endsWith('/') ? v.slice(0, -1) : v);

const isWhatsAppChannel = (v: unknown) => {
  const s = String(v || '').toLowerCase();
  return s === 'whatsapp' || s.includes('whatsapp');
};

const normalizePhone = (v: unknown) => {
  const s = String(v || '').trim();
  if (!s) return '';
  const withoutPrefix = s.startsWith('whatsapp:') ? s.slice('whatsapp:'.length) : s;
  const withoutJid = withoutPrefix.includes('@') ? withoutPrefix.split('@')[0] : withoutPrefix;
  const digits = withoutJid.replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
};

const getTimestampIso = (v: unknown) => {
  const dt = typeof v === 'string' || typeof v === 'number' ? new Date(v as any) : null;
  if (dt && !Number.isNaN(dt.getTime())) return dt.toISOString();
  return new Date().toISOString();
};

const pickFirstString = (...values: unknown[]) => {
  for (const v of values) if (typeof v === 'string' && v.trim()) return v;
  return '';
};

const coerceBodyFromMessages = (messages: any[] | undefined) => {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  return messages
    .map((m) => {
      if (typeof m === 'string') return m;
      if (!m || typeof m !== 'object') return '';
      return pickFirstString(m.content, m.text, m.body);
    })
    .filter(Boolean)
    .join('\n')
    .trim();
};

type ForwardedMedia =
  | { kind: 'image'; url?: string; mimeType?: string; fileName?: string; provider?: string; originalUrl?: string; localPath?: string }
  | {
      kind: 'audio';
      url?: string;
      mimeType?: string;
      fileName?: string;
      provider?: string;
      originalUrl?: string;
      transcript?: string;
      localPath?: string;
    }
  | { kind: 'unknown'; url?: string; provider?: string; originalUrl?: string; localPath?: string };

const isHttpUrl = (v: unknown) => /^https?:\/\//i.test(String(v || '').trim());

const getPlaceholderKind = (bodyText: string) => {
  const m = String(bodyText || '').match(/<\s*media\s*:\s*([a-z0-9_-]+)\s*>/i);
  return m?.[1] ? String(m[1]).toLowerCase() : '';
};

const guessKindFromMime = (mimeTypeRaw: unknown): ForwardedMedia['kind'] => {
  const mt = String(mimeTypeRaw || '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('audio/')) return 'audio';
  return 'unknown';
};

const extractMedia = (event: OpenClawHookEvent, bodyText: string): ForwardedMedia[] => {
  const meta = event?.context?.metadata || {};
  const placeholderKind = getPlaceholderKind(bodyText);

  const coerceObjToMedia = (obj: any): ForwardedMedia | null => {
    if (!obj || typeof obj !== 'object') return null;
    const url = String(obj.url || obj.href || obj.src || obj.mediaUrl || obj.MediaUrl || '').trim();
    const mimeTypeRaw = String(obj.mimeType || obj.mimetype || obj.type || obj.mediaType || obj.MediaType || '').trim();
    const fileName = String(obj.fileName || obj.filename || obj.name || obj.MediaName || '').trim();
    const localPath = String(obj.path || obj.localPath || obj.filePath || obj.MediaPath || '').trim();
    const inferMimeFromName = (name: string) => {
      const n = String(name || '').trim().toLowerCase();
      if (!n) return '';
      if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
      if (n.endsWith('.png')) return 'image/png';
      if (n.endsWith('.webp')) return 'image/webp';
      if (n.endsWith('.gif')) return 'image/gif';
      if (n.endsWith('.heic')) return 'image/heic';
      if (n.endsWith('.heif')) return 'image/heif';
      if (n.endsWith('.ogg')) return 'audio/ogg';
      if (n.endsWith('.opus')) return 'audio/opus';
      if (n.endsWith('.mp3')) return 'audio/mpeg';
      if (n.endsWith('.wav')) return 'audio/wav';
      if (n.endsWith('.m4a')) return 'audio/mp4';
      if (n.endsWith('.aac')) return 'audio/aac';
      if (n.endsWith('.mp4')) return 'video/mp4';
      if (n.endsWith('.webm')) return 'video/webm';
      return '';
    };
    const mimeType = mimeTypeRaw || inferMimeFromName(fileName) || inferMimeFromName(localPath);
    const kind =
      placeholderKind === 'image'
        ? 'image'
        : placeholderKind === 'audio'
          ? 'audio'
          : guessKindFromMime(mimeType);
    if (!url && !localPath && !mimeType && !fileName) return null;
    return {
      kind: kind as any,
      url: url && isHttpUrl(url) ? url : undefined,
      mimeType: mimeType || undefined,
      fileName: fileName || undefined,
      provider: 'openclaw',
      ...(localPath ? ({ localPath } as any) : {}),
    } as any;
  };

  // Some payloads include message objects with embedded media arrays.
  const msgsRaw = (event as any)?.messages;
  if (Array.isArray(msgsRaw) && msgsRaw.length) {
    const out: ForwardedMedia[] = [];
    for (const m of msgsRaw.slice(0, 10)) {
      if (!m || typeof m !== 'object') continue;
      const embedded = (m as any).media || (m as any).attachments || (m as any).files || null;
      if (Array.isArray(embedded)) {
        for (const obj of embedded.slice(0, 10)) {
          const item = coerceObjToMedia(obj);
          if (item) out.push(item);
        }
      } else {
        const item = coerceObjToMedia(m);
        if (item) out.push(item);
      }
    }
    if (out.length) return out;
  }

  // Some OpenClaw versions may emit different shapes (arrays of objects, local paths, etc).
  // Best-effort: accept common variants so caption+image messages still carry attachments.
  const objectsRaw =
    meta.Media ?? meta.media ?? meta.attachments ?? meta.Attachment ?? meta.attachment ?? meta.files ?? meta.Files ?? undefined;
  if (Array.isArray(objectsRaw) && objectsRaw.length) {
    const out: ForwardedMedia[] = [];
    for (const obj of objectsRaw.slice(0, 10)) {
      const item = coerceObjToMedia(obj);
      if (item) out.push(item);
    }
    if (out.length) return out;
  }

  const urlsRaw =
    meta.MediaUrls ?? meta.mediaUrls ?? meta.media_urls ?? meta.MediaUrl ?? meta.mediaUrl ?? meta.media_url ?? undefined;
  const typesRaw =
    meta.MediaTypes ?? meta.mediaTypes ?? meta.media_types ?? meta.MediaType ?? meta.mediaType ?? meta.mimeType ?? meta.mimetype ?? undefined;
  const namesRaw = meta.MediaNames ?? meta.mediaNames ?? meta.filenames ?? meta.fileNames ?? undefined;
  const pathsRaw = meta.MediaPaths ?? meta.mediaPaths ?? meta.media_paths ?? meta.MediaPath ?? meta.mediaPath ?? meta.media_path ?? undefined;

  const urls = Array.isArray(urlsRaw) ? urlsRaw : typeof urlsRaw === 'string' ? [urlsRaw] : [];
  const types = Array.isArray(typesRaw) ? typesRaw : typeof typesRaw === 'string' ? [typesRaw] : [];
  const names = Array.isArray(namesRaw) ? namesRaw : typeof namesRaw === 'string' ? [namesRaw] : [];
  const paths = Array.isArray(pathsRaw) ? pathsRaw : typeof pathsRaw === 'string' ? [pathsRaw] : [];

  const count = Math.min(10, Math.max(urls.length, types.length, names.length, paths.length));
  const out: ForwardedMedia[] = [];
  for (let i = 0; i < count; i++) {
    const url = String(urls[i] || '').trim();
    const mimeType = String(types[i] || '').trim();
    const fileName = String(names[i] || '').trim();
    const localPath = String(paths[i] || '').trim();
    const kind =
      placeholderKind === 'image'
        ? 'image'
        : placeholderKind === 'audio'
          ? 'audio'
          : guessKindFromMime(mimeType);
    if (!url && !localPath && !mimeType && !fileName) continue;
    out.push({
      kind: kind as any,
      url: url && isHttpUrl(url) ? url : undefined,
      mimeType: mimeType || undefined,
      fileName: fileName || undefined,
      provider: 'openclaw',
      ...(localPath ? ({ localPath } as any) : {}),
    } as any);
  }

  if (out.length) return out;

  // If only a placeholder exists, forward a stub so backend/UI can treat it as an attachment.
  if (placeholderKind === 'image') return [{ kind: 'image', provider: 'openclaw' }];
  if (placeholderKind === 'audio') return [{ kind: 'audio', provider: 'openclaw' }];
  if (placeholderKind) return [{ kind: 'unknown', provider: 'openclaw' }];
  return [];
};

const guessExtension = (mimeType = '') => {
  const mt = String(mimeType || '').toLowerCase();
  if (mt === 'image/jpeg' || mt === 'image/jpg') return 'jpg';
  if (mt === 'image/png') return 'png';
  if (mt === 'image/webp') return 'webp';
  if (mt === 'image/gif') return 'gif';
  if (mt === 'audio/ogg') return 'ogg';
  if (mt === 'audio/opus') return 'opus';
  if (mt === 'audio/mpeg' || mt === 'audio/mp3') return 'mp3';
  if (mt === 'audio/wav') return 'wav';
  if (mt === 'video/mp4') return 'mp4';
  return '';
};

const sha1Hex = async (value: string) => {
  const subtle = (globalThis as any)?.crypto?.subtle;
  if (subtle && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(value);
    const digest = await subtle.digest('SHA-1', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // No crypto available.
  return '';
};

const stableIdHex = async (value: string) => {
  const sha1 = await sha1Hex(value);
  if (sha1) return sha1;

  // FNV-1a 32-bit (non-crypto). Used only for stable message IDs / dedupe when WebCrypto is missing.
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const bytesToBase64 = (bytes: Uint8Array) => {
  const g: any = globalThis as any;
  if (g?.Buffer) return g.Buffer.from(bytes).toString('base64');
  if (typeof g?.btoa === 'function') {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return g.btoa(s);
  }
  return '';
};

const downloadHttpUrlAsBase64 = async (urlRaw: unknown) => {
  const url = String(urlRaw || '').trim();
  if (!url || !isHttpUrl(url) || !hasFetch()) return '';
  try {
    const resp = await (globalThis as any).fetch(url, { method: 'GET' });
    if (!resp?.ok) return '';
    const ab = await resp.arrayBuffer?.();
    if (!ab || typeof ab.byteLength !== 'number') return '';
    if (ab.byteLength <= 0 || ab.byteLength > 20 * 1024 * 1024) return '';
    return bytesToBase64(new Uint8Array(ab));
  } catch {
    return '';
  }
};

const getInboundDirCandidates = () => {
  const home = '/root';
  return [
    '/tmp/openclaw/media/inbound',
    `${home}/.openclaw/media/inbound`,
    // Some installs mount under a generic "media/inbound" relative path.
    '/media/inbound',
  ];
};

const extToMime = (ext: string) => {
  const e = String(ext || '').toLowerCase();
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  if (e === '.gif') return 'image/gif';
  if (e === '.heic') return 'image/heic';
  if (e === '.heif') return 'image/heif';
  if (e === '.ogg') return 'audio/ogg';
  if (e === '.opus') return 'audio/opus';
  if (e === '.mp3') return 'audio/mpeg';
  if (e === '.wav') return 'audio/wav';
  if (e === '.m4a') return 'audio/mp4';
  if (e === '.aac') return 'audio/aac';
  if (e === '.mp4') return 'video/mp4';
  if (e === '.webm') return 'video/webm';
  return 'application/octet-stream';
};

const findLatestInboundFile = async (kind: 'image' | 'audio', opts?: { maxAgeMs?: number; notBeforeMs?: number }) => {
  // Some OpenClaw runtimes run hooks in an ESM-ish sandbox where `require` is unavailable.
  // Dynamic import works in Node ESM and keeps this hook self-contained.
  const fs = await (async () => {
    try {
      return await import('node:fs/promises');
    } catch {
      try {
        return await import('fs/promises');
      } catch {
        return null;
      }
    }
  })();
  const pathMod = await (async () => {
    try {
      return await import('node:path');
    } catch {
      try {
        return await import('path');
      } catch {
        return null;
      }
    }
  })();
  if (!fs || !pathMod) return null;

  const allowed =
    kind === 'image'
      ? new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'])
      : new Set(['.ogg', '.opus', '.mp3', '.wav', '.m4a', '.aac', '.mp4', '.webm']);

  const nowMs = Date.now();
  const maxAgeMs = Number(opts?.maxAgeMs || 60_000);
  const notBeforeMs = Number(opts?.notBeforeMs || 0);
  let best: { fullPath: string; name: string; mtimeMs: number } | null = null;

  for (const dir of getInboundDirCandidates()) {
    try {
      const names = await fs.readdir(dir);
      if (!Array.isArray(names) || names.length === 0) continue;
      const tail = names.slice(Math.max(0, names.length - 300));
      for (const name of tail) {
        const ext = String(pathMod.extname(name) || '').toLowerCase();
        if (!allowed.has(ext)) continue;
        const fullPath = pathMod.join(dir, name);
        let stat: any;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          continue;
        }
        const mtimeMs = Number(stat?.mtimeMs || 0);
        if (!Number.isFinite(mtimeMs) || mtimeMs <= 0) continue;
        if (notBeforeMs && mtimeMs < notBeforeMs) continue;
        if (nowMs - mtimeMs > maxAgeMs) continue;
        if (!best || mtimeMs > best.mtimeMs) best = { fullPath, name, mtimeMs };
      }
    } catch {
      // ignore
    }
  }

  if (!best) return null;
  const ext = String(pathMod.extname(best.name) || '').toLowerCase();
  return { path: best.fullPath, fileName: best.name, mimeType: extToMime(ext) };
};

const sleepMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForLatestInboundFile = async (
  kind: 'image' | 'audio',
  opts?: { maxAgeMs?: number; notBeforeMs?: number; timeoutMs?: number; intervalMs?: number }
) => {
  const timeoutMs = Math.max(0, Number(opts?.timeoutMs || 0));
  const intervalMs = Math.max(100, Number(opts?.intervalMs || 400));
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const found = await findLatestInboundFile(kind, { maxAgeMs: opts?.maxAgeMs, notBeforeMs: opts?.notBeforeMs });
    if (found) return found;
    if (!timeoutMs || Date.now() >= deadline) return null;
    await sleepMs(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
};

const cloudinarySignature = async (params: Record<string, string | number>, apiSecret: string) => {
  const pairs = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined && params[k] !== null && String(params[k]) !== '')
    .map((k) => `${k}=${params[k]}`);
  const sigBase = `${pairs.join('&')}${apiSecret}`;
  const sig = await sha1Hex(sigBase);
  if (!sig) throw new Error('cloudinary signed upload requires WebCrypto SHA-1');
  return sig;
};

const uploadBase64ToCloudinary = async ({
  base64,
  mimeType,
  fileName,
  kind,
}: {
  base64: string;
  mimeType: string;
  fileName: string;
  kind: 'image' | 'audio';
}) => {
  if (!cloudinaryEnabled()) return null;

  const resourceType = kind === 'audio' ? 'video' : 'image';
  const timestamp = Math.floor(Date.now() / 1000);
  const ext = guessExtension(mimeType);
  const safeNameRaw = (String(fileName || '').trim() || `whatsapp-${kind}-${timestamp}${ext ? `.${ext}` : ''}`)
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 120);
  const publicId = safeNameRaw.replace(/\.[a-z0-9]+$/i, '');

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/${resourceType}/upload`;
  const form = new (globalThis as any).FormData();
  form.append('file', `data:${mimeType || 'application/octet-stream'};base64,${base64}`);
  form.append('folder', CLOUDINARY_FOLDER);
  form.append('public_id', publicId);

  if (CLOUDINARY_UPLOAD_PRESET) {
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  } else {
    form.append('api_key', CLOUDINARY_API_KEY);
    form.append('timestamp', String(timestamp));
    const signature = await cloudinarySignature({ folder: CLOUDINARY_FOLDER, public_id: publicId, timestamp }, CLOUDINARY_API_SECRET);
    form.append('signature', signature);
  }

  const resp = await (globalThis as any).fetch(endpoint, { method: 'POST', body: form });
  if (!resp?.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`cloudinary upload failed (${resp.status}): ${String(text || '').slice(0, 200)}`);
  }
  const json = await resp.json().catch(() => null);
  const url = json?.secure_url ? String(json.secure_url) : '';
  if (!url) throw new Error('cloudinary upload returned no secure_url');
  return url;
};

const handler = async (event: OpenClawHookEvent) => {
  try {
    const hookStartMs = Date.now();
    const debug = cfg('WHATSAPP_FORWARDER_DEBUG') === '1';

    const eventType = String((event as any)?.type || '').trim().toLowerCase();
    const eventAction = String((event as any)?.action || '').trim().toLowerCase();

    // Forward only message events; accept placeholder-only payloads.
    const bodyPreviewForFilter = pickFirstString(
      (event as any)?.context?.bodyForAgent,
      (event as any)?.context?.metadata?.bodyForAgent,
      event?.context?.content,
      (event as any)?.content,
      (event as any)?.body,
      pickFirstString((event as any)?.context?.metadata?.content, (event as any)?.context?.metadata?.body),
      coerceBodyFromMessages(event?.messages)
    );
    const looksLikePlaceholder = /<\s*media\s*:/i.test(String(bodyPreviewForFilter || ''));

    if (eventType === 'message' && eventAction && eventAction !== 'received' && eventAction !== 'preprocessed' && !looksLikePlaceholder) return;

    const channelId =
      event?.context?.channelId || (event as any)?.channelId || (event as any)?.channel || (event as any)?.context?.channel || null;
    const isWhatsApp =
      isWhatsAppChannel(channelId) ||
      isWhatsAppChannel(event?.sessionKey) ||
      isWhatsAppChannel((event as any)?.context?.metadata?.channelId) ||
      isWhatsAppChannel((event as any)?.context?.metadata?.channel) ||
      false;
    if (!isWhatsApp) return;

    const backendUrlEnv = cfg('SALESBOT_BACKEND_URL');
    const backendUrl = backendUrlEnv || 'http://192.168.100.92:5000';
    const token = cfg('SALESBOT_WEBHOOK_TOKEN');

    const fromRaw = pickFirstString(
      event?.context?.from,
      (event as any)?.from,
      (event as any)?.context?.sender,
      (event as any)?.message?.from,
      (event as any)?.context?.metadata?.from,
      (event as any)?.context?.metadata?.sender
    );
    const toRaw = pickFirstString(
      event?.context?.to,
      (event as any)?.to,
      (event as any)?.context?.recipient,
      (event as any)?.message?.to,
      (event as any)?.context?.metadata?.to,
      (event as any)?.context?.metadata?.recipient
    );

    const from = normalizePhone(fromRaw);
    const to = normalizePhone(toRaw);

    const bodyText =
      String(
        pickFirstString(
          (event as any)?.context?.bodyForAgent,
          (event as any)?.context?.metadata?.bodyForAgent,
          (event as any)?.context?.body,
          (event as any)?.context?.text,
          event?.context?.content,
          (event as any)?.content,
          (event as any)?.body,
          (event as any)?.message?.content,
          (event as any)?.message?.body,
          (event as any)?.context?.metadata?.content,
          (event as any)?.context?.metadata?.body
        ) || ''
      ).trim() || coerceBodyFromMessages(event?.messages);

    const meta = (event as any)?.context?.metadata || {};
    const transcript = pickFirstString((event as any)?.transcript, (event as any)?.context?.metadata?.transcript);
    let media = extractMedia(event, bodyText);
    if (transcript) {
      media = media.map((m) => ((m as any).kind === 'audio' ? ({ ...(m as any), transcript } as any) : m));
    }

    const metaSuggestsAttachment = (value: any) => {
      if (!value || typeof value !== 'object') return false;
      const keys = Object.keys(value);
      return keys.some((k) => /(media|file|mime|attachment|image|audio|video|document|sticker)/i.test(String(k)));
    };

    // Captioned image messages sometimes include text but omit MediaUrls in the event.
    // If metadata hints an attachment but `extractMedia` returned nothing, fall back to a recent inbound file.
    if (cloudinaryEnabled() && media.length === 0 && metaSuggestsAttachment(meta)) {
      const foundImage = await findLatestInboundFile('image', { maxAgeMs: 15_000 });
      const foundAudio = foundImage ? null : await findLatestInboundFile('audio', { maxAgeMs: 15_000 });
      const found = foundImage || foundAudio;
      if (found) {
        media = [
          {
            kind: foundImage ? 'image' : 'audio',
            provider: 'openclaw',
            localPath: found.path,
            fileName: found.fileName,
            mimeType: found.mimeType,
          } as any,
        ];
      }
    }

    // Some WhatsApp/OpenClaw payloads for captioned images contain only the caption text:
    // { from, to, body, messageId, timestamp } with no media metadata at all.
    // Use a very tight image-only window so normal text messages are unlikely to inherit stale media.
    if (cloudinaryEnabled() && media.length === 0 && bodyText && !getPlaceholderKind(bodyText)) {
      const foundImage = await waitForLatestInboundFile('image', {
        maxAgeMs: 30_000,
        notBeforeMs: hookStartMs - 3_000,
        timeoutMs: 5_000,
        intervalMs: 500,
      });
      if (foundImage) {
        media = [
          {
            kind: 'image',
            provider: 'openclaw',
            localPath: foundImage.path,
            fileName: foundImage.fileName,
            mimeType: foundImage.mimeType,
          } as any,
        ];
      }
    }

    // If OpenClaw emits only a placeholder (<media:...>) but it *did* write the actual file to disk,
    // attach a best-effort localPath/fileName hint early so we can:
    // 1) generate a non-colliding synthetic messageId for distinct voice notes within the same time bucket, and
    // 2) later upload the correct file to Cloudinary.
    const placeholderKindEarly = getPlaceholderKind(bodyText);
    if (cloudinaryEnabled() && (placeholderKindEarly === 'audio' || placeholderKindEarly === 'image') && media.length) {
      const kind = placeholderKindEarly as 'audio' | 'image';
      const found = await findLatestInboundFile(kind);
      if (found) {
        for (const item of media) {
          const itemKind = (item as any).kind === 'audio' ? 'audio' : (item as any).kind === 'image' ? 'image' : null;
          if (itemKind !== kind) continue;
          (item as any).localPath = (item as any).localPath || found.path;
          (item as any).fileName = (item as any).fileName || found.fileName;
          (item as any).mimeType = (item as any).mimeType || found.mimeType;
        }
      }
    }

    // OpenClaw often emits both `message:received` and `message:preprocessed`.
    // To avoid duplicate forwards for normal text messages, only keep `preprocessed` when it adds value.
    const isPreprocessedEvent = eventType === 'message' && eventAction === 'preprocessed';
    if (isPreprocessedEvent) {
      const hasPlaceholder = Boolean(getPlaceholderKind(bodyText));
      const hasMediaFields = media.some((m: any) => Boolean(String(m?.url || '').trim()) || Boolean(String(m?.mimeType || '').trim()) || Boolean(String(m?.fileName || '').trim()));
      if (!hasPlaceholder && !String(transcript || '').trim() && !hasMediaFields) return;
    }

    if (debug) {
      const metaKeys = meta && typeof meta === 'object' ? Object.keys(meta).slice(0, 40) : [];
      console.log('[whatsapp-forwarder] debug', {
        type: eventType,
        action: eventAction,
        channelId,
        placeholder: getPlaceholderKind(bodyText) || null,
        metaKeys,
        mediaSummary: media.map((m: any) => ({
          kind: m?.kind,
          hasUrl: Boolean(String(m?.url || '').trim()),
          mimeType: m?.mimeType || null,
          fileName: m?.fileName || null,
          localPath: (m as any)?.localPath || null,
          provider: m?.provider || null,
        })),
        cloudinaryEnabled: cloudinaryEnabled(),
      });
    }

    const body = bodyText || transcript.trim() || (media.length ? '[Media]' : '');
    if (!from || !body) return;

    const timestampIso = getTimestampIso(event?.timestamp);

    let messageId =
      pickFirstString(
        (event as any)?.context?.metadata?.messageId,
        (event as any)?.context?.metadata?.id,
        (event as any)?.messageId,
        (event as any)?.id
      ) || '';
    if (!messageId) {
      const isMediaish = Boolean(getPlaceholderKind(bodyText)) || Boolean(transcript) || media.some((m: any) => m?.kind === 'image' || m?.kind === 'audio');
      const tsMs = (() => {
        const raw = (event as any)?.timestamp;
        const dt = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw as any) : null;
        const ms = dt && !Number.isNaN(dt.getTime()) ? dt.getTime() : Date.now();
        return ms;
      })();
      // Bucket timestamps to keep gateway retries + lifecycle duplicates stable while still distinguishing
      // repeated short messages over time.
      const bucketMs = isMediaish ? 120_000 : 15_000;
      const timeBucket = Math.floor(tsMs / bucketMs);
      const bodyKey = isMediaish
        ? `${getPlaceholderKind(bodyText) || 'media'}|${String(transcript || '').trim().slice(0, 80)}|${media
            .map((m: any) => String(m?.fileName || m?.localPath || '').trim())
            .filter(Boolean)
            .join(',')
            .slice(0, 120)}`
        : String(body || '').trim().slice(0, 120);

      const seed = `${String(event?.sessionKey || '')}|${from}|${to}|${timeBucket}|${bodyKey}`;
      const digest = await stableIdHex(seed);
      messageId = digest ? `oc_${digest.slice(0, 32)}` : `oc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }

    // If OpenClaw stores media on disk but doesn't include MediaUrls/MediaPaths in the hook payload,
    // try a best-effort "latest file in inbound dir" lookup for any attachment-like item missing a URL.
    // This is intentionally bounded and only runs when we have Cloudinary enabled.
    if (cloudinaryEnabled() && media.length) {
      for (const item of media) {
        const kind = (item as any).kind === 'audio' ? 'audio' : (item as any).kind === 'image' ? 'image' : null;
        if (!kind) continue;
        const url = String((item as any).url || '').trim();
        if (url) continue;
        const localPath = String((item as any).localPath || '').trim();
        const found = localPath ? { path: localPath, fileName: String((item as any).fileName || '').trim(), mimeType: String((item as any).mimeType || '').trim() } : await findLatestInboundFile(kind);
        if (!found || !String(found.path || '').trim()) continue;
        const fs = await (async () => {
          try {
            return await import('node:fs/promises');
          } catch {
            try {
              return await import('fs/promises');
            } catch {
              return null;
            }
          }
        })();
        if (!fs) continue;
        const buf = await fs.readFile(found.path).catch(() => null);
        if (!buf) continue;
        const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as any);
        if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) continue;
        const base64 = bytesToBase64(bytes);
        if (!base64) continue;
        (item as any).originalUrl = `local:${found.path}`;
        (item as any).mimeType = (item as any).mimeType || found.mimeType;
        (item as any).fileName = (item as any).fileName || found.fileName;
        (item as any).url = await uploadBase64ToCloudinary({
          base64,
          mimeType: String((item as any).mimeType || found.mimeType || 'application/octet-stream').trim(),
          fileName: String((item as any).fileName || found.fileName || '').trim(),
          kind,
        });
        if (debug) console.log('[whatsapp-forwarder] inbound-file -> cloudinary', { kind, fileName: found.fileName });
      }
    }

    // Best-effort: if media has a reachable URL but not cloudinary, re-host to Cloudinary.
    if (cloudinaryEnabled() && media.length) {
      for (const item of media) {
        const kind = (item as any).kind === 'audio' ? 'audio' : (item as any).kind === 'image' ? 'image' : null;
        if (!kind) continue;
        const url = String((item as any).url || '').trim();
        if (!url) continue;
        const base64 = await downloadHttpUrlAsBase64(url);
        if (!base64) continue;
        (item as any).originalUrl = url;
        (item as any).url = await uploadBase64ToCloudinary({
          base64,
          mimeType: String((item as any).mimeType || 'application/octet-stream').trim(),
          fileName: String((item as any).fileName || '').trim(),
          kind,
        });
      }
    }

    const endpoint = `${stripTrailingSlash(backendUrl)}/api/webhooks/inbound-whatsapp`;
    if (!hasFetch()) throw new Error('global fetch missing');

    const resp = await (globalThis as any).fetch(endpoint, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        body,
        messageId: String(messageId || '').trim() || null,
        timestamp: timestampIso,
        ...(media.length ? { media: media.length === 1 ? media[0] : media } : {}),
        ...(transcript ? { transcript } : {}),
      }),
    });

    if (!resp?.ok) {
      const text = await resp.text().catch(() => '');
      console.log('[whatsapp-forwarder] forward failed:', resp?.status || 0, String(text || '').slice(0, 300));
      return;
    }

    if (debug) console.log('[whatsapp-forwarder] forwarded', { from, to: to || undefined, messageId });
  } catch (error) {
    console.log('[whatsapp-forwarder] error:', error instanceof Error ? error.message : String(error));
  }
};

export default handler;
