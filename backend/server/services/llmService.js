/**
 * LLM Service
 * Primary: OpenClaw Gateway agent (if configured)
 * Fallback: OpenRouter (existing behavior)
 */

const axios = require('axios');
const { getProduct, getAllProducts } = require('./productService');
const { getProductInfo, CURRENT_DOC_ID, DEFAULT_CUSTOMER_INSTRUCTIONS } = require('./productInfoService');
const { callAgentWithOpenClawCliViaSsh } = require('./openClawService');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL = 'openai/gpt-oss-120b:free';

const OPENCLAW_LLM_ENABLED = String(process.env.OPENCLAW_LLM_ENABLED || '1').trim() !== '0';
const OPENCLAW_LLM_AGENT_ID = (process.env.OPENCLAW_LLM_AGENT_ID || process.env.OPENCLAW_JORDAN_AGENT_ID || 'main').trim();
const OPENCLAW_LLM_TIMEOUT_MS = Number(process.env.OPENCLAW_LLM_TIMEOUT_MS || 60000);
const trimPromptSection = (value = '', max = 6000) => {
  const text = String(value || '').trim();
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max).trim()}\n[truncated]`;
};

/**
 * Generate system prompt from product configuration
 * This will be used to instruct the LLM how to behave
 */
async function generateSystemPrompt(productId = null) {
  try {
    let product;
    
    if (productId) {
      // Prefer the active Product-Info project used by the Training page.
      product = await getProductInfo(productId);
      if (!product) product = await getProduct(productId);
    } else {
      product = await getProductInfo(CURRENT_DOC_ID);
      if (!product) {
        const products = await getAllProducts();
        product = products.length > 0 ? products[0] : null;
      }
    }
    
    if (!product) {
      return null;
    }

    const personalization = product.personalization || {};
    const trainingAssets = product.trainingAssets || {};
    const assetKnowledge = [
      trainingAssets.companyInfo?.extractedText ? `Company Info:\n${trimPromptSection(trainingAssets.companyInfo.extractedText)}` : '',
      trainingAssets.knowledgeBase?.extractedText ? `Knowledge Base / Product Docs:\n${trimPromptSection(trainingAssets.knowledgeBase.extractedText)}` : '',
      trainingAssets.salesPlaybook?.extractedText ? `Sales Playbook:\n${trimPromptSection(trainingAssets.salesPlaybook.extractedText)}` : '',
    ].filter(Boolean).join('\n\n');
    const customerInstructions = String(
      personalization.customerInstructions || product.instructions || DEFAULT_CUSTOMER_INSTRUCTIONS
    ).trim();
    const characteristics = String(personalization.characteristics || '').trim();
    const styleAndTone = String(personalization.styleAndTone || 'Default').trim();

    const systemPrompt = `You are Jordan, a professional B2B sales assistant focused on useful, deal-moving sales conversations and collateral.

BEHAVIOR:
- Keep responses SHORT and punchy (2-3 sentences max)
- NO markdown symbols, NO asterisks, NO dashes for formatting
- Be direct and confident
- Focus on value and urgency
- Prefer practical, rep-ready language over generic explanations

PERSONALIZATION:
Style and tone: ${styleAndTone}
${characteristics ? `Characteristics: ${characteristics}` : 'Characteristics: practical, concise, buyer-outcome focused'}

INSTRUCTIONS:
${customerInstructions}

PRODUCT:
Name: ${product.productName || 'N/A'}
Type: ${product.productType || 'N/A'}
Description: ${product.description}
Key Benefit: ${product.keyBenefit || 'N/A'}
More Context: ${product.moreAboutProduct || 'N/A'}

TARGET CUSTOMER:
${product.targetCustomer}

LOCATION: ${product.location}

${product.knowledge || assetKnowledge ? `KEY INFO:\n${[trimPromptSection(product.knowledge), assetKnowledge].filter(Boolean).join('\n\n')}` : ''}

Respond naturally without any markdown or special formatting.`;

    return systemPrompt;
  } catch (error) {
    console.error('Error generating system prompt:', error);
    throw error;
  }
}

/**
 * Call OpenRouter API with reasoning and retry logic
 */
async function callOpenRouter(messages, enableReasoning = true) {
  const maxRetries = 3;
  let attempt = 0;
  let delay = 1000; // Initial delay of 1 second

  while (attempt < maxRetries) {
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
      if (error.response?.status === 429) {
        console.warn(`Rate limit hit. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        attempt++;
      } else {
        console.error('Error calling OpenRouter:', error.response?.data || error.message);
        throw error;
      }
    }
  }

  throw new Error('Failed to call OpenRouter after maximum retries');
}

const formatMessagesForOpenClaw = (messages = []) =>
  (Array.isArray(messages) ? messages : [])
    .map((m) => {
      const role = String(m?.role || '').trim().toUpperCase() || 'USER';
      const content = String(m?.content || '').trim();
      if (!content) return '';
      return `${role}:\n${content}`;
    })
    .filter(Boolean)
    .join('\n\n');

async function callOpenClaw(messages, enableReasoning = true) {
  if (!OPENCLAW_LLM_ENABLED) {
    throw new Error('OPENCLAW_LLM_ENABLED=0');
  }

  const conversation = formatMessagesForOpenClaw(messages);
  const prompt =
    `You are a helpful assistant. Reply with only the final answer text (no JSON, no markdown).\n\n` +
    `${conversation}\n\n` +
    (enableReasoning ? '' : 'Do not include reasoning. Only output the answer.');

  const result = await callAgentWithOpenClawCliViaSsh({
    message: prompt,
    agentId: OPENCLAW_LLM_AGENT_ID,
    timeoutMs: Number.isFinite(OPENCLAW_LLM_TIMEOUT_MS) ? OPENCLAW_LLM_TIMEOUT_MS : 60000,
  });

  const text = String(result?.text || '').trim();
  if (!text) throw new Error('OpenClaw returned empty response');
  return { content: text, model: `openclaw:${OPENCLAW_LLM_AGENT_ID}` };
}

async function callLLM(messages, enableReasoning = true) {
  // Try OpenClaw first, then fall back to OpenRouter.
  try {
    return await callOpenClaw(messages, enableReasoning);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.warn('[LLM] OpenClaw primary failed, falling back to OpenRouter:', errMsg);
    return await callOpenRouter(messages, enableReasoning);
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

    // Call primary LLM with fallback
    const response = await callLLM(messages, enableReasoning);

    return {
      content: response.content,
      reasoning_details: response.reasoning_details || null,
      model: response.model || MODEL,
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

    const response = await callLLM([{ role: 'user', content: analysisPrompt }], false);
    const analysisText = String(response?.content || '').trim();
    
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
  callLLM,
  analyzeCustomerStatus,
};
