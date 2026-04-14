const { db } = require('../config/firebase');
const emailService = require('./emailService');
const resendService = require('./resendService');
const whatsappService = require('./whatsappService');
const { generateSystemPrompt, callOpenRouter } = require('./llmService');
const { triggerSentimentAnalysis } = require('./sentimentService');
const { saveOutreachRecord } = require('./outreachService');

const AUTO_REPLY_DELAY_MS = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

const buildConversationText = (messages) =>
  messages
    .map((message) => {
      const role = message.status === 'received' ? 'Customer' : 'VantaTech';
      const content = String(message.messageContent || '').trim();
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');

const normalizeSentiment = (value) => {
  const sentiment = String(value || '').trim().toLowerCase();
  return ['hot', 'warm', 'neutral', 'cold'].includes(sentiment) ? sentiment : 'neutral';
};

const shouldAutoReply = (sentiment) => {
  const normalized = normalizeSentiment(sentiment);
  return normalized === 'cold' || normalized === 'neutral';
};

const buildInboundFingerprint = ({ channel, sender, inboundMessage, inboundMessageId }) => {
  if (inboundMessageId) return `message:${String(inboundMessageId).trim()}`;

  const normalizedChannel = String(channel || '').trim().toLowerCase();
  const normalizedSender = String(sender || '').trim().toLowerCase();
  const normalizedBody = String(inboundMessage || '').trim().toLowerCase().slice(0, 200);
  return `body:${normalizedChannel}::${normalizedSender}::${normalizedBody}`;
};

const isRecentDuplicateAutoReply = (lead, fingerprint) => {
  if (!fingerprint) return false;
  if (String(lead.lastAutoReplySourceFingerprint || '') !== fingerprint) return false;

  const lastAtRaw = lead.lastAutoReplySourceAt;
  const lastAt = lastAtRaw?.toDate?.() || (lastAtRaw ? new Date(lastAtRaw) : null);
  if (!(lastAt instanceof Date) || Number.isNaN(lastAt.getTime())) return false;

  return Date.now() - lastAt.getTime() <= DUPLICATE_WINDOW_MS;
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

async function generateAutoReplyMessage({ lead, channel, conversation, inboundMessage }) {
  const systemPrompt = (await generateSystemPrompt()) || 'You are a helpful sales assistant for VantaTech.';
  const conversationText = buildConversationText(conversation);
  const latestInbound = String(inboundMessage || '').trim();
  const companyName = lead.company || 'your company';

  const replyRules =
    channel === 'whatsapp'
      ? [
          'Reply in 1 to 3 short sentences.',
          'Sound human, helpful, and concise.',
          'Do not use email formatting or a subject line.',
          'Do not mention that you are an AI.',
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

Latest inbound message:
${latestInbound}

Rules:
${replyRules}

Return only the reply text.`;

  const response = await callOpenRouter(
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

  const leadDoc = await db.collection('leads').doc(leadId).get();
  if (!leadDoc.exists) return { skipped: true, reason: 'lead-not-found' };

  const lead = { id: leadDoc.id, ...leadDoc.data() };
  const inboundFingerprint = buildInboundFingerprint({ channel, sender, inboundMessage, inboundMessageId });

  if (isRecentDuplicateAutoReply(lead, inboundFingerprint)) {
    return { skipped: true, reason: 'duplicate-inbound-autoreply' };
  }

  const currentLeadSentiment = normalizeSentiment(lead.sentiment);
  if (!shouldAutoReply(currentLeadSentiment)) {
    await db.collection('leads').doc(leadId).update({
      needsHumanReply: true,
      lastInboundAt: new Date(),
      lastInboundChannel: channel,
    });
    return { skipped: true, reason: `human-handoff-existing-${currentLeadSentiment}` };
  }

  const sentiment = normalizeSentiment(await triggerSentimentAnalysis(leadId, sender || lead.email || lead.whatsapp || ''));

  if (!shouldAutoReply(sentiment)) {
    await db.collection('leads').doc(leadId).update({
      needsHumanReply: true,
      lastInboundAt: new Date(),
      lastInboundChannel: channel,
    });
    return { skipped: true, reason: `human-handoff-${sentiment}` };
  }

  const conversation = await fetchRecentConversation(leadId);
  const replyBody = await generateAutoReplyMessage({ lead, channel, conversation, inboundMessage });
  if (!replyBody) return { skipped: true, reason: 'empty-reply' };

  if (AUTO_REPLY_DELAY_MS > 0) {
    await wait(AUTO_REPLY_DELAY_MS);
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
    },
    sendResult
  );

  await db.collection('leads').doc(leadId).update({
    autoReplyLastSentAt: new Date(),
    autoReplyLastChannel: channel,
    needsHumanReply: false,
    lastAutoReplySourceFingerprint: inboundFingerprint,
    lastAutoReplySourceAt: new Date(),
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
