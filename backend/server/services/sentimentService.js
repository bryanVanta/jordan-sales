/**
 * Sentiment Analysis Service - AI-Powered
 * Uses LLM (OpenRouter via llmService) to analyze customer sentiment from email conversations
 */

const { db, admin } = require('../config/firebase');
const { callLLM } = require('./llmService');

// Configurable alert recipient — override with SALES_ALERT_WHATSAPP env var.
const SALES_ALERT_NUMBER = (process.env.SALES_ALERT_WHATSAPP || process.env.SALES_ALERT_NUMBER || '+60142319219').trim();

const sendLeadTemperatureAlert = async ({ companyName, sentiment, leadId, whatsapp }) => {
  try {
    const whatsappService = require('./whatsappService');
    const emoji = sentiment === 'hot' ? '🔥' : '🌡️';
    const label = sentiment === 'hot' ? 'HOT' : 'WARM';
    const contactLine = whatsapp ? `\n📱 *WhatsApp:* ${whatsapp}` : '';
    const message =
      `${emoji} *Sales Alert — Lead Heating Up!*\n\n` +
      `*${companyName}* has just turned *${label}*.${contactLine}\n\n` +
      `They are showing genuine interest and should be attended to promptly.\n\n` +
      `Open the Jordan Salesbot dashboard to follow up now.`;
    const result = await whatsappService.sendMessage(SALES_ALERT_NUMBER, message);
    if (result?.success) {
      console.log(`[Sentiment] Alert sent to ${SALES_ALERT_NUMBER} for lead ${leadId} (${sentiment})`);
      return result;
    } else {
      console.warn(`[Sentiment] Alert send failed for lead ${leadId}:`, result?.error, result?.details || '');
      return result || { success: false, error: 'Unknown alert send failure' };
    }
  } catch (err) {
    console.warn(`[Sentiment] Could not send temperature alert for lead ${leadId}:`, err.message);
    return { success: false, error: err.message };
  }
};

const normalizeIntentText = (value = '') =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const hasHotBuyingSignal = (text = '') => {
  const t = normalizeIntentText(text);
  if (!t) return false;
  return (
    /\b(price|pricing|quote|quotation|proposal|invoice|payment|deposit|buy|purchase|order|contract|delivery|timeline|lead time|demo|trial)\b/.test(t) ||
    /\b(how much|send me|can you quote|want to proceed|move forward|book|schedule)\b/.test(t)
  );
};

const hasSubstantiveInterest = (text = '') => {
  const t = normalizeIntentText(text);
  if (!t) return false;
  if (hasHotBuyingSignal(t)) return true;
  return (
    /\b(model|capacity|ton|tons|forklift|pallet|battery|lithium|indoor|outdoor|warehouse|factory|load|height|hours|compare|spec|specs|fit|suitable|recommend|interested|tell me more|more about|explain|details|how does|how it works)\b/.test(t) ||
    t.split(/\s+/).filter(Boolean).length >= 8
  );
};

const hasColdSignal = (text = '') => {
  const t = normalizeIntentText(text);
  if (!t) return false;
  return (
    /\b(not interested|not so interested|no longer interested|no thanks|stop|unsubscribe|wrong number|don't contact|do not contact|busy|too busy|no time|later|maybe later|not necessary|not needed)\b/.test(t) ||
    /\bnot\b.{0,24}\binterested\b/.test(t) ||
    /\bsorry\b.*\bbusy\b/.test(t)
  );
};

const isGenericPermission = (text = '') => {
  const t = normalizeIntentText(text);
  if (!t) return false;
  return /^(ok|okay|sure|yes|yep|yeah|make it quick|quick|send|go ahead|fine|alright|interesting|thanks|noted)\b/.test(t);
};

const scoreIntentText = (text = '') => {
  const t = normalizeIntentText(text);
  if (!t) return 0;
  if (hasHotBuyingSignal(t)) return 3;
  if (hasSubstantiveInterest(t)) return 1.4;
  if (hasColdSignal(t)) return -2.5;
  if (isGenericPermission(t)) return 0.2;
  return 0;
};

const calculateWeightedSentimentFromTexts = (texts = []) => {
  const inboundTexts = (Array.isArray(texts) ? texts : [])
    .map(normalizeIntentText)
    .filter(Boolean)
    .slice(-8);

  if (!inboundTexts.length) return 'neutral';

  let weightedScore = 0;
  let totalWeight = 0;
  inboundTexts.forEach((text, index) => {
    const recencyWeight = Math.pow(1.55, index);
    weightedScore += scoreIntentText(text) * recencyWeight;
    totalWeight += recencyWeight;
  });

  const normalizedScore = totalWeight ? weightedScore / totalWeight : 0;
  const latestScore = scoreIntentText(inboundTexts[inboundTexts.length - 1] || '');

  if (latestScore >= 3) return 'hot';
  if (latestScore <= -2.5) return 'cold';
  if (normalizedScore >= 2.1) return 'hot';
  if (normalizedScore >= 0.75) return 'warm';
  if (normalizedScore <= -0.9) return 'cold';
  return 'neutral';
};

const getInboundCustomerTexts = (messages = []) =>
  (Array.isArray(messages) ? messages : [])
    .filter((msg) => String(msg.status || '').toLowerCase() === 'received')
    .map((msg) => normalizeIntentText(msg.content || msg.messageContent || ''))
    .filter(Boolean);

/**
 * Analyze sentiment using AI
 * Sends conversation messages to LLM and asks for sentiment classification
 * 
 * Sentiment Definitions:
 * hot: Highly interested, engaged, positive responses
 * warm: Interested, responsive, moderately positive
 * neutral: Uncertain, minimal response, no clear intent
 * cold: Disengaged, no response, or negative signals
 */
const analyzeSentimentWithAI = async (messages = []) => {
  try {
    if (!messages || messages.length === 0) {
      return 'neutral';
    }

    // Only customer messages are analyzed. Sales/team/bot replies must not make a lead warmer.
    const customerTexts = getInboundCustomerTexts(messages);
    if (customerTexts.length === 0) return 'neutral';

    const weightedSentiment = calculateWeightedSentimentFromTexts(customerTexts);
    const latestCustomerText = customerTexts[customerTexts.length - 1] || '';
    if (hasColdSignal(latestCustomerText) || hasHotBuyingSignal(latestCustomerText)) {
      return weightedSentiment;
    }

    const conversationText = customerTexts
      .map((content, index) => `CUSTOMER MESSAGE ${index + 1}:\n${content}`)
      .join('\n\n---\n\n');

    // Create prompt for sentiment analysis
    const analysisPrompt = `Analyze ONLY the customer's messages below.
Do NOT infer interest from sales team, bot, or assistant replies. They are intentionally excluded.
Determine the customer's sentiment and interest level based only on what the customer wrote.

CUSTOMER MESSAGES ONLY:
${conversationText}

SENTIMENT CLASSIFICATIONS:
- hot: Actively pushing toward a deal — asking about pricing/timeline/next steps, requesting demos or proposals, showing urgency, or confirming they want to proceed
- warm: Genuinely engaged over multiple exchanges — asking substantive questions, sharing their specific situation, or clearly inviting further conversation (NOT just polite one-liners)
- neutral: Early-stage or vague — short/generic replies like "Yes sure", "OK", "Sounds good", "Maybe", or one-word answers with no follow-up questions or specifics
- cold: Disengaged — no replies, explicit rejection, "not interested", or only automated/out-of-office responses

CRITICAL RULES — apply these strictly before classifying:

RULE 1 — SHORT OR GENERIC REPLIES ARE NEUTRAL, NOT WARM:
  Responses like "Yes sure", "OK", "Sure", "Maybe", "I'll check", "Thanks", "Noted", "Interesting" are
  NEUTRAL by default, regardless of tone. A customer must demonstrate actual engagement with specifics
  to move above neutral.

RULE 2 — WARM REQUIRES SUBSTANCE ACROSS MULTIPLE MESSAGES:
  A lead is warm ONLY if the customer has sent at least 2 substantive replies that include one or more of:
  - Asking a specific question about features, pricing, timeline, or implementation
  - Describing their own business problem or situation in detail
  - Proposing or agreeing to a specific next step (not just "sure")
  - Sharing context that shows they are seriously evaluating the solution

RULE 3 — HOT REQUIRES CLEAR BUYING SIGNALS:
  A lead is hot ONLY if the customer shows strong purchase intent, such as:
  - Explicitly requesting a proposal, demo, trial, or contract
  - Asking about pricing, payment terms, or ROI
  - Mentioning a specific timeline or deadline for a decision
  - Saying they want to proceed or move forward
  - Introducing other decision-makers or stakeholders

RULE 4 — DON'T OVER-INFER FROM ONE MESSAGE:
  If the conversation is very short (1-2 customer messages total), default to NEUTRAL unless Rule 3
  signals are unmistakably present.

SCORING GUIDANCE:
- HOT: Clear buying intent signals (Rule 3) present — multiple strong signals preferred
- WARM: Genuine multi-message engagement with substance (Rule 2) — NOT just being polite
- NEUTRAL: Short/generic/vague responses, early stage, or insufficient data (Rule 1 & 4)
- COLD: Rejection, silence, or explicit disinterest

Respond with ONLY the sentiment classification word: hot, warm, neutral, or cold
Do not include any other text or explanation.`;

    // Call LLM for analysis
    const llm_messages = [
      {
        role: 'user',
        content: analysisPrompt,
      },
    ];

    const response = await callLLM(llm_messages, false); // Don't use reasoning for speed
    const sentiment = response.content.trim().toLowerCase();

    // Validate sentiment
    if (!['hot', 'warm', 'neutral', 'cold'].includes(sentiment)) {
      console.warn(`[Sentiment AI] Invalid sentiment returned: "${sentiment}", defaulting to neutral`);
      return 'neutral';
    }

    return sentiment;
  } catch (error) {
    console.error('[Sentiment AI] Error analyzing sentiment:', error.message);
    // Fallback to neutral on error
    return 'neutral';
  }
};

/**
 * Analyze sentiment for a single lead using AI
 * Only updates leads that have at least one message
 */
const analyzeSingleLead = async (leadId) => {
  try {
    // Fetch lead doc first so we can detect sentiment upgrades and get the company name.
    const leadDoc = await db.collection('leads').doc(leadId).get();
    const leadData = leadDoc.exists ? leadDoc.data() : {};
    const companyName = leadData.company || leadData.companyName || 'Unknown Company';

    // Fetch all messages for this lead across outbound + inbound channels
    const [outreachSnapshot, inboundEmailSnapshot, inboundWhatsAppSnapshot] = await Promise.all([
      db.collection('outreach_history').where('leadId', '==', leadId).get(),
      db.collection('inbound_emails').where('leadId', '==', leadId).get(),
      db.collection('inbound_whatsapp').where('leadId', '==', leadId).get().catch(() => null),
    ]);

    const outreachMessages = outreachSnapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        ...data,
        status: data.status || 'sent',
      };
    });

    const inboundEmailMessages = inboundEmailSnapshot.docs.map((doc) => ({
      ...doc.data(),
      status: 'received',
      channel: 'email',
    }));

    const inboundWhatsAppMessages = inboundWhatsAppSnapshot
      ? inboundWhatsAppSnapshot.docs.map((doc) => ({
          ...doc.data(),
          status: 'received',
          channel: 'whatsapp',
        }))
      : [];

    // Combine all messages
    const allMessages = [...outreachMessages, ...inboundEmailMessages, ...inboundWhatsAppMessages];

    // Skip leads with no messages - don't analyze or update
    if (allMessages.length === 0) {
      console.log(`[Sentiment AI] Skipped lead ${leadId}: no messages to analyze`);
      return null;
    }

    // Sort by timestamp
    allMessages.sort((a, b) => {
      const aTime = (a.createdAt || a.timestamp)?.toDate?.() || new Date(a.createdAt || a.timestamp);
      const bTime = (b.createdAt || b.timestamp)?.toDate?.() || new Date(b.createdAt || b.timestamp);
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    });

    // Only analyze the most recent 20 messages — old conversations from previous
    // outreach cycles should not keep inflating the sentiment score.
    const recentMessages = allMessages.slice(-20);

    // If there's no inbound (customer) reply yet, don't ask the LLM to guess "warm/hot"
    // based only on our outbound messages. Use a simple time-based heuristic.
    let sentiment;
    const hasInboundReply = recentMessages.some((msg) => String(msg.status || '').toLowerCase() === 'received');

    if (!hasInboundReply) {
      const lastMsg = recentMessages[recentMessages.length - 1];
      const lastTime = (lastMsg.createdAt || lastMsg.timestamp)?.toDate?.() || new Date(lastMsg.createdAt || lastMsg.timestamp);
      const hoursSinceLastOutbound = (Date.now() - new Date(lastTime).getTime()) / (1000 * 60 * 60);
      sentiment = hoursSinceLastOutbound >= 24 ? 'cold' : 'neutral';
    } else {
      // Analyze sentiment using AI
      sentiment = await analyzeSentimentWithAI(recentMessages);

      // If the last message in the conversation is outbound (customer hasn't replied to it yet),
      // cap at warm — can't be hot while waiting for a reply.
      const lastMsg = recentMessages[recentMessages.length - 1];
      const lastMsgIsOutbound = String(lastMsg.status || '').toLowerCase() !== 'received';
      if (lastMsgIsOutbound && sentiment === 'hot') {
        sentiment = 'warm';
        console.log(`[Sentiment AI] Capped lead ${leadId} from hot → warm: last message is outbound (awaiting reply)`);
      }
    }

    // Update lead with sentiment
    await db.collection('leads').doc(leadId).update({
      sentiment: sentiment,
      sentimentLastUpdated: new Date(),
      messageCount: allMessages.length,
      lastMessageTime: allMessages[allMessages.length - 1].createdAt || allMessages[allMessages.length - 1].timestamp,
      sentimentAnalysisMethod: 'ai',
    });

    console.log(`[Sentiment AI] Updated lead ${leadId}: ${sentiment} (${allMessages.length} messages)`);

    // Alert rules:
    // 1. Alert when a lead enters warm/hot from cold/neutral/empty.
    // 2. Alert on warm -> hot upgrade.
    // 3. Alert again after 24h if still warm/hot.
    // IMPORTANT: only mark alert sent after WhatsApp send succeeds. Failed sends must be retryable.
    const previousSentiment = String(leadData.sentiment || '').trim().toLowerCase();
    const isWarmHot = sentiment === 'warm' || sentiment === 'hot';
    const previousWasWarmHot = previousSentiment === 'warm' || previousSentiment === 'hot';
    const upgradedToHot = previousSentiment === 'warm' && sentiment === 'hot';
    const lastWarmHotAlert =
      leadData.lastWarmHotAlertSentAt?.toDate?.() ||
      leadData.lastAlertSentAt?.toDate?.() ||
      (leadData.lastWarmHotAlertSentAt ? new Date(leadData.lastWarmHotAlertSentAt) : null) ||
      (leadData.lastAlertSentAt ? new Date(leadData.lastAlertSentAt) : null);
    const hoursSinceWarmHotAlert = lastWarmHotAlert
      ? (Date.now() - lastWarmHotAlert.getTime()) / (1000 * 60 * 60)
      : Infinity;
    const shouldAlert =
      isWarmHot &&
      (!previousWasWarmHot || upgradedToHot || !lastWarmHotAlert || hoursSinceWarmHotAlert >= 24);

    if (shouldAlert) {
      const alertResult = await sendLeadTemperatureAlert({
        companyName,
        sentiment,
        leadId,
        whatsapp: leadData.whatsapp || leadData.contactWhatsApp || leadData.phone || '',
      });

      if (alertResult?.success) {
        await db.collection('leads').doc(leadId).update({
          lastWarmHotAlertSentAt: new Date(),
          lastWarmHotAlertSentiment: sentiment,
          lastWarmHotAlertStatus: 'sent',
          lastWarmHotAlertError: admin.firestore.FieldValue.delete(),
          lastAlertSentAt: new Date(),
        });
      } else {
        await db.collection('leads').doc(leadId).update({
          lastWarmHotAlertSentiment: sentiment,
          lastWarmHotAlertStatus: 'failed',
          lastWarmHotAlertError: alertResult?.error || 'Unknown alert send failure',
        });
      }
    }

    return sentiment;
  } catch (error) {
    console.error(`[Sentiment AI] Error analyzing lead ${leadId}:`, error.message);
    return null;
  }
};

/**
 * Analyze sentiment for all leads (batch operation with AI)
 * Only analyzes leads that have at least one message
 * Clears sentiment for leads with no messages
 */
const analyzeBatchSentiment = async () => {
  try {
    console.log(`[Sentiment AI] Starting batch sentiment analysis for all leads using AI...`);
    
    const leadsSnapshot = await db.collection('leads').get();
    const results = {
      total: leadsSnapshot.size,
      analyzed: 0,
      failed: 0,
      skipped: 0, // Leads with no messages
      cleared: 0, // Leads that had sentiment cleared
      byType: { hot: 0, warm: 0, neutral: 0, cold: 0 },
    };

    // Process each lead
    for (const leadDoc of leadsSnapshot.docs) {
      const leadId = leadDoc.id;
      
      // Check if this lead has any messages
      const outreachSnapshot = await db
        .collection('outreach_history')
        .where('leadId', '==', leadId)
        .limit(1)
        .get();

      const inboundSnapshot = await db
        .collection('inbound_emails')
        .where('leadId', '==', leadId)
        .limit(1)
        .get();

      const hasMessages = outreachSnapshot.size > 0 || inboundSnapshot.size > 0;

      if (!hasMessages) {
        // Clear sentiment for leads with no messages
        if (leadDoc.data().sentiment) {
          await db.collection('leads').doc(leadId).update({
            sentiment: admin.firestore.FieldValue.delete(),
            sentimentLastUpdated: admin.firestore.FieldValue.delete(),
            messageCount: 0,
            sentimentAnalysisMethod: admin.firestore.FieldValue.delete(),
          });
          results.cleared++;
        }
        results.skipped++;
        console.log(`[Sentiment AI] Cleared sentiment for lead ${leadId}: no messages`);
        continue;
      }

      const sentiment = await analyzeSingleLead(leadId);
      if (sentiment) {
        results.analyzed++;
        results.byType[sentiment]++;
      } else {
        results.failed++;
      }
      
      // Add small delay to avoid rate limiting on LLM API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Sentiment AI] Batch analysis complete:`, results);
    
    // Log analytics
    const analyticsRecord = {
      timestamp: new Date(),
      type: 'batch_sentiment_analysis',
      method: 'ai',
      totalLeads: results.total,
      analyzedLeads: results.analyzed,
      clearedLeads: results.cleared,
      skippedLeads: results.skipped,
      failedLeads: results.failed,
      distribution: results.byType,
    };

    await db.collection('analytics').add(analyticsRecord);

    return results;
  } catch (error) {
    console.error('[Sentiment AI] Error in batch analysis:', error.message);
    return { error: error.message };
  }
};

/**
 * Analyze sentiment for a specific lead when inbound email arrives (AI-powered)
 */
const triggerSentimentAnalysis = async (leadId, email) => {
  try {
    console.log(`[Sentiment AI] Triggered analysis for lead ${leadId} via inbound email from ${email}`);
    return await analyzeSingleLead(leadId);
  } catch (error) {
    console.error(`[Sentiment AI] Error in triggered analysis for ${leadId}:`, error.message);
  }
};

/**
 * Get sentiment distribution across all leads (optionally filtered by channel)
 */
const getSentimentDistribution = async (channel = null) => {
  try {
    // If a channel is specified, first get all unique email addresses with messages in that channel
    let contactsInChannel = new Set();
    
    if (channel) {
      // Get emails from outreach_history for this channel
      const outreachSnapshot = await db
        .collection('outreach_history')
        .where('channel', '==', channel)
        .get();
      
      outreachSnapshot.forEach(doc => {
        const data = doc.data() || {};
        const contact =
          channel === 'whatsapp'
            ? data.contactWhatsApp || data.contactPhone || data.contactEmail
            : data.contactEmail;
        if (contact) contactsInChannel.add(contact);
      });
      
      // Also get emails from inbound_emails (they are always 'email' channel)
      if (channel === 'email') {
        const inboundSnapshot = await db.collection('inbound_emails').get();
        inboundSnapshot.forEach(doc => {
          const email = doc.data().contactEmail;
          if (email) contactsInChannel.add(email);
        });
      }

      if (channel === 'whatsapp') {
        const inboundSnapshot = await db.collection('inbound_whatsapp').get().catch(() => null);
        if (inboundSnapshot) {
          inboundSnapshot.forEach(doc => {
            const wa = doc.data().contactWhatsApp;
            if (wa) contactsInChannel.add(wa);
          });
        }
      }
    }
    
    const leadsSnapshot = await db.collection('leads').get();
    
    const distribution = {
      hot: 0,
      warm: 0,
      neutral: 0,
      cold: 0,
      analyzed: 0, // Only leads that have messages and sentiment analysis
    };

    leadsSnapshot.forEach(doc => {
      const sentiment = doc.data().sentiment;
      const email =
        doc.data().contactEmail ||
        doc.data().email ||
        doc.data().personEmail ||
        doc.data().contact_email ||
        null;
      const whatsapp = doc.data().whatsapp || doc.data().contactWhatsApp || null;
      
      // If filtering by channel, only count leads with messages in that channel
      if (channel) {
        if (channel === 'whatsapp') {
          if (!whatsapp || !contactsInChannel.has(whatsapp)) return;
        } else {
          if (!email || !contactsInChannel.has(email)) return;
        }
      }
      
      // Only count leads that have a sentiment value (have been analyzed/have messages)
      if (sentiment && ['hot', 'warm', 'neutral', 'cold'].includes(sentiment)) {
        distribution[sentiment]++;
        distribution.analyzed++;
      }
    });

    return distribution;
  } catch (error) {
    console.error('[Sentiment AI] Error getting distribution:', error.message);
    return null;
  }
};

/**
 * Get sentiment trends over time
 */
const getSentimentTrends = async (days = 7) => {
  try {
    const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const analyticsSnapshot = await db
      .collection('analytics')
      .where('type', '==', 'batch_sentiment_analysis')
      .where('timestamp', '>=', daysAgo)
      .orderBy('timestamp', 'desc')
      .get();

    const trends = {
      period_days: days,
      snapshots: [],
      method: 'ai',
    };

    analyticsSnapshot.forEach(doc => {
      trends.snapshots.push({
        timestamp: doc.data().timestamp,
        data: doc.data().distribution,
      });
    });

    return trends;
  } catch (error) {
    console.error('[Sentiment AI] Error getting trends:', error.message);
    return null;
  }
};

module.exports = {
  analyzeSentimentWithAI,
  analyzeSingleLead,
  analyzeBatchSentiment,
  triggerSentimentAnalysis,
  getSentimentDistribution,
  getSentimentTrends,
};
