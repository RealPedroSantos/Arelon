import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CONFIG_API_PORT = Number.parseInt(process.env.CONFIG_API_PORT ?? '8788', 10);
const CONFIG_DATA_DIR = process.env.CONFIG_DATA_DIR ?? path.resolve(process.cwd(), 'data');
const CONFIG_FILE_PATH = path.join(CONFIG_DATA_DIR, 'shared-admin-config.json');
const BODY_LIMIT_BYTES = 1024 * 1024;

const DEFAULT_SETTINGS = {
  streamTimeoutMs: 15000,
  maxRetryCount: 2,
  retryBackoffMs: 1200,
};

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function isStringRecord(value) {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

function isTestAccount(testAccount) {
  if (!isRecord(testAccount)) {
    return false;
  }

  return typeof testAccount.username === 'string' && typeof testAccount.password === 'string';
}

function isServer(server) {
  if (!isRecord(server)) {
    return false;
  }

  if (!['xtream', 'm3u', 'manifest'].includes(server.type)) {
    return false;
  }

  if (server.parameters !== undefined) {
    if (!isRecord(server.parameters)) {
      return false;
    }

    if (server.parameters.playlistUrl !== undefined && typeof server.parameters.playlistUrl !== 'string') {
      return false;
    }

    if (server.parameters.manifestUrl !== undefined && typeof server.parameters.manifestUrl !== 'string') {
      return false;
    }

    if (
      server.parameters.defaultOutput !== undefined &&
      !['ts', 'm3u8'].includes(server.parameters.defaultOutput)
    ) {
      return false;
    }

    if (server.parameters.headers !== undefined && !isStringRecord(server.parameters.headers)) {
      return false;
    }
  }

  return (
    typeof server.id === 'string' &&
    typeof server.name === 'string' &&
    typeof server.baseUrl === 'string' &&
    typeof server.isActive === 'boolean' &&
    typeof server.createdAt === 'string' &&
    typeof server.updatedAt === 'string'
  );
}

function toPlayerSettings(raw) {
  if (!isRecord(raw)) {
    return DEFAULT_SETTINGS;
  }

  const { streamTimeoutMs, maxRetryCount, retryBackoffMs } = raw;
  if (
    typeof streamTimeoutMs !== 'number' ||
    !Number.isFinite(streamTimeoutMs) ||
    typeof maxRetryCount !== 'number' ||
    !Number.isFinite(maxRetryCount) ||
    typeof retryBackoffMs !== 'number' ||
    !Number.isFinite(retryBackoffMs)
  ) {
    return DEFAULT_SETTINGS;
  }

  return {
    streamTimeoutMs,
    maxRetryCount,
    retryBackoffMs,
  };
}

function getDefaultPayload() {
  return {
    servers: [],
    activeServerId: undefined,
    playerSettings: DEFAULT_SETTINGS,
    testAccount: {
      username: '',
      password: '',
    },
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizePayload(raw) {
  if (!isRecord(raw)) {
    return null;
  }

  if (!Array.isArray(raw.servers) || !raw.servers.every(isServer)) {
    return null;
  }

  const activeServerId = typeof raw.activeServerId === 'string' ? raw.activeServerId : undefined;
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString();
  const testAccount = isTestAccount(raw.testAccount) ? raw.testAccount : { username: '', password: '' };

  return {
    servers: raw.servers,
    activeServerId,
    playerSettings: toPlayerSettings(raw.playerSettings),
    testAccount,
    updatedAt,
  };
}

async function ensureConfigFile() {
  await mkdir(CONFIG_DATA_DIR, { recursive: true });

  try {
    await readFile(CONFIG_FILE_PATH, 'utf8');
  } catch {
    const initial = JSON.stringify(getDefaultPayload(), null, 2);
    await writeFile(CONFIG_FILE_PATH, initial, 'utf8');
  }
}

async function readPayload() {
  try {
    const raw = await readFile(CONFIG_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const payload = normalizePayload(parsed);
    if (payload) {
      return payload;
    }
  } catch {
    // Fallback for invalid/corrupted file.
  }

  const fallback = getDefaultPayload();
  await writePayload(fallback);
  return fallback;
}

async function writePayload(payload) {
  await mkdir(CONFIG_DATA_DIR, { recursive: true });
  await writeFile(CONFIG_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  setCorsHeaders(res);
  res.statusCode = 204;
  res.end();
}

async function readRequestBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'OPTIONS') {
    sendNoContent(res);
    return;
  }

  if (requestUrl.pathname === '/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname !== '/api/admin/shared-config') {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  if (req.method === 'GET') {
    const payload = await readPayload();
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === 'PUT') {
    try {
      const body = await readRequestBody(req);
      const parsed = JSON.parse(body);
      const normalized = normalizePayload(parsed);
      if (!normalized) {
        sendJson(res, 400, { error: 'Invalid payload.' });
        return;
      }

      const next = {
        ...normalized,
        updatedAt: new Date().toISOString(),
      };

      await writePayload(next);
      sendJson(res, 200, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request body.';
      sendJson(res, 400, { error: message });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});

await ensureConfigFile();

server.listen(CONFIG_API_PORT, '0.0.0.0', () => {
  console.log(`Shared config API listening on 0.0.0.0:${CONFIG_API_PORT}`);
  console.log(`Shared config file: ${CONFIG_FILE_PATH}`);
});
