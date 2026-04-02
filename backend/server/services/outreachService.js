/**
 * Outreach Service
 * Handles intelligent message generation and channel selection for lead outreach
 */

const { db } = require('../config/firebase');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const { generateMessageWithOpenClaw } = require('./openClawService');

/**
 * Select the best communication channel based on available contact info
 * Priority: WhatsApp > Email > Phone
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
  if (lead.phone) {
    return {
      channel: 'phone',
      contact: lead.phone,
      displayName: 'Phone/SMS',
    };
  }
  return null;
}

/**
 * Generate a professional, personalized outreach message using templates
 */
async function generateOutreachMessage(lead, productInfo, channel) {
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

    const generatedMessage = await generateMessageWithOpenClaw(productInfo, companyDetails);

    if (channel === 'email') {
      return {
        subject: `Exciting Opportunity for ${companyDetails.companyName}`,
        body: generatedMessage,
      };
    } else if (channel === 'whatsapp') {
      return {
        body: generatedMessage,
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
    const record = {
      leadId: lead.id,
      company: lead.company,
      contactPerson: lead.person,
      channel: channel,
      messagePreview: messageContent.body.substring(0, 200),
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error || null,
      messageId: result.messageId || null,
      timestamp: new Date(),
      createdAt: new Date(),
    };

    const docRef = await db.collection('outreach_history').add(record);
    
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
async function executeBulkOutreach(leadIds, productInfoId = 'current') {
  try {
    console.log(`[Outreach] Starting bulk outreach for ${leadIds.length} leads...`);

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

        // Select best channel
        const channelInfo = selectBestChannel(lead);
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
        const messageContent = await generateOutreachMessage(lead, productInfo, channelInfo.channel);
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
