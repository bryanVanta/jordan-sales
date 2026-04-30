/**
 * Outreach Routes
 * Handle bulk message sending to selected leads
 */

const express = require('express');
const { db } = require('../config/firebase');
const { executeBulkOutreach } = require('../services/outreachService');

const router = express.Router();

const toMillis = (value) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : Date.now();
};

const normalizePhone = (value = '') => String(value || '').replace(/[^\d]/g, '');
const normalizeCompany = (value = '') => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeChatMessage = (doc) => {
  const data = doc.data() || {};
  const timestampMs = toMillis(data.timestamp || data.createdAt);
  return {
    id: doc.id,
    leadId: data.leadId || '',
    company: data.company || '',
    contactPerson: data.contactPerson || '',
    contactEmail: data.contactEmail || '',
    contactWhatsApp: data.contactWhatsApp || '',
    contactPhone: data.contactPhone || '',
    channel: data.channel || '',
    messageSubject: data.messageSubject || null,
    messageContent: data.messageContent || data.content || '',
    messagePreview: data.messagePreview || String(data.messageContent || data.content || '').slice(0, 200),
    status: data.status || 'sent',
    errorMessage: data.errorMessage || null,
    messageId: data.messageId || null,
    timestampMs,
    timestamp: new Date(timestampMs).toISOString(),
    createdAt: new Date(toMillis(data.createdAt || data.timestamp)).toISOString(),
    media: data.media || null,
    transcript: data.transcript || null,
  };
};

const dedupeMessages = (messages = []) => {
  const seen = new Set();
  const seenNearbyBody = new Map();
  return [...messages]
    .sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0))
    .filter((message) => {
      const body = String(message.messageContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const mediaKey = Array.isArray(message.media)
        ? message.media.map((m) => String(m?.url || '')).filter(Boolean).join(',')
        : String(message.media?.url || '');
      const nearbyKey = [
        message.leadId || '',
        message.channel || '',
        message.status || '',
        message.contactWhatsApp || message.contactEmail || '',
        body,
        mediaKey,
      ].join('::');
      const previousMs = seenNearbyBody.get(nearbyKey);
      if (body && previousMs && Math.abs((message.timestampMs || 0) - previousMs) <= 2 * 60 * 1000) return false;
      if (body) seenNearbyBody.set(nearbyKey, message.timestampMs || 0);

      const key = message.messageId || `${nearbyKey}::${message.timestampMs || 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const fetchCollectionDocs = async (collectionName, limit = 600) => {
  try {
    return (await db.collection(collectionName).orderBy('timestamp', 'desc').limit(limit).get()).docs;
  } catch {
    try {
      return (await db.collection(collectionName).limit(limit).get()).docs;
    } catch {
      return [];
    }
  }
};

/**
 * GET /outreach/chats?channel=whatsapp|email
 * Admin-backed chat data for frontend when browser Firestore rules do not allow direct reads.
 */
router.get('/chats', async (req, res) => {
  try {
    const channel = String(req.query.channel || 'email').trim().toLowerCase();
    const productInfoId = String(req.query.productInfoId || '').trim();
    const validChannel = ['email', 'whatsapp', 'telegram'].includes(channel) ? channel : 'email';

    const leadsDocs = await fetchCollectionDocs('leads', 2000);
    const leadsById = new Map();
    const leadsByWhatsApp = new Map();
    const leadsByEmail = new Map();
    const leadsByCompany = new Map();
    const indexLead = (id, data = {}) => {
      if (productInfoId && String(data.productInfoId || 'current') !== productInfoId) return;
      const lead = { id, ...data };
      leadsById.set(id, lead);
      const wa = normalizePhone(data.whatsapp || data.contactWhatsApp || data.phone || '');
      if (wa) leadsByWhatsApp.set(wa, lead);
      const email = String(data.email || data.contactEmail || '').trim().toLowerCase();
      if (email) leadsByEmail.set(email, lead);
      const company = normalizeCompany(data.company || data.companyName || '');
      if (company) leadsByCompany.set(company, lead);
    };
    leadsDocs.forEach((doc) => {
      indexLead(doc.id, doc.data() || {});
    });

    const outreachDocs = await fetchCollectionDocs('outreach_history', 800);
    const inboundDocs =
      validChannel === 'whatsapp'
        ? await fetchCollectionDocs('inbound_whatsapp', 500)
        : validChannel === 'email'
          ? await fetchCollectionDocs('inbound_emails', 500)
          : [];

    const normalizedOutreachMessages = outreachDocs.map(normalizeChatMessage);
    const normalizedInboundMessages = inboundDocs.map((doc) => {
      const data = doc.data() || {};
      const message = normalizeChatMessage(doc);
      return {
        ...message,
        channel: validChannel,
        status: 'received',
        messageSubject: validChannel === 'email' ? `Re: ${data.subject || 'Email'}` : null,
        messageContent: data.content || message.messageContent,
        messagePreview: String(data.content || message.messageContent || '').slice(0, 200),
      };
    });

    // If the lead was outside the initial batch, fetch exact lead docs referenced by messages.
    const referencedLeadIds = new Set(
      [...normalizedOutreachMessages, ...normalizedInboundMessages]
        .map((message) => String(message.leadId || '').trim())
        .filter(Boolean)
    );
    for (const leadId of referencedLeadIds) {
      if (leadsById.has(leadId)) continue;
      try {
        const leadDoc = await db.collection('leads').doc(leadId).get();
        if (leadDoc.exists) indexLead(leadDoc.id, leadDoc.data() || {});
      } catch {
        // ignore exact lead lookup failures; conversation can still render from message fields
      }
    }

    const conversations = new Map();
    const ensureConversation = (lead, message = {}) => {
      const contactWhatsApp = message.contactWhatsApp || lead?.whatsapp || lead?.contactWhatsApp || lead?.phone || '';
      const contactEmail = message.contactEmail || lead?.email || lead?.contactEmail || '';
      const key =
        lead?.id ||
        (validChannel === 'whatsapp' ? `wa:${normalizePhone(contactWhatsApp)}` : `email:${String(contactEmail).toLowerCase()}`) ||
        message.leadId ||
        message.id;
      if (!key) return null;
      if (!conversations.has(key)) {
        conversations.set(key, {
          firebaseLeadId: lead?.id || message.leadId || '',
          company: lead?.company || lead?.companyName || message.company || 'Unknown Company',
          contactPerson: lead?.person || lead?.contactPerson || message.contactPerson || 'Unknown',
          contactEmail,
          whatsapp: contactWhatsApp,
          contactWhatsApp,
          channel: validChannel,
          sentiment: lead?.sentiment || lead?.leadTemperature || lead?.temp || null,
          sentimentLastUpdated: lead?.sentimentLastUpdated ? new Date(toMillis(lead.sentimentLastUpdated)).toISOString() : null,
          manualReplyMode: Boolean(lead?.manualReplyMode),
          aiTyping: Boolean(lead?.aiTyping),
          aiTypingStartedAt: lead?.aiTypingStartedAt ? new Date(toMillis(lead.aiTypingStartedAt)).toISOString() : null,
          messages: [],
        });
      }
      return conversations.get(key);
    };

    const addMessage = (message) => {
      if (message.channel && message.channel !== validChannel) return;
      let lead = message.leadId ? leadsById.get(message.leadId) : null;
      if (!lead && validChannel === 'whatsapp') {
        lead = leadsByWhatsApp.get(normalizePhone(message.contactWhatsApp || message.contactPhone || ''));
      }
      if (!lead && validChannel === 'email') {
        lead = leadsByEmail.get(String(message.contactEmail || '').trim().toLowerCase());
      }
      if (!lead) {
        lead = leadsByCompany.get(normalizeCompany(message.company || ''));
      }
      if (productInfoId && lead && String(lead.productInfoId || 'current') !== productInfoId) return;
      const conversation = ensureConversation(lead, message);
      if (conversation) conversation.messages.push(message);
    };

    normalizedOutreachMessages.forEach(addMessage);
    normalizedInboundMessages.forEach(addMessage);

    const chats = Array.from(conversations.values())
      .map((conversation) => ({
        ...conversation,
        messages: dedupeMessages(conversation.messages),
      }))
      .filter((conversation) => conversation.messages.length > 0)
      .sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1]?.timestampMs || 0;
        const bLast = b.messages[b.messages.length - 1]?.timestampMs || 0;
        return bLast - aLast;
      });

    res.json({ success: true, channel: validChannel, count: chats.length, chats });
  } catch (error) {
    console.error('[API] Error fetching chats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch chats', message: error.message });
  }
});

/**
 * POST /outreach/send
 * Send personalized outreach messages to selected leads
 * Body: { leadIds: [string], productInfoId?: string, channel?: 'email'|'whatsapp' }
 * Default behavior (no channel override): WhatsApp if lead has `whatsapp`, otherwise Email.
 */
router.post('/send', async (req, res) => {
  try {
    const { leadIds, productInfoId, channel } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'leadIds must be a non-empty array',
      });
    }

    console.log(`[API] Receiving outreach request for ${leadIds.length} leads`);

    // Execute bulk outreach
    const results = await executeBulkOutreach(leadIds, productInfoId, { channel });

    res.json({
      success: true,
      message: `Outreach completed: ${results.successful} sent, ${results.failed} failed`,
      ...results,
    });
  } catch (error) {
    console.error('[API] Outreach error:', error);
    res.status(500).json({
      success: false,
      error: 'Outreach failed',
      message: error.message,
    });
  }
});

/**
 * GET /outreach/history
 * Get outreach history for a specific lead
 * Query: ?leadId=xxx
 */
router.get('/history', async (req, res) => {
  try {
    const { leadId } = req.query;

    if (!leadId) {
      return res.status(400).json({
        error: 'leadId query parameter required',
      });
    }

    const snapshot = await db
      .collection('outreach_history')
      .where('leadId', '==', leadId)
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const history = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      leadId,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error('[API] Error fetching outreach history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch outreach history',
      message: error.message,
    });
  }
});

module.exports = router;
