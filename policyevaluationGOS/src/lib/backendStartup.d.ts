export type BackendProbeKind = 'policyeval-backend' | 'wrong-service' | 'unreachable' | 'degraded';

export interface BackendProbeResult {
  kind: BackendProbeKind;
  apiUrl: string;
  reason: string | null;
  ready: boolean;
  readyStatus?: string;
  healthStatus?: string;
}

export interface BackendProbeOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface WaitForVerifiedBackendOptions extends BackendProbeOptions {
  intervalMs?: number;
  getExitError?: () => string | null;
  onProbe?: (probe: BackendProbeResult) => void;
}

export interface FindFreeLocalhostPortOptions {
  attempts?: number;
  randomInt?: (min: number, max: number) => number;
}

export function probeBackendTarget(apiUrl: string, options?: BackendProbeOptions): Promise<BackendProbeResult>;
export function waitForVerifiedBackend(apiUrl: string, options?: WaitForVerifiedBackendOptions): Promise<BackendProbeResult>;
export function findFreeLocalhostPort(options?: FindFreeLocalhostPortOptions): Promise<number>;
