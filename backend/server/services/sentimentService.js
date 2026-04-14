/**
 * Sentiment Analysis Service - AI-Powered
 * Uses LLM (OpenRouter via llmService) to analyze customer sentiment from email conversations
 */

const { db, admin } = require('../config/firebase');
const { callOpenRouter } = require('./llmService');

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

    // Format messages for AI analysis
    const conversationText = messages
      .map(msg => {
        const sender = msg.status === 'received' ? 'CUSTOMER' : 'SALES_TEAM';
        const subject = msg.subject || msg.messageSubject ? `[${msg.subject || msg.messageSubject}]` : '';
        const content = msg.content || msg.messageContent || '';
        return `${sender}: ${subject}\n${content}`;
      })
      .join('\n\n---\n\n');

    // Create prompt for sentiment analysis
    const analysisPrompt = `Analyze the following email conversation between a sales team and a potential customer. 
Determine the customer's sentiment and interest level based on comprehensive signals.

CONVERSATION:
${conversationText}

SENTIMENT CLASSIFICATIONS:
- hot: Highly interested, actively engaged, strong buying signals, ready for next steps
- warm: Interested, responsive, positive signals, but moving at measured pace
- neutral: Unclear or minimal engagement, polite but no clear buying intent
- cold: Disengaged, unresponsive, negative tone, or explicitly uninterested

ANALYSIS FACTORS (Consider all of these):

1. RESPONSE BEHAVIOR:
   - Response speed: How quickly do they reply? (faster = more interested)
   - Response consistency: Do they reply each time or go silent?
   - Initiation: Did they start the conversation or only respond?

2. MESSAGE CONTENT & QUALITY:
   - Message length: Longer, detailed messages vs brief, generic replies
   - Specificity: References to your product/service details
   - Questions: Asking detailed questions about implementation, features, pricing
   - Objections: Raising concerns shows engagement; no response suggests disinterest

3. TONE & LANGUAGE:
   - Tone: Enthusiastic, positive, collaborative vs dismissive, cold, generic
   - Professionalism: Well-written, thoughtful vs lazy, careless
   - Personalization: Do they mention your name, company details, or customize responses?
   - Formality level: Friendly, warm language vs overly formal or detached

4. EAGERNESS & INTENT SIGNALS:
   - Timeline mentions: "We need this by...", "Looking to implement soon"
   - Budget discussion: Asking about pricing, payment terms, ROI
   - Decision authority: Language suggesting they can make or influence decisions
   - Next steps: Proposing meetings, demos, trials, or action items
   - Action requests: "Can you send proposal?", "Let's schedule a call"

5. ENGAGEMENT DEPTH:
   - Follow-up initiations: Do they follow up if you don't respond?
   - Meeting requests: Asking for calls, demos, or in-person meetings
   - Document/material requests: Asking for case studies, whitepapers, proposals
   - Stakeholder involvement: Mentioning others who need to be involved
   - Technical depth: Showing understanding of your solution's complexities

6. ADDITIONAL POSITIVE SIGNALS:
   - Positive feedback: Compliments about your product/service
   - Referral willingness: "We'd recommend you to..."
   - Expansion opportunity: "We have other departments that need..."
   - Urgency language: "ASAP", "urgent", "time-sensitive"
   - Competitive comparison: Comparing you favorably to alternatives
   - Use case specificity: Describing their exact problem/need

7. NEGATIVE SIGNALS:
   - Delayed responses: Going silent for extended periods then brief replies
   - Objection dismissal: Rejecting solutions without engagement
   - Price sensitivity complaints: Only focusing on cost, not value
   - "We'll think about it" without specifics: Vague, non-committal language
   - Competitor mentions: Saying they're going with competitor or looking elsewhere
   - Generic responses: Template/copy-paste style answers worse than previous messages

SCORING GUIDANCE:
- HOT: Multiple positive signals (fast replies, long messages, questions, meeting requests, timeline/budget discussion)
- WARM: Some positive signals (responsive, positive tone, occasional questions, willing to engage)
- NEUTRAL: Mixed or unclear (brief replies, polite but vague, no clear intent signals)
- COLD: Negative signals dominate (no response, short dismissive replies, explicit rejection, gone silent)

Respond with ONLY the sentiment classification word: hot, warm, neutral, or cold
Do not include any other text or explanation.`;

    // Call LLM for analysis
    const llm_messages = [
      {
        role: 'user',
        content: analysisPrompt,
      },
    ];

    const response = await callOpenRouter(llm_messages, false); // Don't use reasoning for speed
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

    // If there's no inbound (customer) reply yet, don't ask the LLM to guess "warm/hot"
    // based only on our outbound messages. Use a simple time-based heuristic.
    let sentiment;
    const hasInboundReply = allMessages.some((msg) => String(msg.status || '').toLowerCase() === 'received');

    if (!hasInboundReply) {
      const lastMsg = allMessages[allMessages.length - 1];
      const lastTime = (lastMsg.createdAt || lastMsg.timestamp)?.toDate?.() || new Date(lastMsg.createdAt || lastMsg.timestamp);
      const hoursSinceLastOutbound = (Date.now() - new Date(lastTime).getTime()) / (1000 * 60 * 60);
      sentiment = hoursSinceLastOutbound >= 24 ? 'cold' : 'neutral';
    } else {
      // Analyze sentiment using AI
      sentiment = await analyzeSentimentWithAI(allMessages);
    }

    // Update lead with sentiment
    await db.collection('leads').doc(leadId).update({
      sentiment: sentiment,
      sentimentLastUpdated: new Date(),
      messageCount: allMessages.length,
      lastMessageTime: allMessages[allMessages.length - 1].createdAt || allMessages[allMessages.length - 1].timestamp,
      sentimentAnalysisMethod: 'ai', // Track that this was AI-analyzed
    });

    console.log(`[Sentiment AI] Updated lead ${leadId}: ${sentiment} (${allMessages.length} messages)`);
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
