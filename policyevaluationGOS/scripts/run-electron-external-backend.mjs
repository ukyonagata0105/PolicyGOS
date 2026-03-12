import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { probeBackendTarget } from '../src/lib/backendStartup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const electronCommand = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';

export function getConfiguredExternalBackendUrl(env = process.env) {
  return env.POLICYEVAL_BACKEND_URL || env.VITE_OCR_BACKEND_URL || env.VITE_YOMITOKU_API_URL || DEFAULT_BACKEND_URL;
}

export async function resolveExternalBackendUrl(options = {}) {
  const env = options.env ?? process.env;
  const probeBackend = options.probeBackend ?? probeBackendTarget;
  const configuredUrl = getConfiguredExternalBackendUrl(env);
  const probe = await probeBackend(configuredUrl);

  if (probe.kind !== 'policyeval-backend') {
    throw new Error(`Configured external backend ${configuredUrl} is not a ready PolicyEval backend: ${probe.reason ?? probe.kind}`);
  }

  return probe.apiUrl;
}

export function buildElectronRuntimeEnv(apiUrl, env = process.env) {
  return {
    ...env,
    POLICYEVAL_EXTERNAL_BACKEND: '1',
    POLICYEVAL_BACKEND_URL: apiUrl,
    VITE_OCR_BACKEND_URL: apiUrl,
  };
}

async function main() {
  const resolvedApiUrl = await resolveExternalBackendUrl();

  const child = spawn(electronCommand, ['.'], {
    cwd: appDir,
    stdio: 'inherit',
    shell: false,
    env: buildElectronRuntimeEnv(resolvedApiUrl),
  });

  child.on('exit', code => {
    process.exit(code ?? 0);
  });

  child.on('error', error => {
    console.error(error.message);
    process.exit(1);
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
