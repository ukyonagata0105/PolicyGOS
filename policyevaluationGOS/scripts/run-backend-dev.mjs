import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { findFreeLocalhostPort, probeBackendTarget, waitForVerifiedBackend } from '../src/lib/backendStartup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '../../document_ocr_api');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_BACKEND_URL = `http://${DEFAULT_HOST}:8000`;
const preferredVenvPython =
  process.platform === 'win32'
    ? path.resolve(backendDir, 'venv312', 'Scripts', 'python.exe')
    : path.resolve(backendDir, 'venv312', 'bin', 'python');
const fallbackVenvPython =
  process.platform === 'win32'
    ? path.resolve(backendDir, 'venv', 'Scripts', 'python.exe')
    : path.resolve(backendDir, 'venv', 'bin', 'python');

export function getConfiguredBackendUrl(env = process.env) {
  return env.POLICYEVAL_BACKEND_URL || env.VITE_OCR_BACKEND_URL || env.VITE_YOMITOKU_API_URL || DEFAULT_BACKEND_URL;
}

function hasExplicitBackendOverride(env = process.env) {
  return Boolean(env.POLICYEVAL_BACKEND_URL || env.VITE_OCR_BACKEND_URL || env.VITE_YOMITOKU_API_URL);
}

function getPythonExecutable(env = process.env) {
  return env.PYTHON_EXECUTABLE || (env.USE_LEGACY_BACKEND_VENV === '1' ? fallbackVenvPython : preferredVenvPython);
}

function normalizeSpawnPort(value) {
  if (value === undefined) {
    return null;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid backend PORT override: ${value}`);
  }

  return port;
}

export async function resolveBackendDevStartup(options = {}) {
  const env = options.env ?? process.env;
  const configuredUrl = getConfiguredBackendUrl(env);
  const probeBackend = options.probeBackend ?? probeBackendTarget;
  const findPort = options.findPort ?? findFreeLocalhostPort;
  const configuredProbe = await probeBackend(configuredUrl);

  if (configuredProbe.kind === 'policyeval-backend') {
    return {
      mode: 'reuse',
      apiUrl: configuredProbe.apiUrl,
      port: null,
    };
  }

  if (hasExplicitBackendOverride(env)) {
    throw new Error(`Configured backend target ${configuredUrl} is not a ready PolicyEval backend: ${configuredProbe.reason ?? configuredProbe.kind}`);
  }

  const spawnPort = normalizeSpawnPort(env.PORT) ?? await findPort();
  const host = env.HOST || DEFAULT_HOST;

  return {
    mode: 'spawn',
    apiUrl: `http://${host}:${spawnPort}`,
    port: spawnPort,
  };
}

export async function startBackendDev(options = {}) {
  const env = options.env ?? process.env;
  const spawnImpl = options.spawnImpl ?? spawn;
  const waitForBackend = options.waitForBackend ?? waitForVerifiedBackend;
  const stdio = options.stdio ?? 'inherit';
  const resolvedStartup = await resolveBackendDevStartup(options);

  if (resolvedStartup.mode === 'reuse') {
    return {
      mode: 'reuse',
      apiUrl: resolvedStartup.apiUrl,
      child: null,
    };
  }

  const child = spawnImpl(getPythonExecutable(env), ['main.py'], {
    cwd: backendDir,
    stdio,
    shell: false,
    env: {
      ...env,
      PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK || 'True',
      HOST: env.HOST || DEFAULT_HOST,
      PORT: String(resolvedStartup.port),
      UVICORN_RELOAD: env.UVICORN_RELOAD || '0',
      OCR_PAGE_CONCURRENCY: env.OCR_PAGE_CONCURRENCY || '1',
    },
  });

  let exitError = null;
  child.on('error', (error) => {
    exitError = error.message;
  });
  child.on('exit', (code) => {
    exitError = `Backend exited with code ${code ?? 0}`;
  });

  const verifiedBackend = await waitForBackend(resolvedStartup.apiUrl, {
    timeoutMs: Number(env.BACKEND_STARTUP_TIMEOUT_MS || '90000'),
    getExitError: () => exitError,
  });

  return {
    mode: 'spawn',
    apiUrl: verifiedBackend.apiUrl,
    child,
  };
}

async function main() {
  const backend = await startBackendDev();
  console.log(backend.mode === 'reuse'
    ? `[backend:dev] Reusing verified backend at ${backend.apiUrl}`
    : `[backend:dev] Verified backend started at ${backend.apiUrl}`);

  if (!backend.child) {
    return;
  }

  await new Promise((resolve, reject) => {
    backend.child.on('exit', (code) => {
      if ((code ?? 0) === 0) {
        resolve();
        return;
      }
      reject(new Error(`Backend exited with code ${code ?? 0}`));
    });
    backend.child.on('error', reject);
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
