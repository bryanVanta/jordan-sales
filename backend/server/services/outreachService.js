/**
 * Outreach Service
 * Handles intelligent message generation and channel selection for lead outreach
 */

const { db } = require('../config/firebase');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const { generateMessageWithOpenClaw } = require('./openClawService');
const { generateSystemPrompt, callOpenRouter } = require('./llmService');

/**
 * Select the best communication channel based on available contact info
 * Priority: WhatsApp > Email
 */
function selectBestChannel(lead) {
  if (lead.whatsapp) {
    return {
      channel: 'whatsapp',
      contact: lead.whatsapp,
      displayName: 'WhatsApp',
    };
  }
  if (lead.email) {
    return {
      channel: 'email',
      contact: lead.email,
      displayName: 'Email',
    };
  }
  return null;
}

async function generateWhatsAppOutreachWithAI(lead, productInfoId = null) {
  const systemPrompt = await generateSystemPrompt(productInfoId);

  const companyName = lead.company || 'your company';
  const location = lead.location || '';

  const prompt = `Write ONE WhatsApp message to a potential customer.

Rules:
- 2 to 4 short sentences max
- No email formatting (no "Dear", no subject lines)
- Friendly, human, Malaysian tone (professional)
- Start with a greeting to the COMPANY (not a person). Example: "Hi ${companyName} team," or "Hi ${companyName},"
- Introduce us as "VantaTech" in the first sentence.
- Avoid opening with the word "demo" and avoid proposing a "demo" as the first CTA. Prefer a quick chat/call instead.
- Include a clear next step question (e.g. "Open to a quick 10-min chat this week?")
- If you mention the company name, use: ${companyName}
- If location helps, it is: ${location}

Return ONLY the message text.`;

  const response = await callOpenRouter(
    [
      { role: 'user', content: systemPrompt || 'You are a helpful sales assistant.' },
      { role: 'assistant', content: 'Understood.' },
      { role: 'user', content: prompt },
    ],
    false
  );

  return String(response?.content || '').trim();
}

/**
 * Generate a professional, personalized outreach message using templates
 */
async function generateOutreachMessage(lead, productInfo, channel, productInfoId = null) {
  try {
    // Add debugging logs to verify the lead object structure
    console.log('[Outreach] Lead object:', lead);

    // Ensure fallback values for lead properties
    const companyDetails = {
      companyName: lead.company || 'Unknown Company',
      industry: lead.industry || 'General Industry',
      location: lead.location || 'Unknown Location',
      contactName: lead.person || 'Valued Partner', // Added fallback for undefined contactName
    };

    // Add debugging logs to verify the companyDetails object
    console.log('[Outreach] companyDetails object:', companyDetails);

    if (channel === 'email') {
      const generatedMessage = await generateMessageWithOpenClaw(productInfo, companyDetails);

      console.log('[Outreach] Generated message type:', typeof generatedMessage);
      console.log('[Outreach] Generated message preview:', String(generatedMessage).slice(0, 100));
      return {
        subject: `Exciting Opportunity for ${companyDetails.companyName}`,
        body: String(generatedMessage), // Ensure it's a string
      };
    } else if (channel === 'whatsapp') {
      const whatsappText = await generateWhatsAppOutreachWithAI(lead, productInfoId);
      return {
        body: whatsappText,
      };
    } else if (channel === 'phone') {
      return {
        body: `Hi ${companyDetails.contactName}, I wanted to discuss an opportunity for ${companyDetails.companyName}. Please let me know if you have a moment to chat.`,
      };
    }

    return null;
  } catch (error) {
    console.error('[Outreach] Error generating message:', error);
    return null;
  }
}

/**
 * Send outreach message via the selected channel
 */
async function sendOutreachMessage(lead, messageContent, channelInfo) {
  try {
    const { channel, contact, displayName } = channelInfo;

    console.log(`[Outreach] Sending ${channel} to ${lead.company} (${contact})`);

    let result;

    if (channel === 'email') {
      result = await emailService.sendEmail(
        contact,
        messageContent.subject,
        messageContent.body,
        process.env.OUTREACH_FROM_EMAIL || 'sales@servia.com'
      );
    } else if (channel === 'whatsapp') {
      result = await whatsappService.sendMessage(contact, messageContent.body);
    } else if (channel === 'phone') {
      // SMS fallback - log for now
      console.log(`[Outreach] SMS would be sent to ${contact}: ${messageContent.body}`);
      result = { success: true, messageId: `sms-${lead.id}` };
    }

    if (!result?.success) {
      const detailBits = [];
      if (result?.error) detailBits.push(result.error);
      if (result?.details) detailBits.push(result.details);
      console.warn(
        `[Outreach] ${displayName} send failed for ${lead.company}:`,
        detailBits.length > 0 ? detailBits.join(' | ') : result
      );
    }

    return result;
  } catch (error) {
    console.error(`[Outreach] Error sending message to ${lead.company}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Save outreach record to Firestore
 */
async function saveOutreachRecord(lead, channel, messageContent, result) {
  try {
    const fullMessage = messageContent.body;
    const messagePreview = fullMessage.substring(0, 200);

    const record = {
      leadId: lead.id,
      company: lead.company || 'Unknown Company',
      contactPerson: lead.person || null,
      contactEmail: lead.email || null,
      contactPhone: lead.phone || null,
      contactWhatsApp: lead.whatsapp || null,
      channel: channel,
      messageSubject: messageContent.subject || null, // For email channel
      messageContent: fullMessage, // Store ENTIRE message with newlines preserved
      messagePreview: messagePreview,
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error || null,
      errorDetails: result.details || null,
      messageId: result.messageId || null,
      type: messageContent.type || null,
      source: messageContent.source || null,
      timestamp: new Date(),
      createdAt: new Date(),
    };

    const docRef = await db.collection('outreach_history').add(record);
    console.log(`[Outreach] Record saved to Firestore: ${docRef.id}`);
    
    // Also update the lead's status
    await db.collection('leads').doc(lead.id).update({
      lastOutreach: new Date(),
      outreachChannel: channel,
      outreachStatus: result.success ? 'sent' : 'failed',
    });

    console.log(`[Outreach] Recorded outreach to ${lead.company} (ID: ${docRef.id})`);
    return docRef.id;
  } catch (error) {
    console.error('[Outreach] Error saving outreach record:', error.message);
    return null;
  }
}

/**
 * Execute bulk outreach to multiple leads
 */
async function executeBulkOutreach(leadIds, productInfoId = 'current', options = {}) {
  try {
    console.log(`[Outreach] Starting bulk outreach for ${leadIds.length} leads...`);
    const channelOverride = (options.channel || '').trim().toLowerCase() || null;

    const results = {
      total: leadIds.length,
      successful: 0,
      failed: 0,
      details: [],
    };

    // Get product info for context
    const productDoc = await db.collection('products').doc(productInfoId).get();
    const productInfo = productDoc.exists ? productDoc.data() : {};

    // Process each lead
    for (const leadId of leadIds) {
      try {
        // Get lead details
        const leadDoc = await db.collection('leads').doc(leadId).get();
        if (!leadDoc.exists) {
          console.warn(`[Outreach] Lead ${leadId} not found`);
          results.failed++;
          results.details.push({
            leadId,
            status: 'failed',
            reason: 'Lead not found',
          });
          continue;
        }

        const lead = { id: leadDoc.id, ...leadDoc.data() };

        // Select channel (allow explicit override from API)
        let channelInfo = null;

        if (channelOverride) {
          if (channelOverride === 'whatsapp') {
            const whatsappTarget = lead.whatsapp || '';
            if (whatsappTarget) {
              channelInfo = {
                channel: 'whatsapp',
                contact: whatsappTarget,
                displayName: 'WhatsApp',
              };
            }
          } else if (channelOverride === 'email') {
            if (lead.email) {
              channelInfo = { channel: 'email', contact: lead.email, displayName: 'Email' };
            }
          }
        }

        if (!channelInfo) channelInfo = selectBestChannel(lead);
        if (!channelInfo) {
          console.warn(`[Outreach] No contact info for ${lead.company}`);
          results.failed++;
          results.details.push({
            leadId,
            company: lead.company,
            status: 'failed',
            reason: 'No contact information',
          });
          continue;
        }

        // Generate personalized message
        const messageContent = await generateOutreachMessage(lead, productInfo, channelInfo.channel, productInfoId);
        if (!messageContent) {
          results.failed++;
          results.details.push({
            leadId,
            company: lead.company,
            status: 'failed',
            reason: 'Failed to generate message',
          });
          continue;
        }

        // Send message
        const sendResult = await sendOutreachMessage(lead, messageContent, channelInfo);

        // Record the outreach
        await saveOutreachRecord(lead, channelInfo.channel, messageContent, sendResult);

        if (sendResult.success) {
          results.successful++;
          results.details.push({
            leadId,
            company: lead.company,
            channel: channelInfo.displayName,
            status: 'sent',
            messagePreview: messageContent.body.substring(0, 100),
          });
        } else {
          results.failed++;
          results.details.push({
            leadId,
            company: lead.company,
            channel: channelInfo.displayName,
            status: 'failed',
            reason: sendResult.error,
            details: sendResult.details || null,
          });
        }

        // Add small delay between sends to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[Outreach] Error processing lead ${leadId}:`, error.message);
        results.failed++;
        results.details.push({
          leadId,
          status: 'failed',
          reason: error.message,
        });
      }
    }

    console.log(`[Outreach] Bulk outreach complete: ${results.successful} sent, ${results.failed} failed`);
    return results;
  } catch (error) {
    console.error('[Outreach] Fatal error in bulk outreach:', error.message);
    throw error;
  }
}

module.exports = {
  selectBestChannel,
  generateOutreachMessage,
  sendOutreachMessage,
  saveOutreachRecord,
  executeBulkOutreach,
};
