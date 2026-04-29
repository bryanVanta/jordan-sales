/**
 * LLM Routes
 * API endpoints for LLM interactions with training data and OpenRouter
 */

const express = require('express');
const router = express.Router();
const { generateSystemPrompt, generateLLMPrompt, sendMessage, callOpenRouter, callLLM, analyzeCustomerStatus } = require('../services/llmService');
const { getTrainingAssetText } = require('../services/trainingDocumentStore');

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

// Refine customer instructions from Product & Services context
router.post('/refine-instructions', async (req, res) => {
  try {
    const {
      productName,
      productType,
      description,
      keyBenefit,
      targetCustomer,
      location,
      moreAboutProduct,
      productInfoId,
      currentInstructions,
      trainingAssets,
    } = req.body || {};

    const assetSummaryParts = await Promise.all(
      Object.entries(trainingAssets || {})
        .filter(([, asset]) => asset?.fileName || asset?.extractedText || (Array.isArray(asset?.files) && asset.files.length))
        .map(async ([key, asset]) => {
          const postgresText = productInfoId ? await getTrainingAssetText(productInfoId, key).catch(() => '') : '';
          const text = String(postgresText || asset?.extractedText || '').trim();
          const fileNames = Array.isArray(asset?.files) && asset.files.length
            ? asset.files.map((file) => file?.fileName).filter(Boolean).join(', ')
            : asset?.fileName || 'uploaded asset';
          return `${key}: ${fileNames}${text ? `\n${text.slice(0, 1500)}` : ''}`;
        })
    );

    const assetSummary = assetSummaryParts
      .filter(Boolean)
      .join('\n\n');

    const prompt = `Create customer instructions for Jordan, a B2B sales assistant.

Goal:
Refine the instructions so Jordan sounds inspired by Jordan Belfort from The Wolf of Wall Street: confident, charismatic, sharp, fast-moving, persuasive, and closing-oriented.

Rules:
- Tailor the instructions to the exact product/service context below.
- Preserve useful details from current instructions if relevant.
- Keep it ethical: no fake urgency, no invented claims, no misleading promises, no manipulative pressure.
- Write final instructions only. No intro, no markdown code block, no JSON.
- Make it useful as a saved system/customer instruction for the chatbot.

Product & Services:
Product name: ${productName || 'Not provided'}
Product type: ${productType || 'Not provided'}
Description: ${description || 'Not provided'}
Key benefit: ${keyBenefit || 'Not provided'}
Target customer: ${targetCustomer || 'Not provided'}
Location: ${location || 'Not provided'}
More context: ${moreAboutProduct || 'Not provided'}

Current instructions:
${currentInstructions || 'Not provided'}

Training assets:
${assetSummary || 'No uploaded assets provided'}`;

    const response = await callLLM([{ role: 'user', content: prompt }], false);
    const instructions = String(response?.content || '').trim();

    if (!instructions) {
      return res.status(502).json({ success: false, error: 'AI returned empty instructions' });
    }

    res.json({
      success: true,
      data: {
        instructions,
        model: response.model || null,
      },
    });
  } catch (error) {
    console.error('Error refining customer instructions:', error);
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
