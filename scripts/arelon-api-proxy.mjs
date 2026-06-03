import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const DEFAULT_SERVER_URLS = [
  'http://fravub.online',
  'http://mxcdnr.xyz:80',
  'http://glimen.online',
  'http://resfcdn.online:80',
  'http://ultraviracdn.online:80',
  'http://purolab.online:80',
];

const API_PORT = Number.parseInt(process.env.ARELON_API_PORT ?? '8789', 10);
const CACHE_TTL_SECONDS = Math.max(1, Number.parseInt(process.env.XTREAM_CACHE_TTL_SECONDS ?? '300', 10));
const DEFAULT_TIMEOUT_MS = Math.max(1000, Number.parseInt(process.env.XTREAM_UPSTREAM_TIMEOUT_MS ?? '12000', 10));
const BODY_LIMIT_BYTES = 128 * 1024;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const configuredServers = (process.env.XTREAM_ALLOWED_SERVERS ?? DEFAULT_SERVER_URLS.join(','))
  .split(',')
  .map((entry) => normalizeServerUrl(entry))
  .filter(Boolean);

const ALLOWED_SERVER_URLS = [...new Set(configuredServers.length > 0 ? configuredServers : DEFAULT_SERVER_URLS.map(normalizeServerUrl))];
const cache = new Map();

class ApiError extends Error {
  constructor(type, message, statusCode = 500, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function normalizeServerUrl(input) {
  const trimmed = String(input ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    const port = url.port ? `:${url.port}` : '';
    return `${url.protocol}//${url.hostname}${port}`;
  } catch {
    return '';
  }
}

function baseUrl(input) {
  return normalizeServerUrl(input).replace(/\/+$/, '');
}

function ensureAllowedServer(serverUrl) {
  const normalized = normalizeServerUrl(serverUrl);
  if (!normalized || !ALLOWED_SERVER_URLS.includes(normalized)) {
    throw new ApiError('unknown_error', 'Servidor IPTV nao permitido pela API Arelon.', 400);
  }
  return normalized;
}

function credentialHash(username, password) {
  return createHash('sha256').update(`${username}\0${password}`).digest('hex').slice(0, 32);
}

function cacheKey(parts) {
  return parts.map((part) => String(part ?? '')).join('|');
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value, ttlSeconds = CACHE_TTL_SECONDS) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

async function withCache(key, loader, ttlSeconds = CACHE_TTL_SECONDS) {
  const cached = getCached(key);
  if (cached !== null) return cached;
  const value = await loader();
  setCached(key, value, ttlSeconds);
  return value;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendOk(res, data) {
  sendJson(res, 200, { ok: true, data });
}

function sendList(res, page, limit, total, items) {
  sendJson(res, 200, {
    ok: true,
    page,
    limit,
    total,
    hasMore: page * limit < total,
    items,
  });
}

function sendError(res, error) {
  const apiError = toApiError(error);
  sendJson(res, apiError.statusCode, {
    ok: false,
    type: apiError.type,
    message: apiError.message,
  });
}

function toApiError(error) {
  if (error instanceof ApiError) return error;

  if (error?.name === 'AbortError') {
    return new ApiError('timeout', 'Tempo esgotado ao consultar o servidor IPTV.', 504);
  }

  if (error instanceof SyntaxError) {
    return new ApiError('invalid_json', 'Servidor IPTV retornou JSON invalido.', 502);
  }

  return new ApiError('unknown_error', 'Erro inesperado na API Arelon.', 500);
}

async function readRequestBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        reject(new ApiError('unknown_error', 'Payload muito grande.', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ApiError('invalid_json', 'Corpo da requisicao nao e JSON valido.', 400));
      }
    });

    req.on('error', reject);
  });
}

function requireCredentials(body) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !password.trim()) {
    throw new ApiError('invalid_credentials', 'Informe usuario e senha IPTV.', 401);
  }

  return { username, password: password.trim() };
}

function normalizePageOptions(body) {
  const pageNumber = Number.parseInt(String(body.page ?? DEFAULT_PAGE), 10);
  const limitNumber = Number.parseInt(String(body.limit ?? DEFAULT_LIMIT), 10);
  const page = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : DEFAULT_PAGE;
  const limit = Number.isFinite(limitNumber) && limitNumber > 0 ? Math.min(limitNumber, MAX_LIMIT) : DEFAULT_LIMIT;
  const categoryId = typeof body.categoryId === 'string' && body.categoryId.trim() ? body.categoryId.trim() : undefined;
  const search = typeof body.search === 'string' && body.search.trim() ? body.search.trim() : undefined;
  const type = typeof body.type === 'string' && body.type.trim() ? body.type.trim() : undefined;

  return { page, limit, categoryId, search, type };
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function paginateItems(items, options) {
  const search = normalizeText(options.search);
  const filtered = search
    ? items.filter((item) => normalizeText(item.name ?? item.title ?? '').includes(search))
    : items;
  const start = (options.page - 1) * options.limit;
  const end = start + options.limit;

  return {
    page: options.page,
    limit: options.limit,
    total: filtered.length,
    items: filtered.slice(start, end),
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'Arelon-IPTV-Proxy/1.0',
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new ApiError(
        'upstream_http_error',
        `Servidor IPTV respondeu HTTP ${res.status}.`,
        502,
        { upstreamStatus: res.status },
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError('invalid_json', 'Servidor IPTV retornou JSON invalido.', 502);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') {
      throw new ApiError('timeout', 'Tempo esgotado ao consultar o servidor IPTV.', 504);
    }
    throw new ApiError('network_error', 'Falha de rede ao consultar o servidor IPTV.', 502);
  } finally {
    clearTimeout(timer);
  }
}

function xtreamUrl(serverUrl, username, password, action, params = {}) {
  const url = new URL(`${baseUrl(serverUrl)}/player_api.php`);
  url.searchParams.set('username', username);
  url.searchParams.set('password', password);
  if (action) url.searchParams.set('action', action);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function fetchXtream(serverUrl, credentials, action, params = {}) {
  return await fetchJsonWithTimeout(xtreamUrl(serverUrl, credentials.username, credentials.password, action, params));
}

function streamUrl(serverUrl, username, password, kind, id, ext = '') {
  const u = encodeURIComponent(username);
  const p = encodeURIComponent(password);
  const cleanExt = ext ? `.${String(ext).replace(/^\./, '')}` : '';
  return `${baseUrl(serverUrl)}/${kind}/${u}/${p}/${id}${cleanExt}`;
}

function sanitizeExt(ext, fallback = 'mp4') {
  const cleaned = String(ext ?? '').replace(/^\./, '').replace(/[^a-z0-9]/gi, '');
  return cleaned || fallback;
}

function cleanCategory(raw) {
  const id = String(raw?.category_id ?? '').trim();
  const name = String(raw?.category_name ?? '').trim();
  if (!id || !name) return null;
  return { id, name };
}

function qualityFromName(name) {
  const match = String(name ?? '').match(/\b(4K|FHD|HD|SD|1080p|720p)\b/i);
  if (!match?.[1]) return 'DEFAULT';
  const quality = match[1].toUpperCase();
  if (quality === '1080P') return 'FHD';
  if (quality === '720P') return 'HD';
  return quality;
}

function cleanLiveName(name) {
  const rawName = String(name ?? '').trim();
  return rawName
    .replace(/\b(4K|FHD|HD|SD|1080p|720p)\b/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\|.*?\|/g, '')
    .replace(/[-|]/g, '')
    .trim()
    .replace(/\s+/g, ' ') || rawName;
}

function groupLiveStreams(raw, serverUrl, credentials) {
  const grouped = new Map();
  const qualityPriority = { DEFAULT: 0, SD: 1, HD: 2, FHD: 3, '4K': 4 };

  for (const entry of Array.isArray(raw) ? raw : []) {
    const streamId = String(entry?.stream_id ?? '').trim();
    if (!streamId) continue;

    const rawName = String(entry?.name ?? '').trim();
    if (!rawName) continue;

    const displayName = cleanLiveName(rawName);
    const quality = qualityFromName(rawName);
    const key = normalizeText(displayName);
    const url = streamUrl(serverUrl, credentials.username, credentials.password, 'live', streamId, 'm3u8');
    const logoCdn = String(entry?.logo_cdn ?? '').trim();
    const logoPlaylist = String(entry?.stream_icon ?? '').trim();
    const logoPlaceholder = String(entry?.logo_placeholder ?? '').trim();

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: streamId,
        name: displayName,
        logo: logoCdn || logoPlaylist,
        logoCdn,
        logoPlaylist,
        logoPlaceholder,
        categoryId: String(entry?.category_id ?? ''),
        streamUrl: url,
        streams: { [quality]: url },
      });
      continue;
    }

    const existing = grouped.get(key);
    const currentTop = Object.keys(existing.streams ?? {})
      .sort((a, b) => (qualityPriority[b] ?? 0) - (qualityPriority[a] ?? 0))[0] ?? 'DEFAULT';

    if ((qualityPriority[quality] ?? 0) > (qualityPriority[currentTop] ?? 0)) {
      existing.id = streamId;
      existing.streamUrl = url;
    }

    existing.streams = existing.streams ?? {};
    existing.streams[quality] = url;
    if (!existing.logoCdn && logoCdn) {
      existing.logoCdn = logoCdn;
      existing.logo = logoCdn;
    }
    if (!existing.logoPlaylist && logoPlaylist) existing.logoPlaylist = logoPlaylist;
    if (!existing.logoPlaceholder && logoPlaceholder) existing.logoPlaceholder = logoPlaceholder;
  }

  return [...grouped.values()];
}

function cleanVodStreams(raw, serverUrl, credentials) {
  return (Array.isArray(raw) ? raw : [])
    .map((entry) => {
      const id = String(entry?.stream_id ?? '').trim();
      const name = String(entry?.name ?? '').trim();
      if (!id || !name) return null;
      const ext = sanitizeExt(entry?.container_extension);

      return {
        id,
        name,
        poster: String(entry?.stream_icon ?? ''),
        categoryId: String(entry?.category_id ?? ''),
        streamUrl: streamUrl(serverUrl, credentials.username, credentials.password, 'movie', id, ext),
        ext,
        plot: entry?.plot ? String(entry.plot) : undefined,
        year: entry?.year ? String(entry.year) : undefined,
        rating: entry?.rating ? String(entry.rating) : undefined,
      };
    })
    .filter(Boolean);
}

function cleanSeries(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((entry) => {
      const id = String(entry?.series_id ?? '').trim();
      const name = String(entry?.name ?? '').trim();
      if (!id || !name) return null;

      return {
        id,
        name,
        cover: String(entry?.cover ?? ''),
        categoryId: String(entry?.category_id ?? ''),
        plot: entry?.plot ? String(entry.plot) : undefined,
        year: entry?.year ? String(entry.year) : undefined,
        rating: entry?.rating ? String(entry.rating) : undefined,
      };
    })
    .filter(Boolean);
}

function cleanInfo(rawInfo) {
  const info = rawInfo && typeof rawInfo === 'object' ? rawInfo : {};
  return {
    director: info.director ? String(info.director) : undefined,
    cast: info.cast ? String(info.cast) : undefined,
    plot: info.plot ? String(info.plot) : undefined,
    releasedate: info.releasedate ? String(info.releasedate) : undefined,
    releaseDate: info.releaseDate ? String(info.releaseDate) : undefined,
    year: info.year ? String(info.year) : undefined,
    rating: info.rating ? String(info.rating) : undefined,
    duration_secs: Number.isFinite(Number(info.duration_secs)) ? Number(info.duration_secs) : undefined,
    duration: info.duration ? String(info.duration) : undefined,
    movie_image: info.movie_image ? String(info.movie_image) : undefined,
    backdrop_path: Array.isArray(info.backdrop_path)
      ? info.backdrop_path.filter((item) => typeof item === 'string')
      : typeof info.backdrop_path === 'string'
        ? info.backdrop_path
        : undefined,
    trailer: info.trailer ? String(info.trailer) : undefined,
    youtube_trailer: info.youtube_trailer ? String(info.youtube_trailer) : undefined,
    cover: info.cover ? String(info.cover) : undefined,
  };
}

function cleanEpisodes(raw) {
  const episodes = raw?.episodes && typeof raw.episodes === 'object' ? raw.episodes : {};
  const result = {};

  for (const [season, list] of Object.entries(episodes)) {
    result[season] = (Array.isArray(list) ? list : [])
      .map((entry) => {
        const info = entry?.info && typeof entry.info === 'object' ? entry.info : {};
        const id = String(entry?.id ?? '').trim();
        if (!id) return null;

        return {
          id,
          title: String(entry?.title ?? `Episodio ${entry?.episode_num ?? ''}`).trim(),
          episodeNum: Number.parseInt(String(entry?.episode_num ?? '0'), 10) || 0,
          season: Number.parseInt(String(entry?.season ?? season), 10) || Number.parseInt(season, 10) || 0,
          ext: sanitizeExt(entry?.container_extension),
          image: String(
            entry?.movie_image ??
            entry?.cover_big ??
            entry?.cover ??
            info.movie_image ??
            info.cover_big ??
            info.cover ??
            '',
          ) || undefined,
        };
      })
      .filter(Boolean);
  }

  return result;
}

function decodeBase64Utf8(value) {
  if (!value) return '';
  try {
    return Buffer.from(String(value), 'base64').toString('utf8').trim();
  } catch {
    return String(value);
  }
}

function cleanEpg(raw) {
  const list = Array.isArray(raw?.epg_listings) ? raw.epg_listings : [];
  return list.map((entry) => ({
    title: decodeBase64Utf8(entry?.title ?? ''),
    start: String(entry?.start ?? ''),
    end: String(entry?.end ?? ''),
  }));
}

async function cachedXtream(serverUrl, credentials, action, params = {}, cleaner = (value) => value) {
  const key = cacheKey([
    'xtream',
    serverUrl,
    credentialHash(credentials.username, credentials.password),
    action || 'login',
    params.category_id ?? '',
    params.series_id ?? '',
    params.vod_id ?? '',
    params.stream_id ?? '',
    params.limit ?? '',
  ]);

  return await withCache(key, async () => cleaner(await fetchXtream(serverUrl, credentials, action, params)));
}

function authOk(raw) {
  const auth = raw?.user_info?.auth;
  return auth === 1 || auth === '1';
}

function cleanUserInfo(raw) {
  const userInfo = raw?.user_info && typeof raw.user_info === 'object' ? raw.user_info : {};
  return {
    username: userInfo.username ? String(userInfo.username) : undefined,
    status: userInfo.status ? String(userInfo.status) : undefined,
    expDate: userInfo.exp_date ? String(userInfo.exp_date) : undefined,
    activeCons: userInfo.active_cons ? String(userInfo.active_cons) : undefined,
    maxConnections: userInfo.max_connections ? String(userInfo.max_connections) : undefined,
  };
}

async function validateLoginOnServer(serverUrl, credentials) {
  const key = cacheKey(['xtream', serverUrl, credentialHash(credentials.username, credentials.password), 'login']);
  const raw = await withCache(key, async () => await fetchXtream(serverUrl, credentials, undefined), 60);

  if (!authOk(raw)) {
    throw new ApiError('invalid_credentials', 'Usuario ou senha IPTV invalidos.', 401);
  }

  return {
    serverUrl,
    userInfo: cleanUserInfo(raw),
  };
}

async function handleLogin(res, body) {
  const credentials = requireCredentials(body);
  const requestedServer = typeof body.serverUrl === 'string' && body.serverUrl.trim()
    ? [ensureAllowedServer(body.serverUrl)]
    : ALLOWED_SERVER_URLS;

  const errors = [];
  for (const serverUrl of requestedServer) {
    try {
      sendOk(res, await validateLoginOnServer(serverUrl, credentials));
      return;
    } catch (error) {
      errors.push(toApiError(error));
    }
  }

  if (errors.some((error) => error.type === 'invalid_credentials')) {
    throw new ApiError('invalid_credentials', 'Usuario ou senha IPTV invalidos.', 401);
  }

  const timeout = errors.find((error) => error.type === 'timeout');
  if (timeout && errors.every((error) => error.type === 'timeout')) throw timeout;

  const network = errors.find((error) => error.type === 'network_error');
  if (network) throw network;

  throw errors[0] ?? new ApiError('unknown_error', 'Nenhum servidor IPTV respondeu.', 502);
}

async function categoriesEndpoint(res, body, action) {
  const credentials = requireCredentials(body);
  const serverUrl = ensureAllowedServer(body.serverUrl);
  const items = await cachedXtream(serverUrl, credentials, action, {}, (raw) =>
    (Array.isArray(raw) ? raw : []).map(cleanCategory).filter(Boolean),
  );
  sendOk(res, { items });
}

async function liveStreamsEndpoint(res, body) {
  const credentials = requireCredentials(body);
  const serverUrl = ensureAllowedServer(body.serverUrl);
  const options = normalizePageOptions(body);
  const params = options.categoryId ? { category_id: options.categoryId } : {};
  const items = await cachedXtream(serverUrl, credentials, 'get_live_streams', params, (raw) =>
    groupLiveStreams(raw, serverUrl, credentials),
  );
  const page = paginateItems(items, options);
  sendList(res, page.page, page.limit, page.total, page.items);
}

async function vodStreamsEndpoint(res, body) {
  const credentials = requireCredentials(body);
  const serverUrl = ensureAllowedServer(body.serverUrl);
  const options = normalizePageOptions(body);
  const params = options.categoryId ? { category_id: options.categoryId } : {};
  const items = await cachedXtream(serverUrl, credentials, 'get_vod_streams', params, (raw) =>
    cleanVodStreams(raw, serverUrl, credentials),
  );
  const page = paginateItems(items, options);
  sendList(res, page.page, page.limit, page.total, page.items);
}

async function seriesEndpoint(res, body) {
  const credentials = requireCredentials(body);
  const serverUrl = ensureAllowedServer(body.serverUrl);
  const options = normalizePageOptions(body);
  const params = options.categoryId ? { category_id: options.categoryId } : {};
  const items = await cachedXtream(serverUrl, credentials, 'get_series', params, cleanSeries);
  const page = paginateItems(items, options);
  sendList(res, page.page, page.limit, page.total, page.items);
}

async function vodInfoEndpoint(res, body) {
  const credentials = requireCredentials(body);
  const serverUrl = ensureAllowedServer(body.serverUrl);
  const vodId = typeof body.vodId === 'string' ? body.vodId.trim() : '';
  if (!vodId) throw new ApiError('unknown_error', 'Informe vodId.', 400);

  const data = await cachedXtream(serverUrl, credentials, 'get_vod_info', { vod_id: vodId }, (raw) => ({
    info: cleanInfo(raw?.info),
  }));
  sendOk(res, data);
}

async function seriesInfoEndpoint(res, body) {
  const credentials = requireCredentials(body);
  const serverUrl = ensureAllowedServer(body.serverUrl);
  const seriesId = typeof body.seriesId === 'string' ? body.seriesId.trim() : '';
  if (!seriesId) throw new ApiError('unknown_error', 'Informe seriesId.', 400);

  const data = await cachedXtream(serverUrl, credentials, 'get_series_info', { series_id: seriesId }, (raw) => ({
    info: cleanInfo(raw?.info),
    episodes: cleanEpisodes(raw),
  }));
  sendOk(res, data);
}

async function epgShortEndpoint(res, body) {
  const credentials = requireCredentials(body);
  const serverUrl = ensureAllowedServer(body.serverUrl);
  const streamId = typeof body.streamId === 'string' ? body.streamId.trim() : '';
  const limit = Math.min(Math.max(Number.parseInt(String(body.limit ?? '2'), 10) || 2, 1), 10);
  if (!streamId) throw new ApiError('unknown_error', 'Informe streamId.', 400);

  const items = await cachedXtream(
    serverUrl,
    credentials,
    'get_short_epg',
    { stream_id: streamId, limit },
    cleanEpg,
  );
  sendOk(res, { items });
}

const routes = new Map([
  ['/api/xtream/login', handleLogin],
  ['/api/xtream/live/categories', (res, body) => categoriesEndpoint(res, body, 'get_live_categories')],
  ['/api/xtream/live/streams', liveStreamsEndpoint],
  ['/api/xtream/vod/categories', (res, body) => categoriesEndpoint(res, body, 'get_vod_categories')],
  ['/api/xtream/vod/streams', vodStreamsEndpoint],
  ['/api/xtream/series/categories', (res, body) => categoriesEndpoint(res, body, 'get_series_categories')],
  ['/api/xtream/series', seriesEndpoint],
  ['/api/xtream/series/info', seriesInfoEndpoint],
  ['/api/xtream/vod/info', vodInfoEndpoint],
  ['/api/xtream/epg/short', epgShortEndpoint],
]);

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (requestUrl.pathname === '/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      service: 'arelon-api',
      cacheTtlSeconds: CACHE_TTL_SECONDS,
      cacheEntries: cache.size,
      servers: ALLOWED_SERVER_URLS.length,
    });
    return;
  }

  const handler = routes.get(requestUrl.pathname);
  if (!handler) {
    sendJson(res, 404, {
      ok: false,
      type: 'unknown_error',
      message: 'Rota nao encontrada.',
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, {
      ok: false,
      type: 'unknown_error',
      message: 'Metodo nao permitido.',
    });
    return;
  }

  try {
    const body = await readRequestBody(req);
    await handler(res, body);
  } catch (error) {
    sendError(res, error);
  }
});

server.listen(API_PORT, '0.0.0.0', () => {
  console.log(`Arelon API proxy listening on 0.0.0.0:${API_PORT}`);
  console.log(`Allowed IPTV servers: ${ALLOWED_SERVER_URLS.join(', ')}`);
  console.log(`Xtream cache TTL: ${CACHE_TTL_SECONDS}s`);
});
