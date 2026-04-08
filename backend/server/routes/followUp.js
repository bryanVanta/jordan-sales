const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const emailService = require('../services/emailService');
const resendService = require('../services/resendService');

/**
 * POST /api/follow-up/send
 * Send a follow-up email to a lead
 * Body: { leadId, company, message, email }
 */
router.post('/send', async (req, res) => {
  try {
    const { leadId, company, message, email } = req.body;
    
    if (!leadId || !message || !email) {
      return res.status(400).json({ error: 'Missing required fields: leadId, message, email' });
    }

    console.log(`[Follow-up] Sending follow-up email to ${email} for lead ${leadId}`);
    
    // Get lead info from Firestore
    const leadDoc = await db.collection('leads').doc(leadId.toString()).get();
    if (!leadDoc.exists) {
      console.warn(`[Follow-up] Lead ${leadId} not found in Firestore`);
    }

    const leadData = leadDoc.data() || {};
    const contactEmail = email || leadData.contactEmail;
    const contactPerson = leadData.contactPerson || 'Contact';
    const companyName = company || leadData.company || 'Company';

    const subject = `Follow-up: ${companyName}`;

    const provider =
      (process.env.EMAIL_PROVIDER || '').trim().toLowerCase() ||
      (process.env.RESEND_API_KEY ? 'resend' : 'smtp');

    const emailResult =
      provider === 'resend'
        ? await resendService.sendEmail(
            contactEmail,
            subject,
            message,
            process.env.OUTREACH_FROM_EMAIL ||
              process.env.RESEND_FROM_EMAIL ||
              process.env.DEFAULT_FROM_EMAIL
          )
        : await emailService.sendEmail(contactEmail, subject, message);
    
    if (!emailResult.success) {
      throw new Error(emailResult.error);
    }

    console.log(`[Follow-up] Email sent successfully: ${emailResult.messageId}`);

    // Save follow-up record to Firestore
    const followUpData = {
      leadId: leadId,  // Keep as string - this is the Firebase document ID
      company: companyName,
      contactPerson,
      contactEmail,
      channel: 'email',
      messageSubject: subject,
      messageContent: message,
      messagePreview: message.substring(0, 200),
      status: 'sent',
      type: 'follow-up',
      timestamp: new Date(),
      createdAt: new Date(),
      source: provider,
    };

    // Only add messageId if it exists
    if (emailResult.messageId) {
      followUpData.messageId = emailResult.messageId;
    }

    const followUpRef = await db.collection('outreach_history').add(followUpData);

    console.log(`[Follow-up] Record saved to Firestore: ${followUpRef.id}`);

    res.json({
      success: true,
      message: 'Follow-up email sent successfully',
      provider,
      messageId: emailResult.messageId,
      recordId: followUpRef.id,
    });
  } catch (error) {
    console.error('[Follow-up] Error sending follow-up:', error);
    res.status(500).json({
      error: 'Failed to send follow-up email',
      details: error.message,
    });
  }
});

module.exports = router;
