/**
 * Test Routes - FOR DEVELOPMENT/TESTING ONLY
 * Allows creating test data for different channels
 */

const express = require('express');
const { db } = require('../config/firebase');
const router = express.Router();

/**
 * POST /api/test/create-sample-messages/:channel
 * Create sample messages for a specific channel (email|whatsapp|telegram)
 */
router.post('/create-sample-messages/:channel', async (req, res) => {
  try {
    const { channel } = req.params;
    const validChannels = ['email', 'whatsapp', 'telegram'];

    if (!validChannels.includes(channel)) {
      return res.status(400).json({
        error: 'Invalid channel',
        validChannels
      });
    }

    // Create sample lead data
    const sampleLeads = {
      email: {
        company: 'Tech Solutions Inc',
        contactEmail: 'contact@techsolutions.com',
        contactPerson: 'John Smith',
        messages: [
          'Hi John, I wanted to discuss how our SERVIA platform can help streamline your operations.',
          'Thanks for reaching out! We are indeed looking for solutions to improve our workflow.'
        ]
      },
      whatsapp: {
        company: 'Global Marketing Co',
        contactEmail: 'info@globalmarketing.com',
        contactPerson: 'Maria Garcia',
        messages: [
          'Hey Maria! 👋 Just wanted to check in about the opportunity we discussed.',
          'Hi! Yes, I am interested. Can we schedule a call this week?'
        ]
      },
      telegram: {
        company: 'Digital Agency Plus',
        contactEmail: 'hello@digitalagency.com',
        contactPerson: 'Alex Chen',
        messages: [
          'Hi Alex, saw your profile and thought you might be interested in our solution.',
          'Thanks for reaching out! Can you send me more details?'
        ]
      }
    };

    const leadData = sampleLeads[channel];

    // Create outreach messages
    const outreachMessages = [];
    for (let i = 0; i < leadData.messages.length; i++) {
      const message = {
        leadId: `test-${channel}-${i}`,
        company: leadData.company,
        contactPerson: leadData.contactPerson,
        contactEmail: leadData.contactEmail,
        channel: channel,
        messageSubject: `Test Message - ${channel}`,
        messageContent: leadData.messages[i],
        messagePreview: leadData.messages[i].substring(0, 100),
        status: i === 0 ? 'sent' : 'received',
        timestamp: new Date(Date.now() - (leadData.messages.length - i) * 3600000), // Stagger by hours
        createdAt: new Date(),
        messageId: `msg-${channel}-${i}`,
        type: i === 0 ? 'outreach' : 'reply'
      };

      const docRef = await db.collection('outreach_history').add(message);
      outreachMessages.push({
        id: docRef.id,
        ...message
      });
      console.log(`[Test] Created ${channel} message #${i + 1}`);
    }

    res.json({
      success: true,
      channel,
      messagesCreated: outreachMessages.length,
      company: leadData.company,
      contact: leadData.contactEmail,
      messages: outreachMessages.map(m => ({
        id: m.id,
        status: m.status,
        preview: m.messagePreview
      }))
    });

  } catch (error) {
    console.error('[Test] Error creating sample messages:', error);
    res.status(500).json({
      error: 'Failed to create sample messages',
      message: error.message
    });
  }
});

/**
 * GET /api/test/channels
 * Get summary of messages by channel
 */
router.get('/channels', async (req, res) => {
  try {
    const channels = ['email', 'whatsapp', 'telegram'];
    const results = {};

    for (const channel of channels) {
      const snapshot = await db
        .collection('outreach_history')
        .where('channel', '==', channel)
        .get();

      results[channel] = {
        count: snapshot.size,
        contacts: snapshot.docs.map(doc => ({
          company: doc.data().company,
          email: doc.data().contactEmail,
          messagePreview: doc.data().messagePreview
        }))
      };
    }

    res.json({ channels: results });
  } catch (error) {
    console.error('[Test] Error fetching channels:', error);
    res.status(500).json({
      error: 'Failed to fetch channels',
      message: error.message
    });
  }
});

/**
 * DELETE /api/test/clear-channel/:channel
 * Clear all test messages from a specific channel
 */
router.delete('/clear-channel/:channel', async (req, res) => {
  try {
    const { channel } = req.params;
    const validChannels = ['email', 'whatsapp', 'telegram'];

    if (!validChannels.includes(channel)) {
      return res.status(400).json({
        error: 'Invalid channel',
        validChannels
      });
    }

    const snapshot = await db
      .collection('outreach_history')
      .where('channel', '==', channel)
      .where('messageId', 'in', ['msg-email-0', 'msg-email-1', 'msg-whatsapp-0', 'msg-whatsapp-1', 'msg-telegram-0', 'msg-telegram-1'])
      .get();

    let deleted = 0;
    const batch = db.batch();

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
      deleted++;
    });

    await batch.commit();

    res.json({
      success: true,
      channel,
      deletedCount: deleted
    });
  } catch (error) {
    console.error('[Test] Error clearing channel:', error);
    res.status(500).json({
      error: 'Failed to clear channel',
      message: error.message
    });
  }
});

module.exports = router;
