import { describe, expect, it } from 'vitest';

import { classifyPdfTextPages } from '@/lib/pdfClassification';

describe('pdfProcessor classification', () => {
  it('classifies text-rich PDFs as digital text', () => {
    const result = classifyPdfTextPages([
      {
        charCount: 720,
        layoutText: '事業名    最終予算額    決算額\n健康増進事業    1,200    1,180',
      },
      {
        charCount: 650,
        layoutText: '事業名    最終予算額    決算額\n高齢者支援事業    980    950',
      },
    ]);

    expect(result.classification).toBe('digital_text_pdf');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('classifies almost empty pages as image PDFs', () => {
    const result = classifyPdfTextPages([
      {
        charCount: 12,
        layoutText: '',
      },
      {
        charCount: 18,
        layoutText: '',
      },
    ]);

    expect(result.classification).toBe('image_pdf');
  });
});
