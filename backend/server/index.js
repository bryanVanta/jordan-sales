/**
 * Salesbot Backend Server
 * Main entry point for backend services
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import Firebase and routes
const { db } = require('./config/firebase');
const companiesRouter = require('./routes/companies');
const leadsRouter = require('./routes/leads');
const messagesRouter = require('./routes/messages');
const trainingRouter = require('./routes/training');
const llmRouter = require('./routes/llm');
const productsRouter = require('./routes/products');
const productInfoRouter = require('./routes/productInfo');
const scrapingRouter = require('./routes/scraping');
const outreachRouter = require('./routes/outreach');
const followUpRouter = require('./routes/followUp');
const webhooksRouter = require('./routes/webhooks');
const sentimentRouter = require('./routes/sentiment');
const testRouter = require('./routes/test');
const { initializeSystem } = require('./services/initializationService');
const { getProgress } = require('./services/progressService');
const { initializeScheduledJobs } = require('./services/schedulerService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'salesbot-backend' });
});

// Progress tracking endpoint for frontend to poll
app.get('/api/progress/:productInfoId?', (req, res) => {
  const productInfoId = req.params.productInfoId || 'current';
  const progress = getProgress(productInfoId);
  res.json(progress);
});

// API Routes
app.use('/api/companies', companiesRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/training', trainingRouter);
app.use('/api/llm', llmRouter);
app.use('/api/products', productsRouter);
app.use('/api/product-info', productInfoRouter);
app.use('/api/scraping', scrapingRouter);
app.use('/api/outreach', outreachRouter);
app.use('/api/follow-up', followUpRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/sentiment', sentimentRouter);
app.use('/api/test', testRouter);

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    services: {
      scraping: 'ready',
      email: 'ready',
      whatsapp: 'ready',
      ai: 'ready',
      taskQueue: 'ready'
    }
  });
});

// DEBUG: Check messages by channel
app.get('/api/debug/messages-by-channel', async (req, res) => {
  try {
    const channels = ['email', 'whatsapp', 'telegram'];
    const results = {};

    for (const channel of channels) {
      // Check outreach_history
      const outreachSnap = await db
        .collection('outreach_history')
        .where('channel', '==', channel)
        .limit(10)
        .get();

      // Check inbound_emails (they should all have channel='email')
      const inboundSnap = await db
        .collection('inbound_emails')
        .limit(5)
        .get();

      results[channel] = {
        outreach: outreachSnap.size,
        outreachSample: outreachSnap.docs.map(d => ({
          id: d.id,
          company: d.data().company,
          contactEmail: d.data().contactEmail,
          channel: d.data().channel,
          messagePreview: d.data().messagePreview?.substring(0, 50)
        }))
      };
    }

    console.log('[DEBUG] Messages by channel:', results);
    res.json(results);
  } catch (error) {
    console.error('[DEBUG] Error checking messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize system and start server
(async () => {
  // Initialize product info (non-blocking, won't crash server if Firebase unavailable)
  await initializeSystem();
  
  // Initialize scheduled jobs (e.g., daily sentiment analysis)
  initializeScheduledJobs();

  app.listen(PORT, () => {
    console.log(`🚀 Salesbot Backend running on http://localhost:${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/health`);
    console.log(`🗄️  Firestore connected to project: ${process.env.FIREBASE_PROJECT_ID}`);
  });
})();

module.exports = app;

