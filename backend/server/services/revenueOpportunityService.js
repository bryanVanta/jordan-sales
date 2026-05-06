const admin = require('firebase-admin');
const { db } = require('../config/firebase');

const REVENUE_BUCKETS = ['price', 'considering', 'objection', 'ready'];

const toMillis = (value) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
};

const normalizeSentiment = (value) => {
  const sentiment = String(value || '').trim().toLowerCase();
  return ['hot', 'warm', 'neutral', 'cold'].includes(sentiment) ? sentiment : 'neutral';
};

const isEngagedLead = (lead = {}, messages = []) =>
  Number(lead.messageCount || 0) > 0 ||
  Boolean(lead.lastInboundAt || lead.lastOutreach || lead.lastMessageTime) ||
  messages.length > 0;

const getLeadText = (lead = {}, messages = []) => {
  const messageText = messages
    .slice(-8)
    .map((message) => message.messageContent || message.content || message.messagePreview || '')
    .join(' ');

  return [
    lead.intent,
    lead.next,
    lead.lastMessage,
    lead.messagePreview,
    lead.summary,
    lead.notes,
    lead.objection,
    messageText,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
};

const classifyRevenueOpportunity = (lead = {}, messages = []) => {
  const sentiment = normalizeSentiment(lead.sentiment || lead.temperature || lead.temp || lead.leadTemperature);
  const text = getLeadText(lead, messages);

  if (/\b(price|pricing|cost|budget|expensive|cheap|discount|quote|quotation|fee|fees|rate|rates|rm|myr)\b/.test(text)) {
    return {
      bucket: 'price',
      reason: 'Asked about price, quote, budget, discount, or rates.',
    };
  }

  if (/\b(not interested|no need|too busy|already have|concern|issue|problem|however|can't|cannot|later|maybe later)\b/.test(text)) {
    return {
      bucket: 'objection',
      reason: 'Raised objection, timing issue, existing solution, or concern.',
    };
  }

  if (/\b(ready|buy|purchase|proceed|start|book|demo|invoice|send it|sign|deal|call me|meeting)\b/.test(text) || sentiment === 'hot') {
    return {
      bucket: 'ready',
      reason: 'Shows buying intent or asks for next step.',
    };
  }

  return {
    bucket: 'considering',
    reason: 'Engaged, but no clear price objection or ready-to-buy signal.',
  };
};

const fetchMessagesByLead = async () => {
  const byLeadId = new Map();
  const addMessage = (doc) => {
    const data = doc.data() || {};
    const leadId = String(data.leadId || '').trim();
    if (!leadId) return;
    if (!byLeadId.has(leadId)) byLeadId.set(leadId, []);
    byLeadId.get(leadId).push({ id: doc.id, ...data });
  };

  const collections = ['outreach_history', 'inbound_emails', 'inbound_whatsapp'];
  for (const collectionName of collections) {
    try {
      const snapshot = await db.collection(collectionName).limit(1500).get();
      snapshot.forEach(addMessage);
    } catch (error) {
      console.warn(`[Revenue Opportunities] Could not read ${collectionName}:`, error.message);
    }
  }

  for (const messages of byLeadId.values()) {
    messages.sort((a, b) => toMillis(a.timestamp || a.createdAt) - toMillis(b.timestamp || b.createdAt));
  }

  return byLeadId;
};

const analyzeRevenueOpportunities = async () => {
  const startedAt = new Date();
  const messagesByLead = await fetchMessagesByLead();
  const leadsSnapshot = await db.collection('leads').get();

  const summary = {
    analyzed: 0,
    skipped: 0,
    byType: { price: 0, considering: 0, objection: 0, ready: 0 },
  };

  let batch = db.batch();
  let pendingWrites = 0;
  const commitBatch = async () => {
    if (pendingWrites === 0) return;
    await batch.commit();
    batch = db.batch();
    pendingWrites = 0;
  };

  for (const doc of leadsSnapshot.docs) {
    const lead = { id: doc.id, ...(doc.data() || {}) };
    const messages = messagesByLead.get(doc.id) || [];

    if (!isEngagedLead(lead, messages)) {
      summary.skipped++;
      continue;
    }

    const { bucket, reason } = classifyRevenueOpportunity(lead, messages);
    summary.analyzed++;
    summary.byType[bucket]++;

    batch.update(doc.ref, {
      revenueOpportunity: bucket,
      revenueOpportunityReason: reason,
      revenueOpportunityAnalyzedAt: startedAt,
      revenueOpportunitySource: 'daily_keyword_analysis',
    });
    pendingWrites++;
    if (pendingWrites >= 450) {
      // Firestore allows 500 writes per batch. Leave headroom for future fields.
      await commitBatch();
    }
  }

  await commitBatch();

  await db.collection('analytics').add({
    type: 'daily_revenue_opportunity_analysis',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    analyzedAt: startedAt,
    summary,
    buckets: REVENUE_BUCKETS,
  });

  return summary;
};

module.exports = {
  analyzeRevenueOpportunities,
  classifyRevenueOpportunity,
};
