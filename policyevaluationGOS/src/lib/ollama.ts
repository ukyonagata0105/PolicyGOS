/**
 * Ollama client wrapper for the application
 * Wraps the base ollamaClient with app-specific utilities
 */

import { ollamaClient, createUIGenerationRequest } from '../../ollama/ollamaClient';
import type { ChatRequest, ApiResponse } from '../../ollama/types';
import type { OllamaStatus } from '@/types';

/**
 * Check if Ollama service is available
 */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  const isAvailable = await ollamaClient.isAvailable();
  return isAvailable ? 'available' : 'unavailable';
}

/**
 * Generate UI from PDF content using Ollama
 * @param pdfContent - Extracted text content from PDF
 * @param userPrompt - User's request for UI generation
 * @returns Generated response
 */
export async function generateUIFromPDF(
  pdfContent: string,
  userPrompt: string = 'Generate a user interface to display this policy information'
): Promise<ApiResponse<string>> {
  // Create context from PDF content
  const context = `PDF Content:\n${pdfContent}\n\nPlease generate a UI layout to display this information effectively.`;

  // Create chat request
  const request: ChatRequest = createUIGenerationRequest(userPrompt, context);

  // Call Ollama API
  const response = await ollamaClient.chat(request);

  if (!response.success) {
    return { success: false, error: response.error };
  }

  // Extract content from response
  const content = response.data.message.content;
  return { success: true, data: content };
}

/**
 * Generate UI from PDF content with streaming
 * @param pdfContent - Extracted text content from PDF
 * @param onChunk - Callback for each stream chunk
 * @param userPrompt - User's request for UI generation
 */
export async function generateUIFromPDFStream(
  pdfContent: string,
  onChunk: (chunk: string) => void,
  userPrompt: string = 'Generate a user interface to display this policy information'
): Promise<ApiResponse<void>> {
  // Create context from PDF content
  const context = `PDF Content:\n${pdfContent}\n\nPlease generate a UI layout to display this information effectively.`;

  // Create chat request
  const request: ChatRequest = createUIGenerationRequest(userPrompt, context);

  // Call Ollama API with streaming
  const response = await ollamaClient.chatStream(request, (chunk) => {
    if (chunk.message?.content) {
      onChunk(chunk.message.content);
    }
  });

  return response;
}

/**
 * List available models
 */
export async function listModels() {
  return ollamaClient.listModels();
}

// Export base client for advanced usage
export { ollamaClient };
