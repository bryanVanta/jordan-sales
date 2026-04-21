const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const whatsappService = require('../services/whatsappService');

/**
 * POST /api/whatsapp/send
 * Send a WhatsApp message to a lead
 * Body: { leadId, company?, message, whatsapp? }
 */
router.post('/send', async (req, res) => {
  try {
    const { leadId, company, message, whatsapp } = req.body || {};

    if (!leadId || !message) {
      return res.status(400).json({ error: 'Missing required fields: leadId, message' });
    }

    const leadDoc = await db.collection('leads').doc(String(leadId)).get();
    const leadData = leadDoc.exists ? leadDoc.data() : {};

    const companyName = company || leadData?.company || leadData?.companyName || 'Company';
    const contactWhatsApp = (whatsapp || leadData?.whatsapp || leadData?.contactWhatsApp || '').trim();
    const contactPhone = (leadData?.phone || leadData?.contactPhone || '').trim();

    if (!contactWhatsApp) {
      return res.status(400).json({
        error: 'Missing WhatsApp number',
        details: 'Provide `whatsapp` or set `whatsapp` on the lead record.',
      });
    }

    console.log(`[WhatsApp] Sending message to ${contactWhatsApp} for lead ${leadId}`);

    const sendResult = await whatsappService.sendMessage(contactWhatsApp, String(message));
    if (!sendResult?.success) {
      console.warn('[WhatsApp] Send failed:', sendResult?.error || 'Unknown error', sendResult?.details || '');
    }

    // Save outreach record
    const record = {
      leadId: String(leadId),
      company: companyName,
      contactPerson: leadData?.person || leadData?.contactPerson || null,
      contactEmail: leadData?.email || leadData?.contactEmail || null,
      contactPhone: contactPhone || null,
      contactWhatsApp: contactWhatsApp || null,
      channel: 'whatsapp',
      messageSubject: null,
      messageContent: String(message),
      messagePreview: String(message).substring(0, 200),
      status: sendResult.success ? 'sent' : 'failed',
      errorMessage: sendResult.error || null,
      errorDetails: sendResult.details || null,
      messageId: sendResult.messageId || null,
      type: 'follow-up',
      timestamp: new Date(),
      createdAt: new Date(),
      source: (process.env.WHATSAPP_PROVIDER || 'twilio').trim().toLowerCase(),
    };

    const docRef = await db.collection('outreach_history').add(record);

    // Update lead status fields (best-effort)
    try {
      await db.collection('leads').doc(String(leadId)).update({
        lastOutreach: new Date(),
        outreachChannel: 'whatsapp',
        outreachStatus: sendResult.success ? 'sent' : 'failed',
      });
    } catch (updateError) {
      console.warn('[WhatsApp] Failed updating lead outreach fields:', updateError.message);
    }

    const responseBody = {
      success: sendResult.success,
      provider: record.source,
      messageId: sendResult.messageId || null,
      recordId: docRef.id,
      error: sendResult.success ? null : sendResult.error,
      details: sendResult.success ? null : sendResult.details || null,
    };

    res.status(sendResult.success ? 200 : 502).json(responseBody);
  } catch (error) {
    console.error('[WhatsApp] Error sending message:', error);
    res.status(500).json({ error: 'Failed to send WhatsApp message', details: error.message });
  }
});

module.exports = router;

