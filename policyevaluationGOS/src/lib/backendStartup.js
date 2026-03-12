import net from 'node:net';

const FIVE_DIGIT_PORT_MIN = 10000;
const FIVE_DIGIT_PORT_MAX = 65535;

function normalizeBackendUrl(apiUrl) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const { controller, timeoutId } = createTimeoutController(timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      statusText: null,
      body: null,
      error,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function hasValidReadyContract(body) {
  return Boolean(
    body
      && typeof body === 'object'
      && typeof body.ready === 'boolean'
      && typeof body.status === 'string'
  );
}

function hasValidHealthContract(body) {
  return Boolean(
    body
      && typeof body === 'object'
      && (body.status === 'healthy' || body.status === 'degraded')
      && typeof body.version === 'string'
      && typeof body.device === 'string'
      && (typeof body.ocr_backend_available === 'boolean' || typeof body.yomitoku_available === 'boolean')
  );
}

function hasRepairRoute(body) {
  if (!body || typeof body !== 'object' || !body.paths || typeof body.paths !== 'object') {
    return false;
  }

  const repairPath = body.paths['/repair/opencode'];
  return Boolean(repairPath && typeof repairPath === 'object' && repairPath.post && typeof repairPath.post === 'object');
}

function buildProbeResult(kind, apiUrl, reason, details = {}) {
  return {
    kind,
    apiUrl,
    reason,
    ready: kind === 'policyeval-backend',
    ...details,
  };
}

export async function probeBackendTarget(apiUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 3000;
  const normalizedUrl = normalizeBackendUrl(apiUrl);

  const readyResponse = await fetchJson(fetchImpl, `${normalizedUrl}/ready`, timeoutMs);
  if (readyResponse.error) {
    return buildProbeResult('unreachable', normalizedUrl, 'Could not reach backend /ready endpoint.');
  }
  if (!readyResponse.ok) {
    return buildProbeResult('wrong-service', normalizedUrl, `Backend /ready returned HTTP ${readyResponse.status}.`);
  }
  if (!hasValidReadyContract(readyResponse.body)) {
    return buildProbeResult('wrong-service', normalizedUrl, 'Backend /ready response does not match the PolicyEval contract.');
  }

  const healthResponse = await fetchJson(fetchImpl, `${normalizedUrl}/health`, timeoutMs);
  if (healthResponse.error) {
    return buildProbeResult('unreachable', normalizedUrl, 'Could not reach backend /health endpoint.', {
      readyStatus: readyResponse.body.status,
    });
  }
  if (!healthResponse.ok) {
    return buildProbeResult('wrong-service', normalizedUrl, `Backend /health returned HTTP ${healthResponse.status}.`, {
      readyStatus: readyResponse.body.status,
    });
  }
  if (!hasValidHealthContract(healthResponse.body)) {
    return buildProbeResult('wrong-service', normalizedUrl, 'Backend /health response does not match the PolicyEval contract.', {
      readyStatus: readyResponse.body.status,
    });
  }

  const openApiResponse = await fetchJson(fetchImpl, `${normalizedUrl}/openapi.json`, timeoutMs);
  if (openApiResponse.error) {
    return buildProbeResult('unreachable', normalizedUrl, 'Could not reach backend OpenAPI schema.', {
      readyStatus: readyResponse.body.status,
      healthStatus: healthResponse.body.status,
    });
  }
  if (!openApiResponse.ok) {
    return buildProbeResult('wrong-service', normalizedUrl, `Backend OpenAPI schema returned HTTP ${openApiResponse.status}.`, {
      readyStatus: readyResponse.body.status,
      healthStatus: healthResponse.body.status,
    });
  }
  if (!hasRepairRoute(openApiResponse.body)) {
    return buildProbeResult('wrong-service', normalizedUrl, 'Backend OpenAPI schema is missing /repair/opencode.', {
      readyStatus: readyResponse.body.status,
      healthStatus: healthResponse.body.status,
    });
  }

  if (!readyResponse.body.ready || healthResponse.body.status !== 'healthy') {
    return buildProbeResult('degraded', normalizedUrl, 'Backend contract matched but service is not fully ready.', {
      readyStatus: readyResponse.body.status,
      healthStatus: healthResponse.body.status,
    });
  }

  return buildProbeResult('policyeval-backend', normalizedUrl, null, {
    readyStatus: readyResponse.body.status,
    healthStatus: healthResponse.body.status,
  });
}

export async function waitForVerifiedBackend(apiUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 90000;
  const intervalMs = options.intervalMs ?? 500;
  const startedAt = Date.now();
  let lastProbe = null;

  while (Date.now() - startedAt < timeoutMs) {
    const exitError = options.getExitError?.();
    if (exitError) {
      throw new Error(exitError);
    }

    const probe = await probeBackendTarget(apiUrl, options);
    lastProbe = probe;
    options.onProbe?.(probe);

    if (probe.kind === 'policyeval-backend') {
      return probe;
    }

    if (probe.kind === 'wrong-service') {
      throw new Error(probe.reason ?? 'Target is not a PolicyEval backend.');
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastProbe?.reason) {
    throw new Error(`Timed out waiting for verified backend startup: ${lastProbe.reason}`);
  }

  throw new Error('Timed out waiting for verified backend startup');
}

export async function findFreeLocalhostPort(options = {}) {
  const attempts = options.attempts ?? 25;
  const randomInt = options.randomInt ?? ((min, max) => Math.floor(Math.random() * (max - min + 1)) + min);

  for (let index = 0; index < attempts; index += 1) {
    const candidatePort = randomInt(FIVE_DIGIT_PORT_MIN, FIVE_DIGIT_PORT_MAX);

    const isFree = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once('error', (error) => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
          resolve(false);
          return;
        }
        reject(error);
      });
      server.listen(candidatePort, '127.0.0.1', () => {
        server.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }
          resolve(true);
        });
      });
    });

    if (isFree) {
      return candidatePort;
    }
  }

  throw new Error('Could not find a free 5-digit localhost port.');
}
