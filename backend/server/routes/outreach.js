/**
 * Outreach Routes
 * Handle bulk message sending to selected leads
 */

const express = require('express');
const { db } = require('../config/firebase');
const { executeBulkOutreach } = require('../services/outreachService');

const router = express.Router();

/**
 * POST /outreach/send
 * Send personalized outreach messages to selected leads
 * Body: { leadIds: [string], productInfoId?: string, channel?: 'email'|'whatsapp' }
 * Default behavior (no channel override): WhatsApp if lead has `whatsapp`, otherwise Email.
 */
router.post('/send', async (req, res) => {
  try {
    const { leadIds, productInfoId, channel } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'leadIds must be a non-empty array',
      });
    }

    console.log(`[API] Receiving outreach request for ${leadIds.length} leads`);

    // Execute bulk outreach
    const results = await executeBulkOutreach(leadIds, productInfoId, { channel });

    res.json({
      success: true,
      message: `Outreach completed: ${results.successful} sent, ${results.failed} failed`,
      ...results,
    });
  } catch (error) {
    console.error('[API] Outreach error:', error);
    res.status(500).json({
      success: false,
      error: 'Outreach failed',
      message: error.message,
    });
  }
});

/**
 * GET /outreach/history
 * Get outreach history for a specific lead
 * Query: ?leadId=xxx
 */
router.get('/history', async (req, res) => {
  try {
    const { leadId } = req.query;

    if (!leadId) {
      return res.status(400).json({
        error: 'leadId query parameter required',
      });
    }

    const snapshot = await db
      .collection('outreach_history')
      .where('leadId', '==', leadId)
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const history = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      leadId,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error('[API] Error fetching outreach history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch outreach history',
      message: error.message,
    });
  }
});

module.exports = router;
