import { describe, expect, it, vi } from 'vitest';

import { resolveBackendDevStartup } from './run-backend-dev.mjs';
import { getDebugViteDevArgs } from './run-debug-full.mjs';
import { buildElectronRuntimeEnv, resolveExternalBackendUrl } from './run-electron-external-backend.mjs';

describe('startup script wiring', () => {
  it('reuses a verified backend target when an override is already ready', async () => {
    const probeBackend = vi.fn().mockResolvedValue({
      kind: 'policyeval-backend',
      apiUrl: 'http://127.0.0.1:18123',
      reason: null,
      ready: true,
    });

    await expect(
      resolveBackendDevStartup({
        env: { POLICYEVAL_BACKEND_URL: 'http://127.0.0.1:18123' },
        probeBackend,
      })
    ).resolves.toEqual({
      mode: 'reuse',
      apiUrl: 'http://127.0.0.1:18123',
      port: null,
    });
  });

  it('rejects an invalid external backend override before launching Electron', async () => {
    const probeBackend = vi.fn().mockResolvedValue({
      kind: 'wrong-service',
      apiUrl: 'http://127.0.0.1:8000',
      reason: 'Backend OpenAPI schema is missing /repair/opencode.',
      ready: false,
    });

    await expect(
      resolveExternalBackendUrl({
        env: { POLICYEVAL_BACKEND_URL: 'http://127.0.0.1:8000' },
        probeBackend,
      })
    ).rejects.toThrow('Configured external backend http://127.0.0.1:8000 is not a ready PolicyEval backend');
  });

  it('spawns on a safe port when the default 8000 target is not a verified PolicyEval backend', async () => {
    const probeBackend = vi.fn().mockResolvedValue({
      kind: 'wrong-service',
      apiUrl: 'http://127.0.0.1:8000',
      reason: 'Backend /ready returned HTTP 404.',
      ready: false,
    });
    const findPort = vi.fn().mockResolvedValue(54321);

    await expect(resolveBackendDevStartup({ env: {}, probeBackend, findPort })).resolves.toEqual({
      mode: 'spawn',
      apiUrl: 'http://127.0.0.1:54321',
      port: 54321,
    });
  });

  it('injects the resolved backend URL consistently into the Electron runtime env', () => {
    expect(buildElectronRuntimeEnv('http://127.0.0.1:54321', { EXISTING: '1' })).toMatchObject({
      EXISTING: '1',
      POLICYEVAL_EXTERNAL_BACKEND: '1',
      POLICYEVAL_BACKEND_URL: 'http://127.0.0.1:54321',
      VITE_OCR_BACKEND_URL: 'http://127.0.0.1:54321',
    });
  });

  it('forces debug:full to bind Vite to 127.0.0.1', () => {
    expect(getDebugViteDevArgs()).toEqual(['run', 'dev', '--', '--host', '127.0.0.1']);
  });
});
