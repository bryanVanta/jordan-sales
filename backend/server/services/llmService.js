/**
 * LLM Service - OpenRouter with Reasoning
 * Handle AI/LLM interactions with training configuration
 */

const axios = require('axios');
const { getLatestTraining } = require('./trainingService');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL = 'openai/gpt-oss-120b:free';

/**
 * Generate system prompt from training configuration
 * This will be used to instruct the LLM how to behave
 */
async function generateSystemPrompt() {
  try {
    const training = await getLatestTraining();
    
    if (!training) {
      return null;
    }

    const systemPrompt = `You are a professional sales assistant focused on quick, compelling pitches.

BEHAVIOR:
- Keep responses SHORT and punchy (2-3 sentences max)
- NO markdown symbols, NO asterisks, NO dashes for formatting
- Be direct and confident
- Focus on value and urgency

INSTRUCTIONS:
${training.instructions}

PRODUCT:
${training.product}

LOCATION: ${training.location}

${training.knowledge ? `KEY INFO:\n${training.knowledge}` : ''}

Respond naturally without any markdown or special formatting.`;

    return systemPrompt;
  } catch (error) {
    console.error('Error generating system prompt:', error);
    throw error;
  }
}

/**
 * Call OpenRouter API with reasoning
 */
async function callOpenRouter(messages, enableReasoning = true) {
  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const response = await axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model: MODEL,
        messages: messages,
        reasoning: enableReasoning ? { enabled: true } : undefined,
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message;
  } catch (error) {
    console.error('Error calling OpenRouter:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send message to LLM with training context and reasoning
 */
async function sendMessage(userMessage, conversationHistory = [], enableReasoning = false) {
  try {
    const systemPrompt = await generateSystemPrompt();
    
    if (!systemPrompt) {
      throw new Error('No training configuration found. Please set up training first.');
    }

    // Build messages array with system prompt
    const messages = [
      {
        role: 'user',
        content: systemPrompt, // Send training as initial context
      },
      {
        role: 'assistant',
        content: 'I understand. I will follow these instructions and training.',
      },
      // Add conversation history (preserving reasoning_details if present)
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage,
      },
    ];

    // Call OpenRouter with reasoning enabled
    const response = await callOpenRouter(messages, enableReasoning);

    return {
      content: response.content,
      reasoning_details: response.reasoning_details || null,
      model: MODEL,
    };
  } catch (error) {
    console.error('Error sending message to LLM:', error);
    throw error;
  }
}

/**
 * Generate a complete prompt for the LLM with context
 */
async function generateLLMPrompt(userMessage, context = {}) {
  try {
    const systemPrompt = await generateSystemPrompt();
    
    if (!systemPrompt) {
      throw new Error('No training configuration found. Please set up training first.');
    }

    return {
      system: systemPrompt,
      user: userMessage,
      context: {
        ...context,
        timestamp: new Date().toISOString(),
      }
    };
  } catch (error) {
    console.error('Error generating LLM prompt:', error);
    throw error;
  }
}

module.exports = {
  generateSystemPrompt,
  generateLLMPrompt,
  sendMessage,
  callOpenRouter,
};
