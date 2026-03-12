import type { RepairDocumentPayload, RepairResponse } from '@/types';
import type { BackendProbeKind } from '@/lib/backendStartup.js';

const DEFAULT_API_URL = 'http://127.0.0.1:8000';

export interface OCRBackendConfig {
  apiUrl?: string;
  timeout?: number;
}

export interface OCRBackendHealthResponse {
  status: 'healthy' | 'degraded';
  version: string;
  yomitoku_available?: boolean;
  ocr_backend_available?: boolean;
  primary_engine?: string;
  ocr_engine?: string | null;
  device: string;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  result?: string;
  error?: string;
  pages?: number;
}

export interface JobSubmitResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface BackendConnectionState {
  apiUrl: string;
  ready: boolean;
  error: string | null;
  mismatchReason: string | null;
  probeKind: BackendProbeKind | null;
}

export interface SourceCandidate {
  url: string;
  label: string;
  file_name: string;
}

export interface SourceDiscoveryResponse {
  source_url: string;
  strategy: string;
  candidates: SourceCandidate[];
}

export interface OCRBackendAnalysisResponse {
  success: boolean;
  format: 'json' | 'markdown' | 'html' | 'csv';
  result: string | null;
  error: string | null;
  pages: number;
  processing_time_ms: number;
}

export type OutputFormat = 'json' | 'markdown' | 'html' | 'csv';

export interface AsyncJobResult {
  jobId: string;
  result: string;
  status: JobStatus;
}

export class OCRBackendClient {
  private apiUrl: string;
  private timeout: number;

  constructor(config: OCRBackendConfig = {}) {
    this.apiUrl = config.apiUrl || DEFAULT_API_URL;
    this.timeout = config.timeout || 600000;
  }

  async healthCheck(): Promise<OCRBackendHealthResponse> {
    const response = await this.fetchWithTimeout('/health', { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return response.json();
  }

  async getSupportedFormats(): Promise<{ input_formats: string[]; output_formats: string[] }> {
    const response = await this.fetchWithTimeout('/formats', { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Failed to get formats: ${response.statusText}`);
    }
    return response.json();
  }

  async submitJob(file: File, outputFormat: OutputFormat = 'markdown'): Promise<JobSubmitResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.fetchWithTimeout(
      `/analyze/async?output_format=${outputFormat}`,
      { method: 'POST', body: formData },
      30000
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Job submission failed: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await this.fetchWithTimeout(`/jobs/${jobId}`, { method: 'GET' });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Job ${jobId} not found`);
      }
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }
    return response.json();
  }

  async pollJob(
    jobId: string,
    onProgress?: (message: string, progress: number) => void,
    pollInterval: number = 2000
  ): Promise<string> {
    const startedAt = Date.now();

    while (true) {
      if (Date.now() - startedAt > this.timeout) {
        throw new Error('Job polling timeout - OCR backend took too long to respond');
      }

      const status = await this.getJobStatus(jobId);
      onProgress?.(status.message, status.progress);

      if (status.status === 'completed') {
        if (!status.result) {
          throw new Error('Job completed but no result available');
        }
        return status.result;
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Job failed');
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  async runAsyncJob(
    file: File,
    outputFormat: OutputFormat,
    onProgress?: (message: string, progress: number, jobId: string) => void
  ): Promise<AsyncJobResult> {
    onProgress?.('ジョブを送信中...', 5, '');
    const submitted = await this.submitJob(file, outputFormat);
    const result = await this.pollJob(
      submitted.job_id,
      (message, progress) => onProgress?.(message, progress, submitted.job_id)
    );
    const status = await this.getJobStatus(submitted.job_id);
    return { jobId: submitted.job_id, result, status };
  }

  async extractTextFromPdf(
    file: File,
    onProgress?: (message: string, progress: number) => void
  ): Promise<string> {
    const response = await this.runAsyncJob(file, 'markdown', (message, progress) => onProgress?.(message, progress));
    return response.result;
  }

  async extractMarkdownDocument(
    file: File,
    onProgress?: (message: string, progress: number, jobId: string) => void
  ): Promise<AsyncJobResult> {
    return this.runAsyncJob(file, 'markdown', onProgress);
  }

  async extractJsonDocument(
    file: File,
    onProgress?: (message: string, progress: number, jobId: string) => void
  ): Promise<AsyncJobResult> {
    return this.runAsyncJob(file, 'json', onProgress);
  }

  async extractCsvDocument(
    file: File,
    onProgress?: (message: string, progress: number, jobId: string) => void
  ): Promise<AsyncJobResult> {
    return this.runAsyncJob(file, 'csv', onProgress);
  }

  async analyzeDocument(
    file: File,
    outputFormat: OutputFormat = 'markdown',
    onProgress?: (message: string, progress: number) => void
  ): Promise<OCRBackendAnalysisResponse> {
    onProgress?.('OCR backend でドキュメントを解析中...', 10);
    const formData = new FormData();
    formData.append('file', file);

    const endpoint =
      outputFormat === 'json'
        ? '/analyze/json'
        : outputFormat === 'markdown'
          ? '/analyze/markdown'
          : outputFormat === 'html'
            ? '/analyze/html'
            : '/analyze/csv';

    const response = await this.fetchWithTimeout(endpoint, { method: 'POST', body: formData }, this.timeout);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Analysis failed: ${response.statusText} - ${errorText}`);
    }
    onProgress?.('完了', 100);
    return response.json();
  }

  async discoverSource(url: string, strategy: string): Promise<SourceDiscoveryResponse> {
    const response = await this.fetchWithTimeout(
      `/sources/discover?url=${encodeURIComponent(url)}&strategy=${encodeURIComponent(strategy)}`,
      { method: 'GET' },
      60000
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Source discovery failed: ${response.statusText} - ${errorText}`);
    }
    return response.json();
  }

  async fetchRemotePdf(url: string): Promise<File> {
    const response = await this.fetchWithTimeout(
      `/sources/fetch?url=${encodeURIComponent(url)}`,
      { method: 'GET' },
      120000
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Remote PDF fetch failed: ${response.statusText} - ${errorText}`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const fileNameMatch = disposition.match(/filename="([^"]+)"/);
    const fileName = fileNameMatch?.[1] || decodeURIComponent(url.split('/').pop() || 'document.pdf');
    return new File([blob], fileName, { type: blob.type || 'application/pdf' });
  }

  async repairExtractedRows(payload: RepairDocumentPayload): Promise<RepairResponse> {
    const response = await this.fetchWithTimeout(
      '/repair/opencode',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      300000
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Repair request failed: ${response.statusText} - ${errorText}`);
    }
    return response.json();
  }

  private async fetchWithTimeout(
    endpoint: string,
    options: RequestInit = {},
    timeout?: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout || this.timeout);

    try {
      const response = await fetch(`${this.apiUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout - OCR backend took too long to respond');
      }
      throw error;
    }
  }
}

let clientInstance: OCRBackendClient | null = null;

export function resetOCRBackendClient(): void {
  clientInstance = null;
}

export function getOCRBackendClient(config?: OCRBackendConfig): OCRBackendClient {
  if (!clientInstance || config?.apiUrl) {
    clientInstance = new OCRBackendClient(config);
  }
  return clientInstance;
}

export async function resolveBackendConnection(): Promise<BackendConnectionState> {
  if (window.electronAPI?.getBackendConfig) {
    const config = await window.electronAPI.getBackendConfig();
      return {
        apiUrl: config.apiUrl || DEFAULT_API_URL,
        ready: config.ready,
        error: config.error,
        mismatchReason: config.mismatchReason,
        probeKind: config.probeKind,
      };
    }

  const envApiUrl =
    (import.meta.env.VITE_OCR_BACKEND_URL as string | undefined) ||
    (import.meta.env.VITE_YOMITOKU_API_URL as string | undefined);

  return {
    apiUrl: envApiUrl || DEFAULT_API_URL,
    ready: true,
    error: null,
    mismatchReason: null,
    probeKind: 'policyeval-backend',
  };
}

export async function isOCRBackendAvailable(): Promise<boolean> {
  try {
    const client = getOCRBackendClient();
    const health = await client.healthCheck();
    return health.status === 'healthy' && (health.ocr_backend_available ?? health.yomitoku_available ?? false);
  } catch {
    return false;
  }
}
