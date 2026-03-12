import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createJsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  } as Response;
}

const electronMocks = vi.hoisted(() => {
  const whenReadyPromise = new Promise<void>(() => undefined);

  return {
    app: {
      isPackaged: false,
      whenReady: vi.fn(() => whenReadyPromise),
      on: vi.fn(),
      quit: vi.fn(),
    },
    BrowserWindow: vi.fn().mockImplementation(() => ({
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      webContents: {
        openDevTools: vi.fn(),
      },
      show: vi.fn(),
    })),
    ipcMain: {
      handle: vi.fn(),
    },
    spawn: vi.fn(),
  };
});

vi.mock('electron', () => ({
  app: electronMocks.app,
  BrowserWindow: electronMocks.BrowserWindow,
  ipcMain: electronMocks.ipcMain,
}));

vi.mock('child_process', () => ({
  default: {
    spawn: electronMocks.spawn,
  },
  spawn: electronMocks.spawn,
}));

describe('electron startup backend validation', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const envBackup = {
    external: process.env.POLICYEVAL_EXTERNAL_BACKEND,
    url: process.env.POLICYEVAL_BACKEND_URL,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    electronMocks.spawn.mockReset();
    process.env.POLICYEVAL_EXTERNAL_BACKEND = '1';
    process.env.POLICYEVAL_BACKEND_URL = 'http://127.0.0.1:8000';
  });

  afterEach(() => {
    process.env.POLICYEVAL_EXTERNAL_BACKEND = envBackup.external;
    process.env.POLICYEVAL_BACKEND_URL = envBackup.url;
    vi.unstubAllGlobals();
  });

  it('fails fast for a wrong external backend target and returns actionable mismatch details', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/ready')) {
        return createJsonResponse({ ready: true, status: 'ready' });
      }
      if (url.endsWith('/health')) {
        return createJsonResponse({
          status: 'healthy',
          version: '1.0.0',
          device: 'cpu',
          ocr_backend_available: true,
        });
      }
      if (url.endsWith('/openapi.json')) {
        return createJsonResponse({
          paths: {
            '/hello': {
              get: {},
            },
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { startBackend } = await import('../../electron/main.js');
    const result = await startBackend();

    expect(result).toMatchObject({
      apiUrl: 'http://127.0.0.1:8000',
      ready: false,
      probeKind: 'wrong-service',
      mismatchReason: 'Backend OpenAPI schema is missing /repair/opencode.',
    });
    expect(result.error).toContain('not a compatible PolicyEval OCR backend');
    expect(result.error).toContain('Update POLICYEVAL_BACKEND_URL');
    expect(electronMocks.spawn).not.toHaveBeenCalled();
  });

  it('returns the verified external backend URL when the target matches the PolicyEval contract', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/ready')) {
        return createJsonResponse({ ready: true, status: 'ready' });
      }
      if (url.endsWith('/health')) {
        return createJsonResponse({
          status: 'healthy',
          version: '2.0.0',
          device: 'cpu',
          ocr_backend_available: true,
          yomitoku_available: true,
        });
      }
      if (url.endsWith('/openapi.json')) {
        return createJsonResponse({
          paths: {
            '/repair/opencode': {
              post: {},
            },
          },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { startBackend } = await import('../../electron/main.js');
    const result = await startBackend();

    expect(result).toEqual({
      apiUrl: 'http://127.0.0.1:8000',
      ready: true,
      error: null,
      mismatchReason: null,
      probeKind: 'policyeval-backend',
      mode: 'external',
    });
  });

  it('formats degraded backend errors with readiness details for the renderer notice', async () => {
    const { formatBackendStartupError } = await import('../../electron/main.js');

    const message = formatBackendStartupError({
      mode: 'internal',
      apiUrl: 'http://127.0.0.1:15555',
      probe: {
        kind: 'degraded',
        apiUrl: 'http://127.0.0.1:15555',
        reason: 'Backend contract matched but service is not fully ready.',
        ready: false,
        readyStatus: 'starting',
        healthStatus: 'degraded',
      },
      fallbackMessage: 'Timed out waiting for verified backend startup',
    });

    expect(message).toContain('matched the PolicyEval OCR contract but is not fully ready');
    expect(message).toContain('ready=starting');
    expect(message).toContain('health=degraded');
  });
});
