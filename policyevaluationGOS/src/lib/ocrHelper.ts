/**
 * OCR Integration Helper
 * Provides integration functions for OCR with PDF processing workflow
 */

import type { OCRResult, DeepseekOCROptions } from '@/types';
import {
  extractTextFromImage,
  extractTextFromPdfPageImage,
  isApiKeyConfigured,
  getSupportedImageFormats,
} from './deepseekOCR';

// ============================================================================
// PDF + OCR Integration
// ============================================================================

/**
 * PDFページ画像をOCR処理するためのオプション
 */
export interface PdfOcrOptions extends DeepseekOCROptions {
  /** 最初のNページのみ処理する（デフォルト: 全ページ） */
  maxPages?: number;
  /** ページごとの処理完了コールバック */
  onPageComplete?: (pageNumber: number, text: string) => void;
  /** PDF.jsからレンダリングされたキャンバス画像を使用する場合 */
  useCanvasRendering?: boolean;
}

/**
 * PDF処理結果（OCR統合版）
 */
export interface PdfOcrResult {
  /** 完全なテキスト */
  fullText: string;
  /** ページごとのテキスト */
  pageTexts: string[];
  /** 処理したページ数 */
  processedPages: number;
  /** OCR処理時間（ミリ秒） */
  processingTimeMs: number;
  /** エラーが発生したページ番号の配列 */
  failedPages: number[];
}

/**
 * 画像ファイルの配列からOCR処理を行い、PDF処理結果形式で返す
 * @param imageFiles 画像ファイルの配列（PDFページ順）
 * @param options OCRオプション
 * @returns PDF OCR処理結果
 */
export const processImagesAsPdf = async (
  imageFiles: File[],
  options: PdfOcrOptions = {}
): Promise<PdfOcrResult> => {
  const startTime = Date.now();
  const maxPages = options.maxPages ?? imageFiles.length;
  const filesToProcess = imageFiles.slice(0, maxPages);

  const pageTexts: string[] = [];
  const failedPages: number[] = [];

  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    const pageNumber = i + 1;

    try {
      options.onProgress?.(
        `ページ ${pageNumber} / ${filesToProcess.length} を処理中...`,
        (i / filesToProcess.length) * 100
      );

      const result: OCRResult = await extractTextFromImage(file, {
        ...options,
        onProgress: undefined, // 個別の進捗は無効化
      });

      pageTexts.push(result.text);
      options.onPageComplete?.(pageNumber, result.text);
    } catch (error) {
      console.error(`ページ ${pageNumber} のOCR処理に失敗:`, error);
      failedPages.push(pageNumber);
      pageTexts.push(''); // 失敗したページは空文字
    }
  }

  const processingTimeMs = Date.now() - startTime;

  return {
    fullText: pageTexts.join('\n\n--- ページ区切り ---\n\n'),
    pageTexts,
    processedPages: filesToProcess.length - failedPages.length,
    processingTimeMs,
    failedPages,
  };
};

/**
 * Base64画像データの配列からOCR処理を行う
 * @param base64Images Base64エンコードされた画像データの配列
 * @param options OCRオプション
 * @returns PDF OCR処理結果
 */
export const processBase64Images = async (
  base64Images: string[],
  options: PdfOcrOptions = {}
): Promise<PdfOcrResult> => {
  const startTime = Date.now();
  const maxPages = options.maxPages ?? base64Images.length;
  const imagesToProcess = base64Images.slice(0, maxPages);

  const pageTexts: string[] = [];
  const failedPages: number[] = [];

  for (let i = 0; i < imagesToProcess.length; i++) {
    const base64Image = imagesToProcess[i];
    const pageNumber = i + 1;

    try {
      options.onProgress?.(
        `ページ ${pageNumber} / ${imagesToProcess.length} を処理中...`,
        (i / imagesToProcess.length) * 100
      );

      const text = await extractTextFromPdfPageImage(base64Image, {
        ...options,
        onProgress: undefined,
      });

      pageTexts.push(text);
      options.onPageComplete?.(pageNumber, text);
    } catch (error) {
      console.error(`ページ ${pageNumber} のOCR処理に失敗:`, error);
      failedPages.push(pageNumber);
      pageTexts.push('');
    }
  }

  const processingTimeMs = Date.now() - startTime;

  return {
    fullText: pageTexts.join('\n\n--- ページ区切り ---\n\n'),
    pageTexts,
    processedPages: imagesToProcess.length - failedPages.length,
    processingTimeMs,
    failedPages,
  };
};

/**
 * Canvas要素からOCR処理を行う
 * PDF.jsなどでレンダリングされたCanvas要素を直接処理する場合に使用
 * @param canvas Canvas要素
 * @param options OCRオプション
 * @returns 抽出されたテキスト
 */
export const processCanvasAsOcr = async (
  canvas: HTMLCanvasElement,
  options: DeepseekOCROptions = {}
): Promise<string> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('CanvasのBlob変換に失敗しました'));
        return;
      }

      try {
        const text = await extractTextFromPdfPageImage(blob, options);
        resolve(text);
      } catch (error) {
        reject(error);
      }
    }, 'image/png');
  });
};

/**
 * OCR処理のステータスチェック
 * @returns OCRが使用可能かどうかの情報
 */
export const checkOcrAvailability = (): {
  available: boolean;
  reason?: string;
  supportedFormats: string[];
} => {
  const apiKeyConfigured = isApiKeyConfigured();
  const supportedFormats = getSupportedImageFormats();

  if (!apiKeyConfigured) {
    return {
      available: false,
      reason: 'Deepseek APIキーが設定されていません。環境変数 VITE_DEEPSEEK_API_KEY を設定してください。',
      supportedFormats,
    };
  }

  return {
    available: true,
    supportedFormats,
  };
};

/**
 * OCR処理のエラーを分類
 * @param error エラーオブジェクト
 * @returns エラーの種類
 */
export const classifyOcrError = (error: unknown): {
  type: 'api_key' | 'network' | 'timeout' | 'invalid_image' | 'rate_limit' | 'unknown';
  message: string;
} => {
  if (!(error instanceof Error)) {
    return {
      type: 'unknown',
      message: '予期しないエラーが発生しました',
    };
  }

  const message = error.message.toLowerCase();

  if (message.includes('apiキー') || message.includes('api key') || message.includes('401') || message.includes('403')) {
    return {
      type: 'api_key',
      message: 'APIキーの認証に失敗しました。APIキーを確認してください。',
    };
  }

  if (message.includes('timeout') || message.includes('タイムアウト')) {
    return {
      type: 'timeout',
      message: '処理がタイムアウトしました。時間を置いて再試行してください。',
    };
  }

  if (message.includes('network') || message.includes('fetch') || message.includes('ネットワーク')) {
    return {
      type: 'network',
      message: 'ネットワークエラーが発生しました。接続を確認してください。',
    };
  }

  if (message.includes('画像') || message.includes('image')) {
    return {
      type: 'invalid_image',
      message: '画像ファイルの形式が不正です。',
    };
  }

  if (message.includes('429') || message.includes('rate limit')) {
    return {
      type: 'rate_limit',
      message: 'APIリクエストの回数制限を超えました。時間を置いて再試行してください。',
    };
  }

  return {
    type: 'unknown',
    message: error.message,
  };
};
