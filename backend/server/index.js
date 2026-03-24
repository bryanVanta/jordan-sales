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

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'salesbot-backend' });
});

// API Routes
app.use('/api/companies', companiesRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/training', trainingRouter);
app.use('/api/llm', llmRouter);
app.use('/api/products', productsRouter);

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Salesbot Backend running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🗄️  Firestore connected to project: ${process.env.FIREBASE_PROJECT_ID}`);
});

module.exports = app;
