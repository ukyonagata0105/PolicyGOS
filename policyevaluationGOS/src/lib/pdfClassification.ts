import type { DocumentClassification } from '@/types';

export interface PdfClassificationPage {
  charCount: number;
  layoutText: string;
}

export function classifyPdfTextPages(pages: PdfClassificationPage[]): {
  classification: DocumentClassification;
  confidence: number;
} {
  if (pages.length === 0) {
    return { classification: 'unknown', confidence: 0.1 };
  }

  const nonEmptyPages = pages.filter((page) => page.charCount >= 40);
  const totalChars = pages.reduce((sum, page) => sum + page.charCount, 0);
  const averageChars = totalChars / pages.length;
  const populatedRatio = nonEmptyPages.length / pages.length;
  const layoutSignals = pages.filter(
    (page) =>
      page.layoutText.split('\n').filter((line) => /\s{2,}/.test(line) || /(予算|決算|評価|事業)/.test(line))
        .length >= 2
  ).length;

  if (populatedRatio >= 0.8 && averageChars >= 250) {
    return {
      classification: 'digital_text_pdf',
      confidence: layoutSignals > 0 ? 0.97 : 0.9,
    };
  }

  if (populatedRatio >= 0.35 && averageChars >= 80) {
    return {
      classification: 'mixed_pdf',
      confidence: layoutSignals > 0 ? 0.72 : 0.62,
    };
  }

  if (totalChars < 80) {
    return {
      classification: 'image_pdf',
      confidence: 0.78,
    };
  }

  return {
    classification: 'unknown',
    confidence: 0.4,
  };
}
