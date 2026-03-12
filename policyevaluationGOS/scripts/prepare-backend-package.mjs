import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '..');
const backendDir = path.resolve(repoRoot, 'document_ocr_api');
const resourcesDir = path.resolve(appDir, 'resources');
const packagedBackendDir = path.resolve(resourcesDir, 'backend');

const preferredPython =
  process.platform === 'win32'
    ? path.resolve(backendDir, 'venv312', 'Scripts', 'python.exe')
    : path.resolve(backendDir, 'venv312', 'bin', 'python');
const fallbackPython =
  process.platform === 'win32'
    ? path.resolve(backendDir, 'venv', 'Scripts', 'python.exe')
    : path.resolve(backendDir, 'venv', 'bin', 'python');
const pythonExecutable = process.env.PYTHON_EXECUTABLE
  || (existsSync(preferredPython) ? preferredPython : fallbackPython);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}`);
  }
}

function resolveRealFile(filePath) {
  let currentPath = filePath;

  while (existsSync(currentPath) && lstatSync(currentPath).isSymbolicLink()) {
    const nextPath = readlinkSync(currentPath);
    currentPath = path.isAbsolute(nextPath)
      ? nextPath
      : path.resolve(path.dirname(currentPath), nextPath);
  }

  return currentPath;
}

if (!existsSync(pythonExecutable)) {
  throw new Error(`Python executable not found: ${pythonExecutable}`);
}

run(pythonExecutable, ['-m', 'pip', 'install', 'pyinstaller'], backendDir);
run(pythonExecutable, ['build_backend.py'], backendDir);

const builtBackendDir = path.resolve(backendDir, 'dist', 'backend');
if (!existsSync(builtBackendDir)) {
  throw new Error(`Built backend directory not found: ${builtBackendDir}`);
}

const conflictingLibraries = [
  path.resolve(builtBackendDir, '_internal', 'cv2', '.dylibs', 'libcrypto.3.dylib'),
  path.resolve(builtBackendDir, '_internal', 'cv2', '.dylibs', 'libssl.3.dylib'),
];

for (const libraryPath of conflictingLibraries) {
  if (existsSync(libraryPath)) {
    rmSync(libraryPath, { force: true });
    console.log(`Removed conflicting bundled library: ${libraryPath}`);
  }
}

const internalDir = path.resolve(builtBackendDir, '_internal');
const pythonLibDir = path.resolve(internalDir, 'python3.12');
mkdirSync(pythonLibDir, { recursive: true });

for (const libraryName of ['libcrypto.3.dylib', 'libssl.3.dylib']) {
  const bundledPath = path.resolve(internalDir, libraryName);
  const homebrewPath = path.resolve('/opt/homebrew/lib', libraryName);
  const sourcePath = existsSync(homebrewPath) ? homebrewPath : bundledPath;

  if (!existsSync(sourcePath)) {
    continue;
  }

  const realSourcePath = resolveRealFile(sourcePath);

  for (const targetPath of [bundledPath, path.resolve(pythonLibDir, libraryName)]) {
    rmSync(targetPath, { force: true });
    copyFileSync(realSourcePath, targetPath);
    console.log(`Placed OpenSSL runtime: ${targetPath}`);
  }
}

mkdirSync(resourcesDir, { recursive: true });
rmSync(packagedBackendDir, { recursive: true, force: true });
cpSync(builtBackendDir, packagedBackendDir, { recursive: true });

console.log(`Prepared packaged backend at ${packagedBackendDir}`);
