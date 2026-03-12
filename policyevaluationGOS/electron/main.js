import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

import { findFreeLocalhostPort, probeBackendTarget, waitForVerifiedBackend } from '../src/lib/backendStartup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';
const DEFAULT_DEV_PYTHON =
    process.platform === 'win32'
        ? path.join(__dirname, '../../document_ocr_api/venv312/Scripts/python.exe')
        : path.join(__dirname, '../../document_ocr_api/venv312/bin/python');
const LEGACY_DEV_PYTHON =
    process.platform === 'win32'
        ? path.join(__dirname, '../../document_ocr_api/venv/Scripts/python.exe')
        : path.join(__dirname, '../../document_ocr_api/venv/bin/python');
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE || (process.env.USE_LEGACY_BACKEND_VENV === '1' ? LEGACY_DEV_PYTHON : DEFAULT_DEV_PYTHON);
const BACKEND_STARTUP_TIMEOUT_MS = Number(process.env.BACKEND_STARTUP_TIMEOUT_MS || '90000');

let mainWindow;
let backendProcess = null;

function createBackendConfig(apiUrl, mode) {
    return {
        apiUrl,
        ready: false,
        error: null,
        mismatchReason: null,
        probeKind: null,
        mode,
    };
}

let backendConfig = createBackendConfig(DEFAULT_BACKEND_URL, 'internal');

function isExternalBackendEnabled() {
    return process.env.POLICYEVAL_EXTERNAL_BACKEND === '1';
}

function getConfiguredBackendUrl() {
    return process.env.POLICYEVAL_BACKEND_URL || process.env.VITE_OCR_BACKEND_URL || process.env.VITE_YOMITOKU_API_URL || DEFAULT_BACKEND_URL;
}

function buildProbeStatusSuffix(probe) {
    const details = [];

    if (probe?.readyStatus) {
        details.push(`ready=${probe.readyStatus}`);
    }

    if (probe?.healthStatus) {
        details.push(`health=${probe.healthStatus}`);
    }

    return details.length > 0 ? ` (${details.join(', ')})` : '';
}

export function formatBackendStartupError({ mode, apiUrl, probe, fallbackMessage }) {
    const targetLabel = mode === 'external' ? 'Configured backend target' : 'Started backend target';
    const nextStep = mode === 'external'
        ? 'Update POLICYEVAL_BACKEND_URL or start the PolicyEval OCR backend at that address.'
        : 'Inspect the backend logs above and restart Electron after the PolicyEval OCR backend is ready.';

    if (probe?.kind === 'wrong-service') {
        return `${targetLabel} ${apiUrl} is not a compatible PolicyEval OCR backend. ${probe.reason || 'Backend identity check failed.'} ${nextStep}`;
    }

    if (probe?.kind === 'degraded') {
        return `${targetLabel} ${apiUrl} matched the PolicyEval OCR contract but is not fully ready.${buildProbeStatusSuffix(probe)} ${probe.reason || fallbackMessage || 'Backend startup is incomplete.'} ${nextStep}`;
    }

    if (probe?.kind === 'unreachable') {
        return `${targetLabel} ${apiUrl} could not be reached. ${probe.reason || fallbackMessage || 'Backend is unavailable.'} ${nextStep}`;
    }

    return `${targetLabel} ${apiUrl} failed to initialize. ${fallbackMessage || 'Backend startup failed.'} ${nextStep}`;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const isDev = !app.isPackaged;

    if (isDev) {
        // In development mode, load from the Vite dev server
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // In production mode, load the built HTML file
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
}

export async function startBackend() {
    const isDev = !app.isPackaged;
    const useExternalBackend = isExternalBackendEnabled();
    const mode = useExternalBackend ? 'external' : 'internal';
    const port = useExternalBackend ? null : await findFreeLocalhostPort();
    backendConfig = createBackendConfig(useExternalBackend ? getConfiguredBackendUrl() : `http://127.0.0.1:${port}`, mode);
    let lastProbe = null;

    if (useExternalBackend) {
        console.log(`Using externally managed backend: ${backendConfig.apiUrl}`);
        const probe = await probeBackendTarget(backendConfig.apiUrl, {
            timeoutMs: BACKEND_STARTUP_TIMEOUT_MS,
        });

        lastProbe = probe;
        backendConfig.probeKind = probe.kind;
        backendConfig.mismatchReason = probe.reason;

        if (probe.kind === 'policyeval-backend') {
            backendConfig.apiUrl = probe.apiUrl;
            backendConfig.ready = true;
            backendConfig.error = null;
            backendConfig.mismatchReason = null;
            return backendConfig;
        }

        backendConfig.apiUrl = probe.apiUrl;
        backendConfig.error = formatBackendStartupError({
            mode,
            apiUrl: probe.apiUrl,
            probe,
            fallbackMessage: probe.reason || 'Backend startup failed',
        });
        console.error(`[Backend startup failed]: ${backendConfig.error}`);
        return backendConfig;
    } else if (isDev) {
        // In dev, assuming the document_ocr_api directory is adjacent to policyevaluationGOS
        const apiPath = path.join(__dirname, '../../document_ocr_api');
        console.log(`Starting backend from: ${apiPath}`);
        backendProcess = spawn(PYTHON_EXECUTABLE, ['main.py'], {
            cwd: apiPath,
            shell: false,
            env: {
                ...process.env,
                PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK || 'True',
                HOST: '127.0.0.1',
                PORT: String(port),
                UVICORN_RELOAD: '0',
                OCR_PAGE_CONCURRENCY: process.env.OCR_PAGE_CONCURRENCY || '1',
            },
        });
    } else {
        // In production, run the packaged executable
        // The executable is expected to be placed in the resources/backend folder
        const exeName = process.platform === 'win32' ? 'backend.exe' : 'backend';
        const exePath = path.join(process.resourcesPath, 'resources', 'backend', exeName);
        const exeDir = path.dirname(exePath);
        console.log(`Starting backend executable from: ${exePath}`);
        backendProcess = spawn(exePath, [], {
            cwd: exeDir,
            shell: false,
            env: {
                ...process.env,
                PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: process.env.PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK || 'True',
                HOST: '127.0.0.1',
                PORT: String(port),
                OCR_PAGE_CONCURRENCY: process.env.OCR_PAGE_CONCURRENCY || '1',
            },
        });
    }

    if (backendProcess) {
        backendProcess.stdout.on('data', (data) => {
            console.log(`[Backend]: ${data}`);
        });

        backendProcess.stderr.on('data', (data) => {
            console.error(`[Backend API Error]: ${data}`);
        });

        backendProcess.on('error', (error) => {
            backendConfig.error = error.message;
            console.error(`[Backend process error]: ${error.message}`);
        });

        backendProcess.on('close', (code) => {
            console.log(`Backend process exited with code ${code}`);
            if (!backendConfig.ready) {
                backendConfig.error = `Backend exited with code ${code}`;
            }
        });
    }

    try {
        const verifiedBackend = await waitForVerifiedBackend(backendConfig.apiUrl, {
            timeoutMs: BACKEND_STARTUP_TIMEOUT_MS,
            onProbe: (probe) => {
                lastProbe = probe;
            },
            getExitError: () => {
                if (backendProcess && backendProcess.exitCode !== null) {
                    return `Backend exited with code ${backendProcess.exitCode}`;
                }

                return null;
            },
        });
        backendConfig.apiUrl = verifiedBackend.apiUrl;
        backendConfig.ready = true;
        backendConfig.probeKind = verifiedBackend.kind;
        backendConfig.mismatchReason = null;
    } catch (error) {
        backendConfig.ready = false;
        backendConfig.probeKind = lastProbe?.kind || null;
        backendConfig.mismatchReason = lastProbe?.reason || (error instanceof Error ? error.message : 'Backend startup failed');
        backendConfig.error = formatBackendStartupError({
            mode,
            apiUrl: backendConfig.apiUrl,
            probe: lastProbe,
            fallbackMessage: error instanceof Error ? error.message : 'Backend startup failed',
        });
        console.error(`[Backend startup failed]: ${backendConfig.error}`);
    }

    return backendConfig;
}

ipcMain.handle('backend:get-config', async () => backendConfig);

app.whenReady().then(async () => {
    await startBackend();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    // Kill the backend process when the app closes
    if (backendProcess !== null) {
        console.log('Killing backend process...');
        // On Windows, you might need taskkill to force kill child processes if spawn generated a tree
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
        } else {
            backendProcess.kill();
        }
    }
});
