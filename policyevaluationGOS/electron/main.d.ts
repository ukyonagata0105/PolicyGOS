import type { BackendProbeResult } from '../src/lib/backendStartup.js';

export interface ElectronBackendConfig {
  apiUrl: string;
  ready: boolean;
  error: string | null;
  mismatchReason: string | null;
  probeKind: BackendProbeResult['kind'] | null;
  mode: 'external' | 'internal' | null;
}

export interface FormatBackendStartupErrorInput {
  mode: 'external' | 'internal';
  apiUrl: string;
  probe: BackendProbeResult | null;
  fallbackMessage: string;
}

export function formatBackendStartupError(input: FormatBackendStartupErrorInput): string;
export function startBackend(): Promise<ElectronBackendConfig>;
