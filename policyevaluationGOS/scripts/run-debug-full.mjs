import net from 'node:net';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { startBackendDev } from './run-backend-dev.mjs';
import { buildElectronRuntimeEnv } from './run-electron-external-backend.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nodeCommand = process.execPath;
const VITE_HOST = '127.0.0.1';

export function getDebugViteDevArgs() {
  return ['run', 'dev', '--', '--host', VITE_HOST];
}

function waitForTcpPort(port, options = {}) {
  const host = options.host ?? '127.0.0.1';
  const timeoutMs = options.timeoutMs ?? 90000;
  const intervalMs = options.intervalMs ?? 500;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect({ host, port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(tryConnect, intervalMs);
      });
    };

    tryConnect();
  });
}

function terminateChild(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/f', '/t']);
    return;
  }

  child.kill('SIGTERM');
}

async function main() {
  const backend = await startBackendDev();
  const runtimeEnv = buildElectronRuntimeEnv(backend.apiUrl, {
    ...process.env,
    VITE_OCR_BACKEND_URL: backend.apiUrl,
  });
  const managedChildren = [];

  if (backend.child) {
    managedChildren.push(backend.child);
  }

  const cleanup = () => {
    for (const child of managedChildren) {
      terminateChild(child);
    }
  };

  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('exit', cleanup);

  const viteProcess = spawn(npmCommand, getDebugViteDevArgs(), {
    cwd: appDir,
    stdio: 'inherit',
    shell: false,
    env: runtimeEnv,
  });
  managedChildren.push(viteProcess);

  let viteExited = false;
  viteProcess.once('exit', (code) => {
    viteExited = true;
    if ((code ?? 0) !== 0) {
      cleanup();
      process.exit(code ?? 1);
    }
  });
  viteProcess.once('error', (error) => {
    cleanup();
    console.error(error.message);
    process.exit(1);
  });

  await waitForTcpPort(5173, {
    timeoutMs: Number(process.env.VITE_STARTUP_TIMEOUT_MS || '90000'),
    intervalMs: 500,
  });

  if (viteExited) {
    throw new Error('Vite dev server exited before Electron launch.');
  }

  const electronProcess = spawn(nodeCommand, [path.join(__dirname, 'run-electron-external-backend.mjs')], {
    cwd: appDir,
    stdio: 'inherit',
    shell: false,
    env: runtimeEnv,
  });
  managedChildren.push(electronProcess);

  electronProcess.once('exit', (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
  electronProcess.once('error', (error) => {
    cleanup();
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
