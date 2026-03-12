import { extractLayoutTextFromPdf } from '@/lib/pdfProcessor';
import { parseOCRBackendJsonResult } from '@/lib/ocrBackendResult';
import {
  getOCRBackendClient,
  type BackendConnectionState,
} from '@/lib/ocrBackendClient';
import type {
  DocumentClassification,
  IngestionPath,
  PdfMetadata,
} from '@/types';

export interface OCRProgressUpdate {
  provider: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  jobId?: string;
  pages?: number | null;
}

export interface OCRExtractionResult {
  provider: string;
  text: string;
  structuringText?: string | null;
  pages: number | null;
  rawCsv?: string | null;
  rawJson?: string | null;
  rawLayoutText?: string | null;
  metadata?: PdfMetadata;
  classification: DocumentClassification;
  classificationConfidence: number;
  pathUsed: IngestionPath;
}

export interface OCRProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  extract(
    file: File,
    onProgress?: (update: OCRProgressUpdate) => void
  ): Promise<OCRExtractionResult>;
}

class OCRBackendProvider implements OCRProvider {
  readonly name = 'backend-ocr';
  private readonly apiUrl: string;
  private readonly ready: boolean;

  constructor(connection: BackendConnectionState) {
    this.apiUrl = connection.apiUrl;
    this.ready = connection.ready;
  }

  async isAvailable(): Promise<boolean> {
    return this.ready;
  }

  async extract(
    file: File,
    onProgress?: (update: OCRProgressUpdate) => void
  ): Promise<OCRExtractionResult> {
    const client = getOCRBackendClient({ apiUrl: this.apiUrl });

    onProgress?.({
      provider: this.name,
      status: 'queued',
      progress: 5,
      message: 'OCR backend JSON ジョブを送信中',
    });

    const jsonResponse = await client.extractJsonDocument(
      file,
      (message, progress, jobId) => {
        onProgress?.({
          provider: this.name,
          status: 'processing',
          progress,
          message: `OCR backend JSON: ${message}`,
          jobId,
        });
      }
    );
    const rawJson = jsonResponse.result;
    const finalStatus = jsonResponse.status;
    const parsed = parseOCRBackendJsonResult(rawJson);
    const fallbackText = parsed.text || parsed.layoutText;

    if (!fallbackText) {
      onProgress?.({
        provider: this.name,
        status: 'processing',
        progress: 92,
        message: 'JSON からテキストを復元できないため markdown を再取得します',
        jobId: jsonResponse.jobId,
      });

      const markdownResponse = await client.extractMarkdownDocument(
        file,
        (message, progress, jobId) => {
          onProgress?.({
            provider: this.name,
            status: 'processing',
            progress: Math.max(92, progress),
            message: `OCR Markdown: ${message}`,
            jobId,
          });
        }
      );
      const markdownText = markdownResponse.result;
      const markdownStatus = markdownResponse.status;

      onProgress?.({
        provider: this.name,
        status: 'completed',
        progress: 100,
        message: 'OCR が完了しました',
        jobId: markdownResponse.jobId,
        pages: markdownStatus.pages ?? finalStatus.pages ?? null,
      });

      return {
        provider: this.name,
        text: markdownText,
        structuringText: markdownText,
        rawJson,
        rawLayoutText: markdownText,
        rawCsv: parsed.rawCsv,
        pages: markdownStatus.pages ?? finalStatus.pages ?? null,
        classification: 'image_pdf',
        classificationConfidence: 0.82,
        pathUsed: 'backend_ocr',
      };
    }

    onProgress?.({
      provider: this.name,
      status: 'completed',
      progress: 100,
      message: parsed.hasTables ? 'OCR backend JSON の解析が完了しました' : 'OCR が完了しました',
      jobId: jsonResponse.jobId,
      pages: finalStatus.pages ?? null,
    });

    return {
      provider: this.name,
      text: parsed.text || fallbackText,
      structuringText: parsed.text || fallbackText,
      rawJson,
      rawLayoutText: parsed.layoutText || fallbackText,
      rawCsv: parsed.rawCsv,
      pages: finalStatus.pages ?? null,
      classification: 'image_pdf',
      classificationConfidence: 0.82,
      pathUsed: (parsed.pathUsed as 'backend_ocr' | 'pdf_text_fast_path' | 'fallback' | undefined) || 'backend_ocr',
    };
  }
}

export function createOCRProviders(connection: BackendConnectionState): OCRProvider[] {
  return [new OCRBackendProvider(connection)];
}

export async function extractWithBestOCRProvider(
  file: File,
  connection: BackendConnectionState,
  onProgress?: (update: OCRProgressUpdate) => void
): Promise<OCRExtractionResult> {
  let fastPathResult: Awaited<ReturnType<typeof extractLayoutTextFromPdf>> | null = null;
  const providers = createOCRProviders(connection);

  onProgress?.({
    provider: 'pdf-text',
    status: 'processing',
    progress: 5,
    message: 'PDF テキスト抽出を判定中',
  });

  try {
    fastPathResult = await extractLayoutTextFromPdf(file, (current, total) => {
      onProgress?.({
        provider: 'pdf-text',
        status: 'processing',
        progress: Math.min(55, Math.round((current / total) * 55)),
        message: `PDF テキストを抽出中 (${current}/${total})`,
        pages: total,
      });
    });

    if (shouldUseFastPath(fastPathResult.classification, fastPathResult.classificationConfidence)) {
      let supplementalCsv: string | null = null;
      let supplementalJson: string | null = null;
      let supplementalLayoutText: string | null = null;

      const backendProvider = providers[0];
      if (backendProvider && await backendProvider.isAvailable()) {
        onProgress?.({
          provider: 'backend-ocr',
          status: 'processing',
          progress: 75,
          message: '表構造化のため backend から CSV を補完しています',
          pages: fastPathResult.pageCount,
        });

        try {
          const supplemental = await backendProvider.extract(file, (progress) => {
            onProgress?.({
              provider: progress.provider,
              status: progress.status,
              progress: Math.max(75, Math.min(98, progress.progress)),
              message: progress.message,
              jobId: progress.jobId,
              pages: progress.pages,
            });
          });
          supplementalCsv = supplemental.rawCsv || null;
          supplementalJson = supplemental.rawJson || null;
          supplementalLayoutText = supplemental.rawLayoutText || null;
        } catch {
          // Fast path text extraction remains primary even if supplemental table extraction fails.
        }
      }

      onProgress?.({
        provider: 'pdf-text',
        status: 'completed',
        progress: 100,
        message: 'PDF テキスト抽出で処理を継続します',
        pages: fastPathResult.pageCount,
      });

      return {
        provider: 'pdf-text',
        text: fastPathResult.text,
        structuringText: fastPathResult.text,
        rawLayoutText: supplementalLayoutText || fastPathResult.layoutText,
        rawCsv: supplementalCsv,
        rawJson: supplementalJson,
        pages: fastPathResult.pageCount,
        metadata: fastPathResult.metadata,
        classification: fastPathResult.classification,
        classificationConfidence: fastPathResult.classificationConfidence,
        pathUsed: 'pdf_text_fast_path',
      };
    }

    onProgress?.({
      provider: 'pdf-text',
      status: 'processing',
      progress: 60,
      message: 'テキスト抽出だけでは不十分なため OCR に切り替えます',
      pages: fastPathResult.pageCount,
    });
  } catch (error) {
    onProgress?.({
      provider: 'pdf-text',
      status: 'processing',
      progress: 10,
      message: error instanceof Error ? 'PDF テキスト抽出に失敗したため OCR に切り替えます' : 'OCR に切り替えます',
    });
  }

  for (const provider of providers) {
    if (await provider.isAvailable()) {
      return provider.extract(file, onProgress);
    }
  }

  try {
    const fallbackResult = fastPathResult || await extractLayoutTextFromPdf(file, (current, total) => {
      onProgress?.({
        provider: 'pdf-text',
        status: 'processing',
        progress: Math.min(95, 60 + Math.round((current / total) * 35)),
        message: `OCR を使わず PDF テキストで継続します (${current}/${total})`,
        pages: total,
      });
    });

    onProgress?.({
      provider: 'pdf-text',
      status: 'completed',
      progress: 100,
      message: 'PDF テキスト抽出のみで処理しました',
      pages: fallbackResult.pageCount,
    });

    return {
      provider: 'pdf-text',
      text: fallbackResult.text,
      structuringText: fallbackResult.text,
      rawLayoutText: fallbackResult.layoutText,
      pages: fallbackResult.pageCount,
      metadata: fallbackResult.metadata,
      classification: fallbackResult.classification,
      classificationConfidence: fallbackResult.classificationConfidence,
      pathUsed: 'fallback',
    };
  } catch {
    throw new Error(connection.error || '利用可能な OCR provider がありません');
  }
}

function shouldUseFastPath(
  classification: DocumentClassification,
  confidence: number
): boolean {
  if (classification === 'digital_text_pdf') {
    return confidence >= 0.75;
  }

  return classification === 'mixed_pdf' && confidence >= 0.85;
}
