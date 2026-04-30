const { admin, db } = require('../config/firebase');
const emailService = require('./emailService');
const resendService = require('./resendService');
const whatsappService = require('./whatsappService');
const { generateSystemPrompt, callLLM } = require('./llmService');
const { getProductInfo } = require('./productInfoService');
const { saveOutreachRecord } = require('./outreachService');

const AUTO_REPLY_DELAY_MS = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const AUTO_REPLY_ATTEMPT_LOCK_MS = 90 * 1000;
const WHATSAPP_AUTO_REPLY_QUIET_MS = (() => {
  const raw = Number(process.env.WHATSAPP_AUTO_REPLY_QUIET_MS || 8000);
  if (!Number.isFinite(raw) || raw < 0) return 8000;
  return Math.floor(raw);
})();
const WHATSAPP_AUTO_REPLY_BATCH_WINDOW_MS = (() => {
  const raw = Number(process.env.WHATSAPP_AUTO_REPLY_BATCH_WINDOW_MS || 90 * 1000);
  if (!Number.isFinite(raw) || raw < 0) return 90 * 1000;
  return Math.floor(raw);
})();
const WHATSAPP_AUTO_REPLY_BATCH_MAX = (() => {
  const raw = Number(process.env.WHATSAPP_AUTO_REPLY_BATCH_MAX || 6);
  if (!Number.isFinite(raw) || raw <= 0) return 6;
  return Math.floor(raw);
})();

const WHATSAPP_TYPING_MS_PER_WORD = (() => {
  const raw = Number(process.env.WHATSAPP_TYPING_MS_PER_WORD || 80);
  if (!Number.isFinite(raw) || raw < 0) return 80;
  return Math.floor(raw);
})();

const WHATSAPP_TYPING_BASE_MS = (() => {
  const raw = Number(process.env.WHATSAPP_TYPING_BASE_MS || 400);
  if (!Number.isFinite(raw) || raw < 0) return 400;
  return Math.floor(raw);
})();

const WHATSAPP_TYPING_MIN_MS = (() => {
  const raw = Number(process.env.WHATSAPP_TYPING_MIN_MS || 2800);
  if (!Number.isFinite(raw) || raw < 0) return 2800;
  return Math.floor(raw);
})();

const WHATSAPP_TYPING_MAX_MS = (() => {
  const raw = Number(process.env.WHATSAPP_TYPING_MAX_MS || 4500);
  if (!Number.isFinite(raw) || raw < 0) return 4500;
  return Math.floor(raw);
})();

const WHATSAPP_TYPING_JITTER_MS = (() => {
  const raw = Number(process.env.WHATSAPP_TYPING_JITTER_MS || 600);
  if (!Number.isFinite(raw) || raw < 0) return 600;
  return Math.floor(raw);
})();

const WHATSAPP_TYPING_EXTRA_MS = (() => {
  const raw = Number(process.env.WHATSAPP_TYPING_EXTRA_MS || 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
})();

const WHATSAPP_PRESENCE_REFRESH_MS = (() => {
  const raw = Number(process.env.WHATSAPP_PRESENCE_REFRESH_MS || 1000);
  if (!Number.isFinite(raw) || raw <= 0) return 1000;
  return Math.floor(raw);
})();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDateMs = (value) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

const buildWhatsAppBatchText = (messages = [], fallback = '') => {
  const texts = (Array.isArray(messages) ? messages : [])
    .map((message) => String(message?.text || '').trim())
    .filter(Boolean);

  const uniqueTexts = [];
  for (const text of texts) {
    if (!uniqueTexts.includes(text)) uniqueTexts.push(text);
  }

  if (!uniqueTexts.length) return String(fallback || '').trim();
  if (uniqueTexts.length === 1) return uniqueTexts[0];

  return `Customer sent these messages quickly, treat them as one turn:\n${uniqueTexts
    .map((text, index) => `${index + 1}. ${text}`)
    .join('\n')}`;
};

const buildConversationText = (messages) =>
  messages
    .map((message) => {
      const role = message.status === 'received' ? 'Customer' : 'VantaTech';
      const content = String(message.messageContent || '').trim();
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');

const normalizeContactKey = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('@') && !raw.includes('@s.whatsapp.net') && !raw.includes('@g.us')) return raw;

  const noPrefix = raw.startsWith('whatsapp:') ? raw.slice('whatsapp:'.length) : raw;
  const beforeJid = noPrefix.split('@')[0];
  const digits = beforeJid.replace(/[^\d]/g, '');
  if (!digits) return raw;
  if (digits.startsWith('0') && digits.length >= 9 && digits.length <= 11) return `60${digits.slice(1)}`;
  return digits;
};

const buildContactVariants = (value = '') => {
  const raw = String(value || '').trim();
  const key = normalizeContactKey(raw);
  const variants = new Set([raw]);

  if (key && /^\d+$/.test(key)) {
    variants.add(key);
    variants.add(`+${key}`);
    variants.add(`whatsapp:+${key}`);
    variants.add(`${key}@s.whatsapp.net`);
    if (key.startsWith('60')) {
      const local = `0${key.slice(2)}`;
      variants.add(local);
      variants.add(`+${local}`);
      variants.add(`whatsapp:+${local}`);
    }
  }

  return Array.from(variants).filter(Boolean).slice(0, 10);
};

const summarizeProduct = (product = {}) => {
  const lines = [
    `Name: ${product.productName || 'Unnamed product'}`,
    product.productType ? `Type: ${product.productType}` : '',
    product.description ? `Description: ${product.description}` : '',
    product.keyBenefit ? `Key benefit: ${product.keyBenefit}` : '',
    product.targetCustomer ? `Target customer: ${product.targetCustomer}` : '',
    product.location ? `Location: ${product.location}` : '',
    product.moreAboutProduct ? `More context: ${product.moreAboutProduct}` : '',
  ].filter(Boolean);

  return lines.join('\n').slice(0, 1800);
};

async function fetchKnownProductContextsForCustomer(lead = {}, sender = '') {
  const productIds = new Set();
  const addProductId = (value) => {
    const id = String(value || '').trim();
    if (id) productIds.add(id);
  };

  addProductId(lead.productInfoId);

  const contactValues = [
    sender,
    lead.whatsapp,
    lead.contactWhatsApp,
    lead.phone,
    lead.email,
    lead.contactEmail,
  ].filter(Boolean);

  const queryByVariants = async (collectionName, fieldName, variants) => {
    if (!variants.length) return [];
    try {
      const snapshot = await db.collection(collectionName).where(fieldName, 'in', variants).limit(20).get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  };

  for (const contact of contactValues) {
    const variants = buildContactVariants(contact);
    const leadMatches = [
      ...(await queryByVariants('leads', 'whatsapp', variants)),
      ...(await queryByVariants('leads', 'contactWhatsApp', variants)),
      ...(await queryByVariants('leads', 'phone', variants)),
      ...(await queryByVariants('leads', 'email', variants)),
      ...(await queryByVariants('leads', 'contactEmail', variants)),
    ];
    leadMatches.forEach((match) => addProductId(match.productInfoId));

    const outreachMatches = [
      ...(await queryByVariants('outreach_history', 'contactWhatsApp', variants)),
      ...(await queryByVariants('outreach_history', 'contactPhone', variants)),
      ...(await queryByVariants('outreach_history', 'contactEmail', variants)),
    ];
    outreachMatches.forEach((match) => addProductId(match.productInfoId));
  }

  const products = [];
  for (const id of Array.from(productIds).slice(0, 5)) {
    const product = await getProductInfo(id).catch(() => null);
    if (product) products.push({ id, ...product });
  }

  return products;
}

const looksLikeGreeting = (text) => {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  if (t.length > 40) return false;
  return /^(hi|hey|hello|yo|sup|good\s*(morning|afternoon|evening)|morning|evening)\b/.test(t);
};

const isMediaOnlyMessage = (text) => {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^\[media\]$/i.test(t)) return true;
  return /<\s*media\s*:/i.test(t);
};

const recentlyAskedDeviceCount = (conversationText) => {
  const t = String(conversationText || '').toLowerCase();
  if (!t) return false;
  return (
    t.includes('one device') ||
    t.includes('single device') ||
    t.includes('multiple devices') ||
    t.includes('many devices')
  );
};

const answersDeviceCountQuestion = (text) => {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  return (
    t.includes('one device') ||
    t.includes('single device') ||
    t.includes('just one device') ||
    t.includes('multiple devices') ||
    t.includes('many devices') ||
    t === 'one' ||
    t === 'multiple'
  );
};

const looksTooShortToActOn = (text) => {
  const t = String(text || '').trim();
  if (!t) return true;
  const words = t.split(/\s+/).filter(Boolean);
  return t.length < 8 || words.length <= 1;
};

const looksLikeTroubleshooting = (text) => {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  return (
    t.includes('issue') ||
    t.includes('problem') ||
    t.includes('bug') ||
    t.includes('error') ||
    t.includes('fail') ||
    t.includes('failed') ||
    t.includes('not working') ||
    t.includes("can't") ||
    t.includes('cannot') ||
    t.includes('unable') ||
    t.includes('stuck') ||
    t.includes('crash') ||
    t.includes('freeze') ||
    t.includes('hang')
  );
};

const normalizeSentiment = (value) => {
  const sentiment = String(value || '').trim().toLowerCase();
  return ['hot', 'warm', 'neutral', 'cold'].includes(sentiment) ? sentiment : 'neutral';
};

const normalizeTemperature = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heuristic mapping for legacy numeric temperature (0-100).
    if (value >= 75) return 'hot';
    if (value >= 55) return 'warm';
    if (value >= 35) return 'neutral';
    return 'cold';
  }

  const temp = String(value || '').trim().toLowerCase();
  if (!temp) return '';
  if (['hot', 'warm', 'neutral', 'cold'].includes(temp)) return temp;
  // UI sometimes stores Temp as "Hot"/"Warm"/etc or emojis/short forms.
  if (temp === 'h' || temp === '🔥') return 'hot';
  if (temp === 'w') return 'warm';
  if (temp === 'n') return 'neutral';
  if (temp === 'c') return 'cold';
  return '';
};

// Auto-reply is now allowed for all sentiment levels.
// Manual override per-lead is controlled by the `manualReplyMode` flag on the lead document.
const shouldAutoReply = (_sentiment) => true;

const buildInboundFingerprint = ({ channel, sender, inboundMessage, inboundMessageId }) => {
  const normalizedChannel = String(channel || '').trim().toLowerCase();
  const normalizedSender = String(sender || '').trim().toLowerCase();
  const normalizedBody = String(inboundMessage || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);

  // OpenClaw/Baileys can emit the same inbound WhatsApp text multiple times with different IDs.
  // Use sender+body for the auto-reply lock so one customer message cannot trigger two AI replies.
  if (normalizedChannel !== 'whatsapp' && inboundMessageId) return `message:${String(inboundMessageId).trim()}`;

  return `body:${normalizedChannel}::${normalizedSender}::${normalizedBody}`;
};

const isAutoReplyAttemptLocked = (lead, fingerprint) => {
  if (!fingerprint) return false;
  if (String(lead.lastAutoReplyAttemptFingerprint || '') !== fingerprint) return false;

  const lastAtRaw = lead.lastAutoReplyAttemptAt;
  const lastAt = lastAtRaw?.toDate?.() || (lastAtRaw ? new Date(lastAtRaw) : null);
  if (!(lastAt instanceof Date) || Number.isNaN(lastAt.getTime())) return false;

  return Date.now() - lastAt.getTime() <= AUTO_REPLY_ATTEMPT_LOCK_MS;
};

const isRecentSuccessfulDuplicateAutoReply = (lead, fingerprint) => {
  if (!fingerprint) return false;
  if (String(lead.lastAutoReplySourceFingerprint || '') !== fingerprint) return false;

  const lastSentRaw = lead.autoReplyLastSentAt;
  const lastSentAt = lastSentRaw?.toDate?.() || (lastSentRaw ? new Date(lastSentRaw) : null);
  if (!(lastSentAt instanceof Date) || Number.isNaN(lastSentAt.getTime())) return false;

  return Date.now() - lastSentAt.getTime() <= DUPLICATE_WINDOW_MS;
};

async function fetchRecentConversation(leadId) {
  const snapshot = await db
    .collection('outreach_history')
    .where('leadId', '==', leadId)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => {
      const aTime = a.timestamp?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
      const bTime = b.timestamp?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    })
    .slice(-12);
}

async function generateAutoReplyMessage({ lead, channel, conversation, inboundMessage, sender = '' }) {
  const productInfoId = String(lead?.productInfoId || '').trim() || null;
  const systemPrompt = (await generateSystemPrompt(productInfoId)) || 'You are a helpful sales assistant for VantaTech.';
  const knownProducts = await fetchKnownProductContextsForCustomer(lead, sender);
  const multiProductContext = knownProducts.length
    ? knownProducts.map((product, index) => `Product ${index + 1} (${product.id}):\n${summarizeProduct(product)}`).join('\n\n')
    : '';
  const conversationText = buildConversationText(conversation);
  const latestInbound = String(inboundMessage || '').trim();
  const companyName = lead.company || 'your company';

  // If the user sends only an attachment placeholder (no text/transcript), ask for a short typed description
  // instead of letting the LLM loop on generic clarifying questions.
  if (channel === 'whatsapp' && isMediaOnlyMessage(latestInbound)) {
    return `Thanks, I received your attachment. What’s the issue / what should I check? Reply in one short sentence.`;
  }

  // If we've already asked any "device count" clarifier and the user still hasn't answered it,
  // avoid repeating the same question forever—ask for a short problem description instead.
  if (
    channel === 'whatsapp' &&
    recentlyAskedDeviceCount(conversationText) &&
    !answersDeviceCountQuestion(latestInbound) &&
    (isMediaOnlyMessage(latestInbound) || looksLikeTroubleshooting(latestInbound))
  ) {
    return `Got it. What exactly is wrong? (One short sentence is fine.)`;
  }

  // If the first inbound is too short (common with 1s voice notes transcribing to "hi"),
  // ask for context. If there is already conversation history, let the LLM interpret short
  // replies like "sure", "ok", or "yes" against the previous bot question.
  if (
    channel === 'whatsapp' &&
    !conversationText.trim() &&
    (looksLikeGreeting(latestInbound) || looksTooShortToActOn(latestInbound))
  ) {
    return `Hi! What can I help with? Tell me what happened in one short sentence.`;
  }

  const replyRules =
    channel === 'whatsapp'
      ? [
          'Reply in 1 to 3 short sentences.',
          'Sound human, helpful, and concise.',
          'Do not use email formatting or a subject line.',
          'Do not mention that you are an AI.',
          'If the latest message is a short confirmation like "sure", "ok", "yes", or "go ahead", infer it from the previous bot question and continue that promised next step.',
          'Do not reset the conversation or ask "what can I help with" when prior context exists.',
          'Keep the conversation moving with one simple next-step question when appropriate.',
        ].join('\n')
      : [
          'Reply like a short professional email body.',
          'Use 2 to 4 short paragraphs max.',
          'Do not include a subject line.',
          'Do not mention that you are an AI.',
          'Keep the tone warm, helpful, and concise.',
        ].join('\n');

  const prompt = `You are replying on behalf of VantaTech to an inbound ${channel} message.

Company: ${companyName}

Conversation so far:
${conversationText || 'No prior conversation.'}

Known products/services previously connected to this customer:
${multiProductContext || 'Only the current product context is known.'}

Latest inbound message:
${latestInbound}

Rules:
${replyRules}
- If the customer asks broadly what product/service VantaTech offers, mention all known relevant products briefly.
- If the conversation is clearly about one product, prioritize that product and avoid confusing it with others.
- Do not claim the products are related unless the product context says so.

Return only the reply text.`;

  const response = await callLLM(
    [
      { role: 'user', content: systemPrompt },
      { role: 'assistant', content: 'Understood.' },
      { role: 'user', content: prompt },
    ],
    false
  );

  return String(response?.content || '').trim();
}

async function sendAutoReply(channel, lead, inboundSubject, body, recipientOverride = '') {
  if (channel === 'whatsapp') {
    const whatsappTarget = recipientOverride || lead.whatsapp || lead.contactWhatsApp || lead.phone || '';
    if (!whatsappTarget) {
      return { success: false, error: 'Missing WhatsApp target for auto-reply' };
    }
    return whatsappService.sendMessage(whatsappTarget, body);
  }

  if (channel === 'email') {
    const emailTarget = recipientOverride || lead.email || lead.contactEmail || '';
    if (!emailTarget) {
      return { success: false, error: 'Missing email target for auto-reply' };
    }

    const subject = inboundSubject ? `Re: ${inboundSubject}` : `Re: ${lead.company || 'Your inquiry'}`;

    if ((process.env.RESEND_API_KEY || '').trim()) {
      return resendService.sendEmail(
        emailTarget,
        subject,
        body,
        process.env.OUTREACH_FROM_EMAIL || process.env.RESEND_FROM_EMAIL
      );
    }

    return emailService.sendEmail(
      emailTarget,
      subject,
      body,
      process.env.OUTREACH_FROM_EMAIL || process.env.DEFAULT_FROM_EMAIL
    );
  }

  return { success: false, error: `Unsupported auto-reply channel: ${channel}` };
}

async function processInboundAutoReply({
  leadId,
  channel,
  inboundMessage,
  inboundSubject = null,
  sender = '',
  inboundMessageId = '',
}) {
  if (!leadId || !channel || !inboundMessage) return { skipped: true, reason: 'missing-required-data' };

  const inboundFingerprint = buildInboundFingerprint({ channel, sender, inboundMessage, inboundMessageId });

  // Deduplicate + gate auto-replies with a transaction to avoid race conditions where the same inbound
  // triggers multiple parallel replies. WhatsApp also batches quick consecutive customer texts into one reply.
  const leadRef = db.collection('leads').doc(leadId);
  const batchToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const txnResult = await db.runTransaction(async (txn) => {
    const leadDoc = await txn.get(leadRef);
    if (!leadDoc.exists) return { skipped: true, reason: 'lead-not-found', lead: null };

    const lead = { id: leadDoc.id, ...leadDoc.data() };

    // Prevent parallel processing storms for the same inbound fingerprint while the LLM is running.
    if (isAutoReplyAttemptLocked(lead, inboundFingerprint)) {
      return { skipped: true, reason: 'duplicate-inbound-autoreply', lead };
    }

    // If we already successfully auto-replied to this fingerprint recently, skip duplicates.
    if (isRecentSuccessfulDuplicateAutoReply(lead, inboundFingerprint)) {
      return { skipped: true, reason: 'duplicate-inbound-autoreply', lead };
    }

    // If the user toggled manual reply mode from the chat interface, skip auto-reply.
    if (lead.manualReplyMode === true) {
      txn.update(leadRef, {
        needsHumanReply: true,
        lastInboundAt: new Date(),
        lastInboundChannel: channel,
        lastAutoReplySourceFingerprint: inboundFingerprint,
        lastAutoReplySourceAt: new Date(),
      });
      return { skipped: true, reason: 'manual-reply-mode-enabled', lead };
    }

    const patch = {
      lastAutoReplyAttemptFingerprint: inboundFingerprint,
      lastAutoReplyAttemptAt: new Date(),
    };

    if (channel === 'whatsapp') {
      const previousBatch = Array.isArray(lead.pendingAutoReplyMessages) ? lead.pendingAutoReplyMessages : [];
      const previousUpdatedAtMs = getDateMs(lead.pendingAutoReplyUpdatedAt);
      const canAppend =
        previousBatch.length > 0 &&
        previousUpdatedAtMs &&
        Date.now() - previousUpdatedAtMs <= WHATSAPP_AUTO_REPLY_BATCH_WINDOW_MS;
      const nextBatchBase = canAppend ? previousBatch : [];
      const hasSameFingerprint = nextBatchBase.some(
        (message) => String(message?.fingerprint || '') === String(inboundFingerprint)
      );
      const nextBatch = hasSameFingerprint
        ? nextBatchBase
        : [
            ...nextBatchBase,
            {
              text: String(inboundMessage || '').trim(),
              fingerprint: inboundFingerprint,
              receivedAt: new Date().toISOString(),
            },
          ].slice(-WHATSAPP_AUTO_REPLY_BATCH_MAX);

      patch.pendingAutoReplyToken = batchToken;
      patch.pendingAutoReplyChannel = channel;
      patch.pendingAutoReplySender = sender || lead.whatsapp || lead.contactWhatsApp || '';
      patch.pendingAutoReplyMessages = nextBatch;
      patch.pendingAutoReplyUpdatedAt = new Date();
    }

    // Acquire attempt lock early so concurrent webhook deliveries don't all reply.
    txn.update(leadRef, patch);

    return { skipped: false, reason: null, lead };
  });

  if (txnResult?.skipped) return { skipped: true, reason: txnResult.reason };
  const lead = txnResult?.lead;
  if (!lead) return { skipped: true, reason: 'lead-not-found' };

  const sentiment = normalizeSentiment(lead.sentiment || lead.temp || lead.leadTemperature || '');

  if (channel === 'whatsapp' && WHATSAPP_AUTO_REPLY_QUIET_MS > 0) {
    await wait(WHATSAPP_AUTO_REPLY_QUIET_MS);
    const latestLead = (await leadRef.get()).data() || {};
    if (String(latestLead.pendingAutoReplyToken || '') !== batchToken) {
      return { skipped: true, reason: 'superseded-by-newer-whatsapp-message' };
    }
  }

  // Re-check manualReplyMode after sentiment analysis (may have changed during async work).
  const freshLead = (await db.collection('leads').doc(leadId).get()).data() || {};
  if (freshLead.manualReplyMode === true) {
    await db.collection('leads').doc(leadId).update({
      needsHumanReply: true,
      lastInboundAt: new Date(),
      lastInboundChannel: channel,
    });
    return { skipped: true, reason: 'manual-reply-mode-enabled' };
  }

  let effectiveInboundMessage = inboundMessage;
  if (channel === 'whatsapp') {
    const latestLead = (await leadRef.get()).data() || {};
    if (String(latestLead.pendingAutoReplyToken || '') !== batchToken) {
      return { skipped: true, reason: 'superseded-by-newer-whatsapp-message' };
    }
    effectiveInboundMessage = buildWhatsAppBatchText(latestLead.pendingAutoReplyMessages, inboundMessage);
  }

  const conversation = await fetchRecentConversation(leadId);
  const replyBody = await generateAutoReplyMessage({ lead, channel, conversation, inboundMessage: effectiveInboundMessage, sender });
  if (!replyBody) return { skipped: true, reason: 'empty-reply' };

  if (channel === 'whatsapp') {
    const latestLead = (await leadRef.get()).data() || {};
    if (String(latestLead.pendingAutoReplyToken || '') !== batchToken) {
      return { skipped: true, reason: 'superseded-by-newer-whatsapp-message' };
    }
  }

  try {
    const inboundPreview = String(effectiveInboundMessage || '').trim().slice(0, 120);
    const replyPreview = String(replyBody || '').trim().slice(0, 120);
    console.log(`[AutoReply] Generated (${channel}) inbound="${inboundPreview}" reply="${replyPreview}"`);
  } catch {
    // ignore
  }
  if (/all models failed/i.test(replyBody) || /^⚠️/i.test(replyBody)) {
    return { skipped: true, reason: 'blocked-provider-error-text' };
  }

  // Simulate natural human typing speed before sending.
  // Formula: ~40 WPM baseline, clamped between 3s and 15s.
  // Also attempt to send a WhatsApp "composing" presence so the customer
  // sees the typing dots during the wait period.
  if (channel === 'whatsapp') {
    const wordCount = replyBody.trim().split(/\s+/).length;
    const jitter = WHATSAPP_TYPING_JITTER_MS ? Math.floor(Math.random() * WHATSAPP_TYPING_JITTER_MS) : 0;
    const typingDelayMs = clamp(
      WHATSAPP_TYPING_BASE_MS + wordCount * WHATSAPP_TYPING_MS_PER_WORD + jitter + WHATSAPP_TYPING_EXTRA_MS,
      WHATSAPP_TYPING_MIN_MS,
      WHATSAPP_TYPING_MAX_MS
    );

    const whatsappService = require('./openClawWhatsAppService');
    const composingSent = await whatsappService.sendComposingPresence(sender || lead.whatsapp || lead.contactWhatsApp || '');
    console.log(`[AutoReply] WhatsApp typing delay: ${typingDelayMs}ms (${wordCount} words, composing=${composingSent})`);

    // Maintain the typing indicator for longer waits (some clients time it out quickly).
    const refreshEveryMs = WHATSAPP_PRESENCE_REFRESH_MS;
    const startedAt = Date.now();
    while (Date.now() - startedAt < typingDelayMs) {
      const remaining = typingDelayMs - (Date.now() - startedAt);
      const slice = Math.min(refreshEveryMs, remaining);
      await wait(slice);
      if (remaining > 0) {
        // Refresh even if the initial attempt failed; the gateway may become ready a moment later.
        await whatsappService.sendComposingPresence(sender || lead.whatsapp || lead.contactWhatsApp || '');
      }
    }
  } else if (AUTO_REPLY_DELAY_MS > 0) {
    await wait(AUTO_REPLY_DELAY_MS);
  }

  if (channel === 'whatsapp') {
    const latestLead = (await leadRef.get()).data() || {};
    if (String(latestLead.pendingAutoReplyToken || '') !== batchToken) {
      return { skipped: true, reason: 'superseded-by-newer-whatsapp-message' };
    }
  }

  const sendResult = await sendAutoReply(channel, lead, inboundSubject, replyBody, sender);
  const leadForRecord =
    channel === 'whatsapp'
      ? { ...lead, whatsapp: sender || lead.whatsapp || lead.contactWhatsApp || lead.phone || null }
      : { ...lead, email: sender || lead.email || lead.contactEmail || null };

  await saveOutreachRecord(
    leadForRecord,
    channel,
    {
      subject: channel === 'email' ? (inboundSubject ? `Re: ${inboundSubject}` : `Re: ${lead.company || 'Your inquiry'}`) : null,
      body: replyBody,
      type: 'auto_reply',
      source: 'autoReplyService',
    },
    sendResult
  );

  await db.collection('leads').doc(leadId).update({
    ...(sendResult?.success
      ? {
          autoReplyLastSentAt: new Date(),
          autoReplyLastChannel: channel,
          needsHumanReply: false,
        }
      : {
          needsHumanReply: true,
        }),
    lastAutoReplySourceFingerprint: inboundFingerprint,
    lastAutoReplySourceAt: new Date(),
    lastAutoReplyAttemptFingerprint: inboundFingerprint,
    lastAutoReplyAttemptAt: new Date(),
    ...(channel === 'whatsapp'
      ? {
          pendingAutoReplyToken: admin.firestore.FieldValue.delete(),
          pendingAutoReplyChannel: admin.firestore.FieldValue.delete(),
          pendingAutoReplySender: admin.firestore.FieldValue.delete(),
          pendingAutoReplyMessages: admin.firestore.FieldValue.delete(),
          pendingAutoReplyUpdatedAt: admin.firestore.FieldValue.delete(),
        }
      : {}),
  });

  return {
    skipped: false,
    sentiment,
    replyBody,
    sendResult,
  };
}

module.exports = {
  AUTO_REPLY_DELAY_MS,
  processInboundAutoReply,
};
