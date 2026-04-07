/**
 * Sentiment Analysis Routes
 * Endpoints for manual sentiment analysis and retrieving sentiment data
 */

const express = require('express');
const router = express.Router();
const {
  analyzeSingleLead,
  analyzeBatchSentiment,
  triggerSentimentAnalysis,
  getSentimentDistribution,
  getSentimentTrends,
} = require('../services/sentimentService');

/**
 * POST /api/sentiment/trigger
 * Trigger sentiment analysis for a specific lead
 * Body: { leadId: string, email?: string }
 */
router.post('/trigger', async (req, res) => {
  try {
    const { leadId, email } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: 'leadId is required' });
    }

    console.log(`[Sentiment API] Triggering sentiment analysis for lead ${leadId}`);
    const sentiment = await triggerSentimentAnalysis(leadId, email);

    res.json({
      success: true,
      leadId,
      sentiment,
      message: 'Sentiment analysis triggered',
    });
  } catch (error) {
    console.error('[Sentiment API] Error in trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sentiment/batch
 * Run batch sentiment analysis for all leads
 */
router.post('/batch', async (req, res) => {
  try {
    console.log(`[Sentiment API] Starting batch sentiment analysis`);
    const results = await analyzeBatchSentiment();

    res.json({
      success: true,
      results,
      message: 'Batch sentiment analysis completed',
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('[Sentiment API] Error in batch:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/distribution
 * Get current sentiment distribution across all leads
 * Query: channel (optional: 'email' | 'whatsapp' | 'telegram')
 */
router.get('/distribution', async (req, res) => {
  try {
    const channel = req.query.channel || null;
    console.log(`[Sentiment API] Fetching sentiment distribution${channel ? ` for channel: ${channel}` : ''}`);
    const distribution = await getSentimentDistribution(channel);

    res.json({
      success: true,
      data: distribution,
      channel: channel || 'all',
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('[Sentiment API] Error in distribution:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/trends?days=7
 * Get sentiment trends over a time period
 * Query: days (default: 7)
 */
router.get('/trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    console.log(`[Sentiment API] Fetching sentiment trends for ${days} days`);
    
    const trends = await getSentimentTrends(days);

    res.json({
      success: true,
      trends,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('[Sentiment API] Error in trends:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/health
 * Health check for sentiment analysis service
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'active',
    service: 'sentiment-analysis',
    capabilities: [
      'single_lead_analysis',
      'batch_analysis',
      'distribution_tracking',
      'trend_analysis',
      'scheduled_daily_analysis',
    ],
  });
});

module.exports = router;
