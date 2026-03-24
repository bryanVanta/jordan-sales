/**
 * Salesbot Backend Server
 * Main entry point for backend services
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'salesbot-backend' });
});

// API Routes placeholder
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
});

module.exports = app;
