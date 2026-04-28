const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const whatsappService = require('../services/whatsappService');
const { maybeStoreInboundMedia } = require('../services/mediaStorageService');

/**
 * POST /api/whatsapp/send
 * Send a WhatsApp message to a lead
 * Body: { leadId, company?, message?, whatsapp?, media? }
 */
router.post('/send', async (req, res) => {
  try {
    const { leadId, company, message, whatsapp, media } = req.body || {};
    const messageText = typeof message === 'string' ? message.trim() : String(message ?? '').trim();
    const mediaList = Array.isArray(media) ? media.filter(Boolean) : media && typeof media === 'object' ? [media] : [];

    if (!leadId || (!messageText && mediaList.length === 0)) {
      return res.status(400).json({ error: 'Missing required fields: leadId and message or media' });
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

    const storedMedia = await maybeStoreInboundMedia({ media: mediaList }).catch(() =>
      mediaList.length === 1 ? mediaList[0] : mediaList.length ? mediaList : null
    );
    const storedMediaList = Array.isArray(storedMedia) ? storedMedia : storedMedia ? [storedMedia] : [];
    const mediaUrls = storedMediaList.map((item) => String(item?.url || '').trim()).filter((url) => /^https?:\/\//i.test(url));

    const sendResult = await whatsappService.sendMessage(contactWhatsApp, messageText || (mediaUrls.length ? ' ' : ''), { mediaUrls });
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
      messageContent: messageText,
      messagePreview: (messageText || (storedMediaList.length ? '[Image]' : '')).substring(0, 200),
      status: sendResult.success ? 'sent' : 'failed',
      errorMessage: sendResult.error || null,
      errorDetails: sendResult.details || null,
      messageId: sendResult.messageId || null,
      type: 'follow-up',
      timestamp: new Date(),
      createdAt: new Date(),
      source: (process.env.WHATSAPP_PROVIDER || 'twilio').trim().toLowerCase(),
      ...(storedMedia ? { media: storedMedia } : {}),
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
      media: storedMedia || null,
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

