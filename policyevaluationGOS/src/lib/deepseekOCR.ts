/**
 * Deepseek OCR Module
 * Extracts text from images using Deepseek API or local model
 */

import type { OCRResult, DeepseekOCROptions } from '@/types';

// デフォルト設定
const DEFAULT_CONFIG = {
  apiUrl: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-chat',
  timeout: 30000, // 30秒
} as const;

/**
 * 画像ファイルをBase64に変換
 * @param file 画像ファイル
 * @returns Base64エンコードされた画像データ
 */
const imageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // データURLプレフィックスを削除（base64部分のみ）
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
};

/**
 * MIMEタイプから画像形式を判定
 * @param mimeType MIMEタイプ
 * @returns 画像形式
 */
const getImageFormat = (mimeType: string): string => {
  const formatMap: Record<string, string> = {
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpeg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
  };
  return formatMap[mimeType] || 'png';
};

/**
 * Deepseek APIを使用して画像からテキストを抽出
 * @param imageFile 画像ファイル
 * @param options OCRオプション
 * @returns 抽出されたテキストとメタデータ
 */
export const extractTextFromImage = async (
  imageFile: File,
  options: DeepseekOCROptions = {}
): Promise<OCRResult> => {
  const startTime = Date.now();

  // 進捗コールバック
  const reportProgress = options.onProgress || (() => {});

  try {
    // 画像ファイルのバリデーション
    if (!imageFile.type.startsWith('image/')) {
      throw new Error('画像ファイルのみ対応しています');
    }

    reportProgress('画像を読み込んでいます...', 10);

    // 画像をBase64に変換
    const base64Image = await imageToBase64(imageFile);
    const imageFormat = getImageFormat(imageFile.type);

    reportProgress('APIリクエストを送信しています...', 30);

    // APIキーのチェック
    const apiKey = options.apiKey || import.meta.env.VITE_DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('Deepseek APIキーが設定されていません');
    }

    // APIリクエストの構築
    const apiUrl = options.apiUrl || DEFAULT_CONFIG.apiUrl;
    const model = options.model || DEFAULT_CONFIG.model;

    const requestBody = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'この画像に含まれるテキストをすべて抽出してください。テキストのみを返し、余計な説明は加えないでください。',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/${imageFormat};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
      temperature: 0.1, // 低い温度で安定した結果を得る
    };

    reportProgress('テキストを抽出しています...', 50);

    // APIリクエストを送信
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(DEFAULT_CONFIG.timeout),
    });

    reportProgress('レスポンスを処理しています...', 80);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `APIエラー: ${response.status} ${response.statusText}\n${
          errorData.error?.message || ''
        }`
      );
    }

    const data = await response.json();

    // レスポンスからテキストを抽出
    const extractedText =
      data.choices?.[0]?.message?.content ||
      data.message?.content ||
      '';

    if (!extractedText) {
      throw new Error('テキストの抽出に失敗しました');
    }

    reportProgress('完了', 100);

    const processingTimeMs = Date.now() - startTime;

    return {
      text: extractedText.trim(),
      confidence: undefined, // Deepseek APIは信頼度を返さない
      processingTimeMs,
      model,
    };
  } catch (error) {
    // エラー処理
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        throw new Error('処理がタイムアウトしました。時間を置いて再試行してください。');
      }
      throw error;
    }
    throw new Error('予期しないエラーが発生しました');
  }
};

/**
 * 複数の画像ファイルからテキストを一括抽出
 * @param imageFiles 画像ファイルの配列
 * @param options OCRオプション
 * @returns 抽出結果の配列
 */
export const extractTextFromImages = async (
  imageFiles: File[],
  options: DeepseekOCROptions = {}
): Promise<OCRResult[]> => {
  const results: OCRResult[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    options.onProgress?.(
      `画像 ${i + 1} / ${imageFiles.length} を処理中...`,
      (i / imageFiles.length) * 100
    );

    try {
      const result = await extractTextFromImage(file, {
        ...options,
        onProgress: undefined, // 個別の進捗は無効化
      });
      results.push(result);
    } catch (error) {
      console.error(`画像 ${file.name} の処理に失敗:`, error);
      results.push({
        text: '',
        confidence: 0,
        processingTimeMs: 0,
        model: options.model || DEFAULT_CONFIG.model,
      });
    }
  }

  return results;
};

/**
 * PDFページ画像からテキストを抽出（PdfUploader連携用）
 * @param imageData 画像データ（Base64またはBlob）
 * @param options OCRオプション
 * @returns 抽出されたテキスト
 */
export const extractTextFromPdfPageImage = async (
  imageData: string | Blob,
  options: DeepseekOCROptions = {}
): Promise<string> => {
  let imageFile: File;

  // Blobの場合はFileに変換
  if (imageData instanceof Blob) {
    imageFile = new File([imageData], 'page.png', { type: 'image/png' });
  } else {
    // Base64文字列の場合はBlobに変換してからFileに
    const fetchResponse = await fetch(imageData);
    const blob = await fetchResponse.blob();
    imageFile = new File([blob], 'page.png', { type: 'image/png' });
  }

  const result = await extractTextFromImage(imageFile, options);
  return result.text;
};

/**
 * APIキーが設定されているか確認
 * @returns APIキーが有効かどうか
 */
export const isApiKeyConfigured = (): boolean => {
  return !!import.meta.env.VITE_DEEPSEEK_API_KEY;
};

/**
 * 利用可能な画像形式を取得
 * @returns サポートされるMIMEタイプの配列
 */
export const getSupportedImageFormats = (): string[] => {
  return [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
  ];
};
