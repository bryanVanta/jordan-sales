/**
 * Inbound Email Webhook Route
 * Receives incoming emails from Resend and stores them in Firestore
 */

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const resendService = require('../services/resendService');

/**
 * POST /api/webhooks/inbound-email
 * Webhook endpoint to receive inbound emails from Resend
 * Body should contain: from, to, subject, text, html, messageId, timestamp
 */
router.post('/inbound-email', async (req, res) => {
  try {
    const emailData = req.body;
    
    console.log(`[Webhook] Received inbound email from ${emailData.from} to ${emailData.to}`);
    console.log(`[Webhook] Full email data:`, JSON.stringify(emailData, null, 2));

    // Process the inbound email
    const inboundEmail = await resendService.processInboundEmail(emailData);

    // Find the lead by email address - try multiple field names
    const leadsRef = db.collection('leads');
    let leadId = null;
    let leadData = null;

    // Try different field names to find the lead
    const fieldNamesToTry = ['email', 'contactEmail', 'personEmail'];
    
    for (const fieldName of fieldNamesToTry) {
      if (leadId) break; // If we found a lead, stop searching
      
      try {
        console.log(`[Webhook] Searching for lead with ${fieldName} = ${inboundEmail.sender}`);
        const querySnapshot = await leadsRef
          .where(fieldName, '==', inboundEmail.sender)
          .limit(1)
          .get();

        if (!querySnapshot.empty) {
          leadId = querySnapshot.docs[0].id;
          leadData = querySnapshot.docs[0].data();
          console.log(`[Webhook] ✅ Found matching lead using ${fieldName}: ${leadId}`, leadData);
          break;
        }
      } catch (fieldError) {
        console.warn(`[Webhook] Field ${fieldName} search failed:`, fieldError.message);
      }
    }

    if (!leadId) {
      console.warn(`[Webhook] ⚠️ No lead found for email: ${inboundEmail.sender}. Creating record without lead association.`);
    }

    // Save inbound email to Firestore
    const inboundRecord = await db.collection('inbound_emails').add({
      leadId: leadId || null,
      company: leadData?.company || 'Unknown',
      contactPerson: leadData?.contactPerson || 'Unknown',
      contactEmail: inboundEmail.sender,
      subject: inboundEmail.subject,
      content: inboundEmail.content,
      messageId: inboundEmail.messageId,
      replyTo: inboundEmail.replyTo,
      status: 'received',
      timestamp: new Date(inboundEmail.timestamp),
      createdAt: new Date(),
      source: 'resend',
    });

    console.log(`[Webhook] Inbound email saved to Firestore: ${inboundRecord.id}`);

    // Also save as a message in outreach_history for chat display
    await db.collection('outreach_history').add({
      leadId: leadId ? parseInt(leadId) : null,
      company: leadData?.company || 'Unknown',
      contactPerson: leadData?.contactPerson || 'Unknown',
      contactEmail: inboundEmail.sender,
      channel: 'email',
      messageSubject: `Re: ${inboundEmail.subject}`,
      messageContent: inboundEmail.content,
      messagePreview: inboundEmail.content.substring(0, 200),
      status: 'received',
      messageId: inboundEmail.messageId,
      type: 'inbound_reply',
      timestamp: new Date(inboundEmail.timestamp),
      createdAt: new Date(),
    });

    console.log(`[Webhook] Inbound email also saved to outreach_history for chat display`);

    res.json({
      success: true,
      message: 'Inbound email processed and stored',
      recordId: inboundRecord.id,
    });
  } catch (error) {
    console.error('[Webhook] Error processing inbound email:', error);
    res.status(500).json({
      error: 'Failed to process inbound email',
      details: error.message,
    });
  }
});

/**
 * GET /api/webhooks/debug/inbound-emails
 * Debug endpoint to view all inbound emails stored
 */
router.get('/debug/inbound-emails', async (req, res) => {
  try {
    const inboundRef = db.collection('inbound_emails');
    const snapshot = await inboundRef.limit(50).get();
    
    const emails = [];
    snapshot.forEach((doc) => {
      emails.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    console.log(`[Debug] Found ${emails.length} inbound emails`);
    res.json({
      success: true,
      count: emails.length,
      emails: emails,
    });
  } catch (error) {
    console.error('[Debug] Error fetching inbound emails:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/debug/leads
 * Debug endpoint to view all leads and their email fields
 */
router.get('/debug/leads', async (req, res) => {
  try {
    const leadsRef = db.collection('leads');
    const snapshot = await leadsRef.limit(50).get();
    
    const leads = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      leads.push({
        id: doc.id,
        email: data.email,
        contactEmail: data.contactEmail,
        personEmail: data.personEmail,
        company: data.company || data.companyName,
        person: data.person,
        phone: data.phone,
        whatsapp: data.whatsapp,
      });
    });
    
    console.log(`[Debug] Found ${leads.length} leads`);
    res.json({
      success: true,
      count: leads.length,
      leads: leads,
    });
  } catch (error) {
    console.error('[Debug] Error fetching leads:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/debug/conversation/:email
 * Debug endpoint to view conversation for a specific email
 */
router.get('/debug/conversation/:email', async (req, res) => {
  try {
    const email = req.params.email;
    console.log(`[Debug] Fetching conversation for email: ${email}`);
    
    // Fetch outbound messages
    const outreachRef = db.collection('outreach_history');
    const outreachQuery = outreachRef.where('contactEmail', '==', email);
    const outreachSnapshot = await outreachQuery.get();
    
    // Fetch inbound messages
    const inboundRef = db.collection('inbound_emails');
    const inboundQuery = inboundRef.where('contactEmail', '==', email);
    const inboundSnapshot = await inboundQuery.get();
    
    const outbound = [];
    const inbound = [];
    
    outreachSnapshot.forEach((doc) => {
      outbound.push({ id: doc.id, ...doc.data() });
    });
    
    inboundSnapshot.forEach((doc) => {
      inbound.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`[Debug] Found ${outbound.length} outbound and ${inbound.length} inbound messages`);
    
    res.json({
      success: true,
      email: email,
      outbound: { count: outbound.length, messages: outbound },
      inbound: { count: inbound.length, messages: inbound },
    });
  } catch (error) {
    console.error('[Debug] Error fetching conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
