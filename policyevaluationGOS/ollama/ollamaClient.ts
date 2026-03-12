// ============================================================================
// Ollama API Client
// ============================================================================
// TypeScript client for Ollama API (http://localhost:11434)
// Supports chat and generate endpoints with streaming support.
// ============================================================================

import type {
  GenerateRequest,
  GenerateResponse,
  GenerateStreamChunk,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ListTagsResponse,
  ApiResponse,
  Message,
} from './types';

/** Default Ollama API endpoint */
const DEFAULT_BASE_URL = 'http://localhost:11434';

/** Default model for requests */
const DEFAULT_MODEL = 'gemma3:1b';

/** Ollama API client */
export class OllamaClient {
  private baseUrl: string;
  private defaultModel: string;

  /**
   * Create a new Ollama client
   * @param baseUrl - Ollama API base URL (default: http://localhost:11434)
   * @param defaultModel - Default model to use (default: gemma:3b)
   */
  constructor(baseUrl: string = DEFAULT_BASE_URL, defaultModel: string = DEFAULT_MODEL) {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  /**
   * Generate text completion
   * @param request - Generate request
   * @returns Generate response
   */
  async generate(request: GenerateRequest): Promise<ApiResponse<GenerateResponse>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || this.defaultModel,
          prompt: request.prompt,
          system: request.system,
          template: request.template,
          context: request.context,
          images: request.images,
          format: request.format,
          options: request.options,
          stream: false,
        }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json() as GenerateResponse;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Generate text completion with streaming
   * @param request - Generate request
   * @param onChunk - Callback for each stream chunk
   */
  async generateStream(
    request: GenerateRequest,
    onChunk: (chunk: GenerateStreamChunk) => void
  ): Promise<ApiResponse<void>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || this.defaultModel,
          prompt: request.prompt,
          system: request.system,
          template: request.template,
          context: request.context,
          images: request.images,
          format: request.format,
          options: request.options,
          stream: true,
        }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return { success: false, error: 'No response body' };
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as GenerateStreamChunk;
            onChunk(data);
            if (data.done) break;
          } catch {
            // Skip invalid JSON lines
          }
        }
      }

      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Chat completion
   * @param request - Chat request
   * @returns Chat response
   */
  async chat(request: ChatRequest): Promise<ApiResponse<ChatResponse>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || this.defaultModel,
          messages: request.messages,
          format: request.format,
          options: request.options,
          stream: false,
        }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json() as ChatResponse;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Chat completion with streaming
   * @param request - Chat request
   * @param onChunk - Callback for each stream chunk
   */
  async chatStream(
    request: ChatRequest,
    onChunk: (chunk: ChatStreamChunk) => void
  ): Promise<ApiResponse<void>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || this.defaultModel,
          messages: request.messages,
          format: request.format,
          options: request.options,
          stream: true,
        }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return { success: false, error: 'No response body' };
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as ChatStreamChunk;
            onChunk(data);
            if (data.done) break;
          } catch {
            // Skip invalid JSON lines
          }
        }
      }

      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * List available models
   * @returns List of available models
   */
  async listModels(): Promise<ApiResponse<ListTagsResponse>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json() as ListTagsResponse;
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Check if Ollama service is running
   * @returns true if service is available
   */
  async isAvailable(): Promise<boolean> {
    const result = await this.listModels();
    return result.success;
  }

  /**
   * Get default model name
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }
}

// ============================================================================
// Prompt Helper Functions for UI Generation
// ============================================================================

/** System prompt for UI generation */
export const UI_GENERATION_SYSTEM_PROMPT = `You are a UI generation assistant specializing in creating user interface descriptions and layouts.
When asked to create or design UI elements, provide:
1. A clear description of the component structure
2. Recommended layout hierarchy
3. Styling suggestions
4. Accessibility considerations

Keep responses concise and structured.`;

/** Create a chat request for UI generation */
export function createUIGenerationRequest(userPrompt: string, context?: string): ChatRequest {
  const messages: Message[] = [
    { role: 'system', content: UI_GENERATION_SYSTEM_PROMPT },
  ];

  if (context) {
    messages.push({
      role: 'user',
      content: `Context: ${context}\n\nRequest: ${userPrompt}`,
    });
  } else {
    messages.push({
      role: 'user',
      content: userPrompt,
    });
  }

  return {
    model: DEFAULT_MODEL,
    messages,
  };
}

/** Create a generate request for UI generation */
export function createUIGenerationPrompt(userPrompt: string, context?: string): string {
  if (context) {
    return `${UI_GENERATION_SYSTEM_PROMPT}\n\nContext: ${context}\n\nRequest: ${userPrompt}`;
  }
  return `${UI_GENERATION_SYSTEM_PROMPT}\n\nRequest: ${userPrompt}`;
}

// ============================================================================
// Default client instance
// ============================================================================

/** Default Ollama client instance */
export const ollamaClient = new OllamaClient();
