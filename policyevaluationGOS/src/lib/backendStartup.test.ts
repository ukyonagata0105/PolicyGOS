import net from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  findFreeLocalhostPort,
  probeBackendTarget,
  waitForVerifiedBackend,
} from '@/lib/backendStartup.js';

function createJsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  } as Response;
}

describe('backend startup helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies a verified PolicyEval backend via ready, health, and repair contract checks', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
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

    await expect(probeBackendTarget('http://127.0.0.1:18000/', { fetchImpl })).resolves.toEqual({
      kind: 'policyeval-backend',
      apiUrl: 'http://127.0.0.1:18000',
      reason: null,
      ready: true,
      readyStatus: 'ready',
      healthStatus: 'healthy',
    });
  });

  it('classifies a reachable but unrelated service as wrong-service', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
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

    await expect(probeBackendTarget('http://127.0.0.1:8000', { fetchImpl })).resolves.toMatchObject({
      kind: 'wrong-service',
      apiUrl: 'http://127.0.0.1:8000',
      ready: false,
      reason: 'Backend OpenAPI schema is missing /repair/opencode.',
    });
  });

  it('classifies an unreachable backend when the target cannot be contacted', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL) => Promise<Response>>().mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(probeBackendTarget('http://127.0.0.1:19999', { fetchImpl })).resolves.toMatchObject({
      kind: 'unreachable',
      apiUrl: 'http://127.0.0.1:19999',
      ready: false,
    });
  });

  it('classifies a degraded PolicyEval backend when readiness or health is incomplete', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.endsWith('/ready')) {
        return createJsonResponse({ ready: false, status: 'starting' });
      }
      if (url.endsWith('/health')) {
        return createJsonResponse({
          status: 'degraded',
          version: '2.0.0',
          device: 'cpu',
          ocr_backend_available: false,
          yomitoku_available: false,
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

    await expect(probeBackendTarget('http://127.0.0.1:18001', { fetchImpl })).resolves.toEqual({
      kind: 'degraded',
      apiUrl: 'http://127.0.0.1:18001',
      reason: 'Backend contract matched but service is not fully ready.',
      ready: false,
      readyStatus: 'starting',
      healthStatus: 'degraded',
    });
  });

  it('waits for a started backend to satisfy the PolicyEval contract', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL) => Promise<Response>>();

    fetchImpl
      .mockResolvedValueOnce(createJsonResponse({ ready: false, status: 'starting' }))
      .mockResolvedValueOnce(createJsonResponse({ status: 'degraded', version: '2.0.0', device: 'cpu', ocr_backend_available: false, yomitoku_available: false }))
      .mockResolvedValueOnce(createJsonResponse({ paths: { '/repair/opencode': { post: {} } } }))
      .mockResolvedValueOnce(createJsonResponse({ ready: true, status: 'ready' }))
      .mockResolvedValueOnce(createJsonResponse({ status: 'healthy', version: '2.0.0', device: 'cpu', ocr_backend_available: true, yomitoku_available: true }))
      .mockResolvedValueOnce(createJsonResponse({ paths: { '/repair/opencode': { post: {} } } }));

    await expect(
      waitForVerifiedBackend('http://127.0.0.1:18002', { fetchImpl, intervalMs: 0, timeoutMs: 1000 })
    ).resolves.toMatchObject({
      kind: 'policyeval-backend',
      apiUrl: 'http://127.0.0.1:18002',
      ready: true,
    });
  });

  it('allocates a free 5-digit localhost port that can be bound immediately afterward', async () => {
    const port = await findFreeLocalhostPort();

    expect(port).toBeGreaterThanOrEqual(10000);
    expect(port).toBeLessThanOrEqual(65535);
    expect(String(port)).toHaveLength(5);

    await expect(
      new Promise<void>((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.close((closeError) => {
            if (closeError) {
              reject(closeError);
              return;
            }
            resolve();
          });
        });
      })
    ).resolves.toBeUndefined();
  });
});
