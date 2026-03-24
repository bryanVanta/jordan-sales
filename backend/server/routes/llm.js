/**
 * LLM Routes
 * API endpoints for LLM interactions with training data and OpenRouter
 */

const express = require('express');
const router = express.Router();
const { generateSystemPrompt, generateLLMPrompt, sendMessage, callOpenRouter, analyzeCustomerStatus } = require('../services/llmService');

// Get system prompt (for debugging/testing)
router.get('/system-prompt', async (req, res) => {
  try {
    const systemPrompt = await generateSystemPrompt();
    if (!systemPrompt) {
      return res.status(404).json({ success: false, error: 'No training configuration found' });
    }
    res.json({ success: true, data: { systemPrompt } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate LLM prompt from user message
router.post('/prompt', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const prompt = await generateLLMPrompt(message, context);
    res.json({ success: true, data: prompt });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send message to LLM with training context
router.post('/chat', async (req, res) => {
  try {
    const { message, history, reasoning } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const response = await sendMessage(message, history || [], reasoning !== false);
    res.json({ success: true, data: response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Analyze customer status from conversation history
router.post('/analyze-status', async (req, res) => {
  try {
    const { history } = req.body;
    
    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ success: false, error: 'Conversation history array is required' });
    }

    const status = await analyzeCustomerStatus(history);
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
