import { ollamaClient } from '../../ollama/ollamaClient';
import { getStoredGeminiApiKey } from '@/lib/appSettings';

export interface JsonGenerationRequest {
  systemPrompt: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  requiredProvider?: 'gemini' | 'ollama';
}

export interface HtmlGenerationRequest {
  systemPrompt: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  requiredProvider?: 'gemini' | 'ollama';
}

export interface JsonGenerationResponse<T> {
  success: boolean;
  data?: T;
  rawText?: string;
  provider: string;
  model: string;
  error?: string;
}

export interface HtmlGenerationResponse {
  success: boolean;
  html?: string;
  rawText?: string;
  provider: string;
  model: string;
  error?: string;
}

export interface LLMProvider {
  name: string;
  model: string;
  isAvailable(): Promise<boolean>;
  generateJson<T>(request: JsonGenerationRequest): Promise<JsonGenerationResponse<T>>;
  generateHtml(request: HtmlGenerationRequest): Promise<HtmlGenerationResponse>;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

const GEMINI_REQUEST_TIMEOUT_MS = 60_000;

class GeminiLLMProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly apiKey: string;
  private readonly apiBaseUrl: string;

  constructor(apiKey: string, model: string, apiBaseUrl: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async generateJson<T>(request: JsonGenerationRequest): Promise<JsonGenerationResponse<T>> {
    try {
      const response = await this.requestContent(
        `${request.systemPrompt}\n\n${request.prompt}`,
        request.temperature ?? 0.2,
        request.maxTokens ?? 2048,
        'application/json'
      );

      if (!response.ok) {
        return {
          success: false,
          provider: this.name,
          model: this.model,
          error: response.error || 'Gemini request failed',
        };
      }

      const rawText = response.data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      const parsed = safeJsonParse<T>(rawText);

      if (!parsed && rawText) {
        const repaired = await this.repairMalformedJson<T>(rawText, request.maxTokens ?? 2048);
        if (repaired.success && repaired.data) {
          return repaired;
        }
      }

      if (!parsed) {
        return {
          success: false,
          provider: this.name,
          model: this.model,
          rawText,
          error: 'Gemini response was not valid JSON',
        };
      }

      return {
        success: true,
        data: parsed,
        rawText,
        provider: this.name,
        model: this.model,
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        model: this.model,
        error:
          error instanceof Error && error.name === 'AbortError'
            ? `Gemini request timed out after ${GEMINI_REQUEST_TIMEOUT_MS / 1000}s`
            : error instanceof Error
              ? error.message
              : 'Unknown Gemini error',
      };
    }
  }

  async generateHtml(request: HtmlGenerationRequest): Promise<HtmlGenerationResponse> {
    try {
      const response = await this.requestContent(
        `${request.systemPrompt}\n\n${request.prompt}`,
        request.temperature ?? 0.7,
        request.maxTokens ?? 8192,
        'text/plain'
      );

      if (!response.ok) {
        return {
          success: false,
          provider: this.name,
          model: this.model,
          error: response.error || 'Gemini HTML request failed',
        };
      }

      const rawText = response.data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      const html = normalizeHtmlOutput(rawText);
      if (!html) {
        return {
          success: false,
          provider: this.name,
          model: this.model,
          rawText,
          error: 'Gemini response did not contain HTML',
        };
      }

      return {
        success: true,
        html,
        rawText,
        provider: this.name,
        model: this.model,
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        model: this.model,
        error:
          error instanceof Error && error.name === 'AbortError'
            ? `Gemini request timed out after ${GEMINI_REQUEST_TIMEOUT_MS / 1000}s`
            : error instanceof Error
              ? error.message
              : 'Unknown Gemini error',
      };
    }
  }

  private async requestContent(
    text: string,
    temperature: number,
    maxTokens: number,
    responseMimeType?: 'application/json' | 'text/plain'
  ): Promise<{ ok: true; data: GeminiResponse } | { ok: false; error: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text }],
              },
            ],
            generationConfig: {
              ...(responseMimeType ? { responseMimeType } : {}),
              temperature,
              maxOutputTokens: maxTokens,
            },
          }),
        }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return { ok: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      return { ok: true, data: (await response.json()) as GeminiResponse };
    } catch (error) {
      clearTimeout(timeoutId);
      return {
        ok: false,
        error:
          error instanceof Error && error.name === 'AbortError'
            ? `Gemini request timed out after ${GEMINI_REQUEST_TIMEOUT_MS / 1000}s`
            : error instanceof Error
              ? error.message
              : 'Unknown Gemini error',
      };
    }
  }

  private async repairMalformedJson<T>(
    rawText: string,
    maxTokens: number
  ): Promise<JsonGenerationResponse<T>> {
    const repairPrompt = [
      '次のテキストを有効な JSON 1個に整形してください。',
      '説明文、コードフェンス、前置き、後置きは削除してください。',
      '値が読めない箇所は null ではなく空文字か空配列にしてください。',
      'JSON 以外を返さないでください。',
      '',
      rawText.slice(0, 16000),
    ].join('\n');

    const response = await this.requestContent(repairPrompt, 0, Math.min(maxTokens, 2048));
    if (!response.ok) {
      return {
        success: false,
        provider: this.name,
        model: this.model,
        error: response.error || 'Gemini JSON repair failed',
      };
    }

    const repairedRawText =
      response.data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    const repairedJson = safeJsonParse<T>(repairedRawText);
    if (!repairedJson) {
      return {
        success: false,
        provider: this.name,
        model: this.model,
        rawText: repairedRawText,
        error: 'Gemini repaired response was not valid JSON',
      };
    }

    return {
      success: true,
      data: repairedJson,
      rawText: repairedRawText,
      provider: this.name,
      model: this.model,
    };
  }
}

class OllamaLLMProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async isAvailable(): Promise<boolean> {
    return ollamaClient.isAvailable();
  }

  async generateJson<T>(request: JsonGenerationRequest): Promise<JsonGenerationResponse<T>> {
    try {
      const response = await ollamaClient.generate({
        model: this.model,
        prompt: `${request.systemPrompt}\n\n${request.prompt}`,
        format: 'json',
        options: {
          temperature: request.temperature ?? 0.2,
          num_predict: request.maxTokens ?? 2048,
        },
      });

      if (!response.success) {
        return {
          success: false,
          provider: this.name,
          model: this.model,
          error: response.error,
        };
      }

      const rawText = response.data.response;
      const parsed = safeJsonParse<T>(rawText);

      if (!parsed) {
        return {
          success: false,
          provider: this.name,
          model: this.model,
          rawText,
          error: 'Ollama response was not valid JSON',
        };
      }

      return {
        success: true,
        data: parsed,
        rawText,
        provider: this.name,
        model: this.model,
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        model: this.model,
        error: error instanceof Error ? error.message : 'Unknown Ollama error',
      };
    }
  }

  async generateHtml(request: HtmlGenerationRequest): Promise<HtmlGenerationResponse> {
    try {
      const response = await ollamaClient.generate({
        model: this.model,
        prompt: `${request.systemPrompt}\n\n${request.prompt}`,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 8192,
        },
      });

      if (!response.success) {
        return {
          success: false,
          provider: this.name,
          model: this.model,
          error: response.error,
        };
      }

      const rawText = response.data.response;
      const html = normalizeHtmlOutput(rawText);
      if (!html) {
        return {
          success: false,
          provider: this.name,
          model: this.model,
          rawText,
          error: 'Ollama response did not contain HTML',
        };
      }

      return {
        success: true,
        html,
        rawText,
        provider: this.name,
        model: this.model,
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        model: this.model,
        error: error instanceof Error ? error.message : 'Unknown Ollama error',
      };
    }
  }
}

function normalizeHtmlOutput(rawText: string): string | null {
  const cleaned = rawText.trim();
  if (!cleaned) {
    return null;
  }

  const fencedMatch = cleaned.match(/```html\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const htmlMatch = cleaned.match(/<!DOCTYPE html>[\s\S]*<\/html>/i) || cleaned.match(/<html[\s\S]*<\/html>/i);
  if (htmlMatch?.[0]) {
    return htmlMatch[0].trim();
  }

  return cleaned.startsWith('<') ? cleaned : null;
}

function safeJsonParse<T>(rawText: string): T | null {
  const candidates = buildJsonParseCandidates(rawText);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  return null;
}

function buildJsonParseCandidates(rawText: string): string[] {
  const cleaned = rawText.trim();
  const candidates = new Set<string>();

  if (cleaned) {
    candidates.add(cleaned);
    candidates.add(cleaned.replace(/^```json\s*|^```JSON\s*|```$/g, '').trim());
  }

  const fencedMatches = cleaned.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatches?.[1]) {
    candidates.add(fencedMatches[1].trim());
  }

  const extractedObject = extractBalancedJsonBlock(cleaned, '{', '}');
  if (extractedObject) {
    candidates.add(extractedObject);
  }

  const extractedArray = extractBalancedJsonBlock(cleaned, '[', ']');
  if (extractedArray) {
    candidates.add(extractedArray);
  }

  return Array.from(candidates).filter(Boolean);
}

function extractBalancedJsonBlock(rawText: string, opening: '{' | '[', closing: '}' | ']'): string | null {
  const start = rawText.indexOf(opening);
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < rawText.length; index += 1) {
    const char = rawText[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === opening) {
      depth += 1;
      continue;
    }
    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return rawText.slice(start, index + 1).trim();
      }
    }
  }

  return null;
}

export function createDefaultLLMProviders(): LLMProvider[] {
  const providers: LLMProvider[] = [];
  const geminiApiKey =
    getStoredGeminiApiKey() || ((import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || '');
  const geminiModel = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || 'gemini-flash-lite-latest';
  const geminiApiBaseUrl =
    (import.meta.env.VITE_GEMINI_API_BASE_URL as string | undefined) ||
    'https://generativelanguage.googleapis.com/v1beta';
  const ollamaModel = (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) || 'gemma3:1b';

  if (geminiApiKey) {
    providers.push(new GeminiLLMProvider(geminiApiKey, geminiModel, geminiApiBaseUrl));
  }

  providers.push(new OllamaLLMProvider(ollamaModel));
  return providers;
}

export async function generateJsonWithFallback<T>(
  request: JsonGenerationRequest
): Promise<JsonGenerationResponse<T>> {
  const providers = createDefaultLLMProviders().filter((provider) =>
    request.requiredProvider ? provider.name === request.requiredProvider : true
  );
  let lastError = 'No LLM provider available';

  for (const provider of providers) {
    const available = await provider.isAvailable();
    if (!available) {
      lastError = `${provider.name} is not available`;
      continue;
    }

    const result = await provider.generateJson<T>(request);
    if (result.success) {
      return result;
    }

    lastError = result.error || `${provider.name} failed`;
  }

  return {
    success: false,
    provider: 'fallback',
    model: 'none',
    error: lastError,
  };
}

export async function generateHtmlWithFallback(
  request: HtmlGenerationRequest
): Promise<HtmlGenerationResponse> {
  const providers = createDefaultLLMProviders().filter((provider) =>
    request.requiredProvider ? provider.name === request.requiredProvider : true
  );
  let lastError = 'No LLM provider available';

  for (const provider of providers) {
    const available = await provider.isAvailable();
    if (!available) {
      lastError = `${provider.name} is not available`;
      continue;
    }

    const result = await provider.generateHtml(request);
    if (result.success) {
      return result;
    }

    lastError = result.error || `${provider.name} failed`;
  }

  return {
    success: false,
    provider: 'fallback',
    model: 'none',
    error: lastError,
  };
}
