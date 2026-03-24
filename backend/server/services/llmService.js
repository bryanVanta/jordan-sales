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

/**
 * Analyze customer sentiment and lead quality from conversation history
 * Returns classification: HOT (close to closing), WARM (high potential), NEUTRAL (neither), COLD (no potential)
 */
async function analyzeCustomerStatus(conversationHistory = []) {
  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    if (conversationHistory.length === 0) {
      return {
        status: 'NEUTRAL',
        reasoning: 'Insufficient message history to analyze customer status',
        confidence: 0.5,
      };
    }

    // Build conversation summary for analysis
    const conversationText = conversationHistory
      .map((msg) => `${msg.role === 'user' ? 'CUSTOMER' : 'BOT'}: ${msg.content}`)
      .join('\n');

    const analysisPrompt = `Analyze this customer conversation and classify the lead quality into ONE of these categories:

CATEGORIES:
- HOT: Customer is very interested, asking specific questions, ready to buy/commit, showing urgency
- WARM: Customer shows interest, engaging positively, open to learning more, potential buyer
- NEUTRAL: Customer is polite but shows neither strong interest nor rejection, casual inquiries
- COLD: Customer is uninterested, dismissive, negative, or clearly not a good fit

CONVERSATION:
${conversationText}

Respond ONLY with valid JSON (no markdown, no code blocks):
{
  "status": "HOT|WARM|NEUTRAL|COLD",
  "reasoning": "brief explanation of why this status was assigned",
  "confidence": 0.0 to 1.0
}`;

    const response = await axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: analysisPrompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent analysis
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const analysisText = response.data.choices[0].message.content.trim();
    
    // Parse JSON response
    let analysis = JSON.parse(analysisText);
    
    // Validate status
    const validStatuses = ['HOT', 'WARM', 'NEUTRAL', 'COLD'];
    if (!validStatuses.includes(analysis.status)) {
      analysis.status = 'NEUTRAL';
    }

    return {
      status: analysis.status,
      reasoning: analysis.reasoning || 'Unable to determine reasoning',
      confidence: Math.min(Math.max(analysis.confidence || 0.5, 0), 1), // Clamp between 0-1
    };
  } catch (error) {
    console.error('Error analyzing customer status:', error);
    // Return neutral status on error
    return {
      status: 'NEUTRAL',
      reasoning: 'Error analyzing conversation',
      confidence: 0,
    };
  }
}

module.exports = {
  generateSystemPrompt,
  generateLLMPrompt,
  sendMessage,
  callOpenRouter,
  analyzeCustomerStatus,
};
