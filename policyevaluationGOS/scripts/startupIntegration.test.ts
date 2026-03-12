import { EventEmitter } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { startBackendDev, resolveBackendDevStartup } from './run-backend-dev.mjs';
import { resolveExternalBackendUrl } from './run-electron-external-backend.mjs';

type FixtureKind = 'policyeval-backend' | 'wrong-service';

interface BackendFixture {
  apiUrl: string;
  close: () => Promise<void>;
}

function buildFixtureResponse(kind: FixtureKind, pathname: string) {
  if (pathname === '/ready') {
    return {
      statusCode: 200,
      body: { ready: true, status: 'ready' },
    };
  }

  if (pathname === '/health') {
    return {
      statusCode: 200,
      body: {
        status: 'healthy',
        version: '2.0.0',
        device: 'cpu',
        ocr_backend_available: true,
        yomitoku_available: true,
      },
    };
  }

  if (pathname === '/openapi.json') {
    return {
      statusCode: 200,
      body: kind === 'policyeval-backend'
        ? { paths: { '/repair/opencode': { post: {} } } }
        : { paths: { '/hello': { get: {} } } },
    };
  }

  return {
    statusCode: 404,
    body: { detail: 'Not Found' },
  };
}

async function startBackendFixture(kind: FixtureKind, port = 0): Promise<BackendFixture> {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const payload = buildFixtureResponse(kind, pathname);

    response.writeHead(payload.statusCode, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload.body));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;

  return {
    apiUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }),
  };
}

function extractPort(apiUrl: string) {
  return Number(new URL(apiUrl).port);
}

describe('startup integration behavior', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('fails fast when an explicit 8000 override points at the wrong service', async () => {
    const wrongService = await startBackendFixture('wrong-service', 8000);
    cleanups.push(wrongService.close);

    await expect(
      resolveExternalBackendUrl({
        env: { POLICYEVAL_BACKEND_URL: wrongService.apiUrl },
      })
    ).rejects.toThrow(`Configured external backend ${wrongService.apiUrl} is not a ready PolicyEval backend`);
  });

  it('reuses a verified external backend override across startup entry points', async () => {
    const backend = await startBackendFixture('policyeval-backend');
    cleanups.push(backend.close);

    await expect(
      resolveExternalBackendUrl({
        env: { POLICYEVAL_BACKEND_URL: backend.apiUrl },
      })
    ).resolves.toBe(backend.apiUrl);

    await expect(
      resolveBackendDevStartup({
        env: { POLICYEVAL_BACKEND_URL: backend.apiUrl },
      })
    ).resolves.toEqual({
      mode: 'reuse',
      apiUrl: backend.apiUrl,
      port: null,
    });
  });

  it('starts a local backend on a verified random 5-digit port', async () => {
    let startedBackendApiUrl: string | null = null;

    const backend = await startBackendDev({
      env: {},
      stdio: 'pipe',
      spawnImpl: (_command: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
        const child = Object.assign(new EventEmitter(), {
          exitCode: null as number | null,
          killed: false,
          pid: 43210,
        });

        void startBackendFixture('policyeval-backend', Number(options.env.PORT)).then((fixture) => {
          startedBackendApiUrl = fixture.apiUrl;
          cleanups.push(fixture.close);
        });

        return child;
      },
    });

    const port = extractPort(backend.apiUrl);
    const readyResponse = await fetch(`${backend.apiUrl}/ready`);

    expect(backend.mode).toBe('spawn');
    expect(port).toBeGreaterThanOrEqual(10000);
    expect(String(port)).toHaveLength(5);
    expect(port).not.toBe(8000);
    expect(startedBackendApiUrl).toBe(backend.apiUrl);
    await expect(readyResponse.json()).resolves.toEqual({ ready: true, status: 'ready' });
  });
});
