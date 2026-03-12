// ============================================================================
// Ollama API Type Definitions
// ============================================================================
// Type definitions for Ollama API requests and responses.
// Based on Ollama API specification: https://github.com/ollama/ollama/blob/main/docs/api.md
// ============================================================================

/** Message role in chat context */
export type MessageRole = 'system' | 'user' | 'assistant';

/** Chat message */
export interface Message {
  role: MessageRole;
  content: string;
  images?: string[]; // Base64 encoded images
}

/** Generate request options */
export interface GenerateOptions {
  num_predict?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  stop?: string[];
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

/** Base request for all Ollama API calls */
export interface BaseRequest {
  model: string;
  format?: string;
  options?: GenerateOptions;
  stream?: boolean;
}

/** Request for /api/generate endpoint */
export interface GenerateRequest extends BaseRequest {
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  images?: string[];
}

/** Request for /api/chat endpoint */
export interface ChatRequest extends BaseRequest {
  messages: Message[];
}

/** Generate response (non-streaming) */
export interface GenerateResponse {
  model: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/** Chat response message */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  images?: string[];
}

/** Chat response (non-streaming) */
export interface ChatResponse {
  model: string;
  message: ChatMessage;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/** Stream chunk for generate endpoint */
export interface GenerateStreamChunk {
  model: string;
  response: string;
  done: boolean;
}

/** Stream chunk for chat endpoint */
export interface ChatStreamChunk {
  model: string;
  message: ChatMessage;
  done: boolean;
}

/** List tags response */
export interface ListTagsResponse {
  models: ModelInfo[];
}

/** Model information */
export interface ModelInfo {
  name: string;
  modified_at: string;
  size?: number;
}

/** Error response */
export interface OllamaError {
  error: string;
}

/** API response wrapper (for error handling) */
export type ApiResponse<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
};
