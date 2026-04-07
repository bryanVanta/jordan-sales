/**
 * LLM Service
 * Frontend service to interact with LLM API with OpenRouter
 */

import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL + '/api'; // Updated to use environment variable

/**
 * Get the system prompt from training configuration
 */
export async function getSystemPrompt() {
  try {
    const response = await axios.get(`${API_BASE_URL}/llm/system-prompt`);
    return response.data.data.systemPrompt;
  } catch (error) {
    console.error('Error getting system prompt:', error);
    throw error;
  }
}

/**
 * Generate LLM prompt with training context
 */
export async function generateLLMPrompt(message: string, context?: any) {
  try {
    const response = await axios.post(`${API_BASE_URL}/llm/prompt`, {
      message,
      context: context || {},
    });
    return response.data.data;
  } catch (error) {
    console.error('Error generating LLM prompt:', error);
    throw error;
  }
}

/**
 * Send message to LLM with training context and reasoning
 * Includes support for multi-turn conversations with reasoning preservation
 */
export async function sendMessageToLLM(
  userMessage: string,
  conversationHistory?: any[],
  enableReasoning: boolean = true
) {
  try {
    const response = await axios.post(`${API_BASE_URL}/llm/chat`, {
      message: userMessage,
      history: conversationHistory || [],
      reasoning: enableReasoning,
    });

    return {
      content: response.data.data.content,
      reasoning_details: response.data.data.reasoning_details,
      model: response.data.data.model,
    };
  } catch (error) {
    console.error('Error sending message to LLM:', error);
    throw error;
  }
}

/**
 * Simple chat interface for multi-turn conversations
 * Preserves reasoning_details for continued reasoning
 */
export async function chatWithLLM(
  userMessage: string,
  previousMessages: any[] = [],
  enableReasoning: boolean = true
) {
  try {
    const response = await sendMessageToLLM(userMessage, previousMessages, enableReasoning);
    
    // Add the new message to history, preserving reasoning_details
    const updatedHistory = [
      ...previousMessages,
      {
        role: 'user',
        content: userMessage,
      },
      {
        role: 'assistant',
        content: response.content,
        reasoning_details: response.reasoning_details,
      },
    ];

    return {
      response: response.content,
      reasoning: response.reasoning_details,
      model: response.model,
      history: updatedHistory, // Return updated history for next message
    };
  } catch (error) {
    console.error('Error in chat with LLM:', error);
    throw error;
  }
}

/**
 * Analyze customer status from conversation history
 * Returns classification: HOT, WARM, NEUTRAL, or COLD
 */
export async function analyzeCustomerStatus(conversationHistory: any[] = []) {
  try {
    const response = await axios.post(`${API_BASE_URL}/llm/analyze-status`, {
      history: conversationHistory,
    });

    return response.data.data;
  } catch (error) {
    console.error('Error analyzing customer status:', error);
    throw error;
  }
}

export default {
  getSystemPrompt,
  generateLLMPrompt,
  sendMessageToLLM,
  chatWithLLM,
  analyzeCustomerStatus,
};
