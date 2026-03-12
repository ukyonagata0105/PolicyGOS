/**
 * PDF Processor using PDF.js
 * Extracts text, page count, and metadata from PDF files in the browser
 */

import * as pdfjs from 'pdfjs-dist';
import { classifyPdfTextPages } from '@/lib/pdfClassification';
import type {
  PdfLayoutProcessingResult,
  PdfMetadata,
  PdfPageText,
  PdfProcessingResult,
} from '@/types';

// Workerの初期化状態を追跡
let workerInitialized = false;

// Workerを初期化
const initializeWorker = () => {
  if (!workerInitialized) {
    // Viteでビルドされたworkerファイルを使用
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    workerInitialized = true;
  }
};

/**
 * PDF日付形式を解析
 */
const parsePdfDate = (dateString: string): Date | undefined => {
  try {
    const cleaned = dateString.replace(/^D:/, '');
    if (cleaned.length < 14) return undefined;

    const year = parseInt(cleaned.substring(0, 4), 10);
    const month = parseInt(cleaned.substring(4, 6), 10) - 1;
    const day = parseInt(cleaned.substring(6, 8), 10);
    const hour = parseInt(cleaned.substring(8, 10), 10);
    const minute = parseInt(cleaned.substring(10, 12), 10);
    const second = parseInt(cleaned.substring(12, 14), 10);

    return new Date(year, month, day, hour, minute, second);
  } catch {
    return undefined;
  }
};

/**
 * PDFからメタデータを抽出
 */
const extractMetadata = async (pdfDoc: pdfjs.PDFDocumentProxy): Promise<PdfMetadata> => {
  const metadata: PdfMetadata = {};

  try {
    const data = await pdfDoc.getMetadata();
    if (data.info) {
      const info = data.info as any;
      if (info.Title) metadata.title = info.Title;
      if (info.Author) metadata.author = info.Author;
      if (info.Subject) metadata.subject = info.Subject;
      if (info.Keywords) metadata.keywords = info.Keywords;
      if (info.Creator) metadata.creator = info.Creator;
      if (info.Producer) metadata.producer = info.Producer;
      if (info.CreationDate) metadata.creationDate = parsePdfDate(info.CreationDate);
      if (info.ModDate) metadata.modificationDate = parsePdfDate(info.ModDate);
    }
  } catch {
    // メタデータが取得できない場合は無視
  }

  return metadata;
};

type TextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
};

function normalizeItemText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildPageText(items: TextItem[]): PdfPageText {
  const positioned = items
    .map((item) => {
      const text = normalizeItemText(item.str || '');
      const transform = Array.isArray(item.transform) ? item.transform : [0, 0, 0, 0, 0, 0];
      return {
        text,
        x: transform[4] || 0,
        y: transform[5] || 0,
        width: typeof item.width === 'number' ? item.width : Math.max(text.length * 6, 6),
        hasEOL: Boolean(item.hasEOL),
      };
    })
    .filter((item) => item.text.length > 0)
    .sort((left, right) => {
      const yDelta = Math.abs(right.y - left.y);
      return yDelta > 2 ? right.y - left.y : left.x - right.x;
    });

  if (positioned.length === 0) {
    return {
      pageNumber: 0,
      text: '',
      layoutText: '',
      charCount: 0,
    };
  }

  const lines: Array<typeof positioned> = [];

  for (const item of positioned) {
    const currentLine = lines[lines.length - 1];
    if (!currentLine) {
      lines.push([item]);
      continue;
    }

    const lineY = currentLine[0]?.y ?? item.y;
    const shouldWrap = Math.abs(lineY - item.y) > 4 || currentLine[currentLine.length - 1]?.hasEOL;
    if (shouldWrap) {
      lines.push([item]);
    } else {
      currentLine.push(item);
    }
  }

  const layoutLines = lines
    .map((line) => line.sort((left, right) => left.x - right.x))
    .map((line) => {
      let rendered = '';
      let previousEnd = 0;

      for (const [index, item] of line.entries()) {
        if (index > 0) {
          const averageCharWidth = Math.max(item.width / Math.max(item.text.length, 1), 3);
          const gap = item.x - previousEnd;
          if (gap > averageCharWidth * 1.5) {
            rendered += ' '.repeat(Math.max(1, Math.min(16, Math.round(gap / averageCharWidth))));
          } else if (!rendered.endsWith(' ')) {
            rendered += ' ';
          }
        }

        rendered += item.text;
        previousEnd = item.x + item.width;
      }

      return rendered.replace(/\s+$/, '');
    })
    .filter(Boolean);

  return {
    pageNumber: 0,
    text: layoutLines.join(' ').trim(),
    layoutText: layoutLines.join('\n').trim(),
    charCount: layoutLines.join('\n').replace(/\s+/g, '').length,
  };
}

async function extractLayoutTextFromDocument(
  pdfDoc: pdfjs.PDFDocumentProxy,
  onProgress?: (current: number, total: number) => void
): Promise<PdfPageText[]> {
  const pages: PdfPageText[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum += 1) {
    onProgress?.(pageNum, pdfDoc.numPages);

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = buildPageText(textContent.items as TextItem[]);
    pages.push({
      ...pageText,
      pageNumber: pageNum,
    });
  }

  return pages;
}

export const extractLayoutTextFromPdf = async (
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<PdfLayoutProcessingResult> => {
  initializeWorker();

  const arrayBuffer = await file.arrayBuffer();

  try {
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
      useWorkerFetch: false,
    });

    const pdfDoc = await loadingTask.promise;
    const metadata = await extractMetadata(pdfDoc);
    const pages = await extractLayoutTextFromDocument(pdfDoc, onProgress);
    const fullText = pages.map((page) => page.text).filter(Boolean).join('\n').trim();
    const layoutText = pages
      .map((page) => [`## Page ${page.pageNumber}`, page.layoutText].filter(Boolean).join('\n'))
      .join('\n\n')
      .trim();

    if (fullText.length < 10) {
      throw new Error('No text extracted from PDF');
    }

    const classification = classifyPdfTextPages(pages);

    return {
      text: fullText,
      layoutText,
      pageCount: pdfDoc.numPages,
      metadata,
      pages,
      classification: classification.classification,
      classificationConfidence: classification.confidence,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn('PDF.js extraction failed:', errorMessage);
    throw new Error(`PDF extraction failed: ${errorMessage}`);
  }
};

/**
 * PDFからテキストを抽出
 * @param file PDFファイル
 * @param onProgress 進捗コールバック（現在のページ/総ページ数）
 * @returns 抽出結果
 */
export const extractTextFromPdf = async (
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<PdfProcessingResult> => {
  const result = await extractLayoutTextFromPdf(file, onProgress);
  return {
    text: result.text,
    pageCount: result.pageCount,
    metadata: result.metadata,
  };
};

/**
 * PDFのページ数のみを取得（軽量版）
 */
export const getPdfPageCount = async (file: File): Promise<number> => {
  initializeWorker();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer, useSystemFonts: true });
  const pdfDoc = await loadingTask.promise;
  return pdfDoc.numPages;
};

/**
 * PDFメタデータのみを取得（軽量版）
 */
export const getPdfMetadata = async (file: File): Promise<PdfMetadata> => {
  initializeWorker();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer, useSystemFonts: true });
  const pdfDoc = await loadingTask.promise;
  return extractMetadata(pdfDoc);
};

/**
 * PDFが有効かどうかをチェック
 */
export const validatePdf = async (file: File): Promise<boolean> => {
  try {
    await getPdfPageCount(file);
    return true;
  } catch {
    return false;
  }
};
