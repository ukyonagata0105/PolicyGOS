import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generatePromptHtmlRuntime } from '@/lib/promptHtmlRuntime';
import { createGeneratedUIConsumerDocument, generatedUICompatibilityProfile } from '@/test/generatedUICompat';

const generateHtmlWithFallbackMock = vi.fn();

vi.mock('@/lib/llmProviders', () => ({
  generateHtmlWithFallback: (...args: unknown[]) => generateHtmlWithFallbackMock(...args),
}));

describe('promptHtmlRuntime', () => {
  beforeEach(() => {
    generateHtmlWithFallbackMock.mockReset();
  });

  it('returns a real HTML runtime for prompt-only generation', async () => {
    generateHtmlWithFallbackMock.mockResolvedValue({
      success: true,
      html: '<!DOCTYPE html><html lang="ja"><head><title>地域交通 briefing</title><meta name="description" content="住民向けのHTML briefing" /></head><body><main><h1>地域交通 briefing</h1></main></body></html>',
      rawText: '<!DOCTYPE html><html lang="ja"><head><title>地域交通 briefing</title></head><body><main><h1>地域交通 briefing</h1></main></body></html>',
      provider: 'gemini',
      model: 'gemini-flash-lite-latest',
    });

    const result = await generatePromptHtmlRuntime([], generatedUICompatibilityProfile, {
      prompt: '地域交通の争点を住民向けに説明して',
      mode: 'fresh',
      messages: [],
      contextDocumentId: null,
    });

    expect(result.success).toBe(true);
    expect(result.ui).toMatchObject({
      title: '地域交通 briefing',
      provider: 'gemini',
      model: 'gemini-flash-lite-latest',
      renderMode: 'html',
      warnings: [],
    });
    expect(result.ui?.htmlDocument).toContain('<!DOCTYPE html>');
    expect(result.ui?.htmlDocument).toContain('<h1>地域交通 briefing</h1>');
  });

  it('includes attached PDF context and exposes explicit fallback state on provider failure', async () => {
    const document = createGeneratedUIConsumerDocument('context.pdf');
    document.rawLayoutText = '政策評価の要点: 利用者数、便数、交通空白地の解消状況';

    generateHtmlWithFallbackMock.mockResolvedValue({
      success: false,
      provider: 'fallback',
      model: 'none',
      error: 'Gemini quota exceeded',
    });

    const result = await generatePromptHtmlRuntime([document], generatedUICompatibilityProfile, {
      prompt: '添付PDFをもとに briefing を作って',
      mode: 'follow-up',
      messages: [{ role: 'user', content: '最初に全体像を知りたい' }],
      contextDocumentId: document.id,
    });

    expect(generateHtmlWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Attached PDF context: context.pdf'),
      })
    );
    expect(result.success).toBe(true);
    expect(result.ui).toMatchObject({
      provider: 'fallback',
      model: 'prompt-html-fallback',
      renderMode: 'schema',
    });
    expect(result.ui?.warnings?.[0]).toContain('Gemini quota exceeded');
  });

  it('passes exact extracted metric values into the html prompt context when available', async () => {
    const document = createGeneratedUIConsumerDocument('metrics.pdf');
    document.rawLayoutText = '活動指標と成果指標を含む政策評価表です。';

    generateHtmlWithFallbackMock.mockResolvedValue({
      success: true,
      html: '<!DOCTYPE html><html lang="ja"><head><title>指標まとめ</title></head><body><main><h1>指標まとめ</h1></main></body></html>',
      rawText: '<!DOCTYPE html><html lang="ja"><head><title>指標まとめ</title></head><body><main><h1>指標まとめ</h1></main></body></html>',
      provider: 'gemini',
      model: 'gemini-flash-lite-latest',
    });

    await generatePromptHtmlRuntime([document], generatedUICompatibilityProfile, {
      prompt: 'このドキュメントの評価指標をまとめてください。',
      mode: 'fresh',
      messages: [],
      contextDocumentId: document.id,
    });

    expect(generateHtmlWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Exact metrics:'),
      })
    );
    expect(generateHtmlWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('交通空白地の解消率'),
      })
    );
    expect(generateHtmlWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('実績=65%'),
      })
    );
    expect(generateHtmlWithFallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('目標=80%'),
      })
    );
  });
});
