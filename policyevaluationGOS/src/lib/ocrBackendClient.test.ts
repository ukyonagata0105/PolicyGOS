import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OCRBackendClient,
  resetOCRBackendClient,
  resolveBackendConnection,
} from './ocrBackendClient';

type ElectronAPIWindow = Window & {
  electronAPI?: {
    getBackendConfig?: () => Promise<{
      apiUrl?: string;
      ready: boolean;
      error: string | null;
      mismatchReason: string | null;
      probeKind: 'policyeval-backend' | 'wrong-service' | 'unreachable' | 'degraded' | null;
    }>;
  };
};

const DEFAULT_API_URL = 'http://127.0.0.1:8000';
const env = import.meta.env as Record<string, string | undefined>;
const originalOcrBackendUrl = env.VITE_OCR_BACKEND_URL;
const originalLegacyBackendUrl = env.VITE_YOMITOKU_API_URL;
const sourceFiles = {
  backendMain: path.resolve(process.cwd(), '..', 'document_ocr_api', 'main.py'),
  electronMain: path.resolve(process.cwd(), 'electron', 'main.js'),
  externalBackendScript: path.resolve(process.cwd(), 'scripts', 'run-electron-external-backend.mjs'),
};

function setBackendEnv(values: {
  ocrBackendUrl?: string;
  legacyBackendUrl?: string;
}): void {
  if (values.ocrBackendUrl === undefined) {
    delete env.VITE_OCR_BACKEND_URL;
  } else {
    env.VITE_OCR_BACKEND_URL = values.ocrBackendUrl;
  }

  if (values.legacyBackendUrl === undefined) {
    delete env.VITE_YOMITOKU_API_URL;
  } else {
    env.VITE_YOMITOKU_API_URL = values.legacyBackendUrl;
  }
}

function restoreBackendEnv(): void {
  if (originalOcrBackendUrl === undefined) {
    delete env.VITE_OCR_BACKEND_URL;
  } else {
    env.VITE_OCR_BACKEND_URL = originalOcrBackendUrl;
  }

  if (originalLegacyBackendUrl === undefined) {
    delete env.VITE_YOMITOKU_API_URL;
  } else {
    env.VITE_YOMITOKU_API_URL = originalLegacyBackendUrl;
  }
}

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('OCR backend startup contracts', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    resetOCRBackendClient();
    delete (window as ElectronAPIWindow).electronAPI;
    setBackendEnv({ ocrBackendUrl: undefined, legacyBackendUrl: undefined });
  });

  afterEach(() => {
    delete (window as ElectronAPIWindow).electronAPI;
    restoreBackendEnv();
  });

  describe('frontend backend URL resolution order', () => {
    it('prefers the Electron-provided backend config over Vite env fallbacks', async () => {
      setBackendEnv({
        ocrBackendUrl: 'http://ocr-env.example:8000',
        legacyBackendUrl: 'http://legacy-env.example:8000',
      });
      (window as ElectronAPIWindow).electronAPI = {
        getBackendConfig: vi.fn().mockResolvedValue({
          apiUrl: 'http://electron.example:9000',
          ready: false,
          error: 'starting',
          mismatchReason: 'Backend contract matched but service is not fully ready.',
          probeKind: 'degraded',
        }),
      };

      await expect(resolveBackendConnection()).resolves.toEqual({
        apiUrl: 'http://electron.example:9000',
        ready: false,
        error: 'starting',
        mismatchReason: 'Backend contract matched but service is not fully ready.',
        probeKind: 'degraded',
      });
    });

    it('uses VITE_OCR_BACKEND_URL before the legacy backend env', async () => {
      setBackendEnv({
        ocrBackendUrl: 'http://ocr-env.example:8000',
        legacyBackendUrl: 'http://legacy-env.example:8000',
      });

      await expect(resolveBackendConnection()).resolves.toEqual({
        apiUrl: 'http://ocr-env.example:8000',
        ready: true,
        error: null,
        mismatchReason: null,
        probeKind: 'policyeval-backend',
      });
    });

    it('falls back to the legacy env before the default backend URL', async () => {
      setBackendEnv({ legacyBackendUrl: 'http://legacy-env.example:8000' });

      await expect(resolveBackendConnection()).resolves.toEqual({
        apiUrl: 'http://legacy-env.example:8000',
        ready: true,
        error: null,
        mismatchReason: null,
        probeKind: 'policyeval-backend',
      });
    });

    it('uses the loopback default when no backend URL is configured', async () => {
      await expect(resolveBackendConnection()).resolves.toEqual({
        apiUrl: DEFAULT_API_URL,
        ready: true,
        error: null,
        mismatchReason: null,
        probeKind: 'policyeval-backend',
      });
    });

    it('keeps the same precedence in the Electron startup sources', () => {
      const electronMain = readSource(sourceFiles.electronMain);
      const externalBackendScript = readSource(sourceFiles.externalBackendScript);
      const expectedChain = 'process.env.POLICYEVAL_BACKEND_URL || process.env.VITE_OCR_BACKEND_URL || process.env.VITE_YOMITOKU_API_URL || DEFAULT_BACKEND_URL';

      expect(electronMain).toContain(expectedChain);
      expect(externalBackendScript).toContain('resolveExternalBackendUrl');
      expect(externalBackendScript).toContain('buildElectronRuntimeEnv');
    });
  });

  describe('backend endpoint contract assumptions', () => {
    it('calls the current /health endpoint and accepts the current response shape', async () => {
      const client = new OCRBackendClient({ apiUrl: 'http://localhost:8000' });
      const healthResponse = {
        status: 'healthy' as const,
        version: '2.0.0',
        yomitoku_available: true,
        ocr_backend_available: true,
        primary_engine: 'pymupdf',
        ocr_engine: 'paddleocr',
        device: 'cpu',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => healthResponse,
      });

      await expect(client.healthCheck()).resolves.toEqual(healthResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/health',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('posts repair requests to /repair/opencode with JSON payloads', async () => {
      const client = new OCRBackendClient({ apiUrl: 'http://localhost:8000' });
      const payload = {
        document_id: 'doc-1',
        document_name: 'Document 1',
        candidate_rows: [],
        row_decisions: [],
        normalized_rows: [],
        review_items: [],
      };
      const repairResponse = {
        success: true,
        provider: 'opencode',
        normalized_rows: [],
        notes: ['ok'],
        raw_response: null,
        error: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => repairResponse,
      });

      await expect(client.repairExtractedRows(payload)).resolves.toEqual(repairResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/repair/opencode',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      );
    });

    it('freezes the current /ready, /health, and /repair/opencode definitions in the backend source', () => {
      const backendMain = readSource(sourceFiles.backendMain);

      expect(backendMain).toContain('@app.get("/health", response_model=HealthResponse)');
      expect(backendMain).toContain('status="healthy" if backend_available else "degraded"');
      expect(backendMain).toContain('yomitoku_available=backend_available');
      expect(backendMain).toContain('ocr_backend_available=backend_available');
      expect(backendMain).toContain('primary_engine="pymupdf"');
      expect(backendMain).toContain('@app.get("/ready", response_model=dict)');
      expect(backendMain).toContain('"ready": startup_ready');
      expect(backendMain).toContain('"status": "ready" if startup_ready else "starting"');
      expect(backendMain).toContain('@app.post("/repair/opencode", response_model=RepairResponse)');
      expect(backendMain).toContain('return run_opencode_repair(request)');
    });
  });
});
