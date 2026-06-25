export const config = { runtime: 'edge' }

// ── IPTV Proxy — Vercel Edge Function ──────────────────────────────────────
// Proxy server-side para os servidores IPTV HTTP, evitando mixed-content e CORS.
// Porta o Cloudflare Worker (worker/src/index.js) para Vercel Edge Runtime.

const DEFAULT_SERVER_URLS = [
  'http://fravub.online',
  'http://mxcdnr.xyz:80',
  'http://glimen.online',
  'http://resfcdn.online:80',
  'http://ultraviracdn.online:80',
  'http://purolab.online:80',
]

const DEFAULT_TIMEOUT_MS = 12000
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

const ALLOWED_SERVER_URLS = [...new Set(DEFAULT_SERVER_URLS.map(normalizeServerUrl).filter(Boolean))]

class ApiError extends Error {
  type: string
  statusCode: number
  details: Record<string, unknown>

  constructor(type: string, message: string, statusCode = 500, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.type = type
    this.statusCode = statusCode
    this.details = details
  }
}

function normalizeServerUrl(input: unknown): string {
  const trimmed = String(input ?? '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const url = new URL(withProtocol)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    const port = url.port ? `:${url.port}` : ''
    return `${url.protocol}//${url.hostname}${port}`
  } catch {
    return ''
  }
}

function baseUrl(input: unknown): string {
  return normalizeServerUrl(input).replace(/\/+$/, '')
}

function ensureAllowedServer(serverUrl: unknown): string {
  const normalized = normalizeServerUrl(serverUrl)
  if (!normalized || !ALLOWED_SERVER_URLS.includes(normalized)) {
    throw new ApiError('unknown_error', 'Servidor IPTV nao permitido pela API Arelon.', 400)
  }
  return normalized
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function jsonResponse(statusCode: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  })
}

function okResponse(data: unknown): Response {
  return jsonResponse(200, { ok: true, data })
}

function listResponse(page: number, limit: number, total: number, items: unknown[]): Response {
  return jsonResponse(200, { ok: true, page, limit, total, hasMore: page * limit < total, items })
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if ((error as Error)?.name === 'AbortError') return new ApiError('timeout', 'Tempo esgotado ao consultar o servidor IPTV.', 504)
  if (error instanceof SyntaxError) return new ApiError('invalid_json', 'Servidor IPTV retornou JSON invalido.', 502)
  return new ApiError('unknown_error', 'Erro inesperado na API Arelon.', 500)
}

function errorResponse(error: unknown): Response {
  const apiError = toApiError(error)
  return jsonResponse(apiError.statusCode, { ok: false, type: apiError.type, message: apiError.message })
}

function requireCredentials(body: Record<string, unknown>): { username: string; password: string } {
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username || !password.trim()) {
    throw new ApiError('invalid_credentials', 'Informe usuario e senha IPTV.', 401)
  }
  return { username, password: password.trim() }
}

function normalizePageOptions(body: Record<string, unknown>) {
  const pageNumber = parseInt(String(body.page ?? DEFAULT_PAGE), 10)
  const limitNumber = parseInt(String(body.limit ?? DEFAULT_LIMIT), 10)
  const page = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : DEFAULT_PAGE
  const limit = Number.isFinite(limitNumber) && limitNumber > 0 ? Math.min(limitNumber, MAX_LIMIT) : DEFAULT_LIMIT
  const categoryId = typeof body.categoryId === 'string' && body.categoryId.trim() ? body.categoryId.trim() : undefined
  const search = typeof body.search === 'string' && body.search.trim() ? body.search.trim() : undefined
  return { page, limit, categoryId, search }
}

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function paginateItems<T extends { name?: unknown; title?: unknown }>(items: T[], options: { page: number; limit: number; search?: string }) {
  const search = normalizeText(options.search)
  const filtered = search ? items.filter((item) => normalizeText(item.name ?? item.title ?? '').includes(search)) : items
  const start = (options.page - 1) * options.limit
  return { page: options.page, limit: options.limit, total: filtered.length, items: filtered.slice(start, start + options.limit) }
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json,text/plain,*/*', 'User-Agent': 'Arelon-IPTV-Proxy/1.0' },
    })
    const text = await res.text()
    if (!res.ok) {
      throw new ApiError('upstream_http_error', `Servidor IPTV respondeu HTTP ${res.status}.`, 502, { upstreamStatus: res.status })
    }
    try { return JSON.parse(text) } catch { throw new ApiError('invalid_json', 'Servidor IPTV retornou JSON invalido.', 502) }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if ((error as Error)?.name === 'AbortError') throw new ApiError('timeout', 'Tempo esgotado ao consultar o servidor IPTV.', 504)
    throw new ApiError('network_error', 'Falha de rede ao consultar o servidor IPTV.', 502)
  } finally {
    clearTimeout(timer)
  }
}

function xtreamUrl(serverUrl: string, username: string, password: string, action: string | undefined, params: Record<string, unknown> = {}): string {
  const url = new URL(`${baseUrl(serverUrl)}/player_api.php`)
  url.searchParams.set('username', username)
  url.searchParams.set('password', password)
  if (action) url.searchParams.set('action', action)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function fetchXtream(serverUrl: string, credentials: { username: string; password: string }, action: string | undefined, params: Record<string, unknown> = {}): Promise<unknown> {
  return fetchJsonWithTimeout(xtreamUrl(serverUrl, credentials.username, credentials.password, action, params))
}

function isAuthHttpError(error: unknown): boolean {
  const apiError = toApiError(error)
  return apiError.type === 'upstream_http_error' && (apiError.details?.upstreamStatus === 401 || apiError.details?.upstreamStatus === 403)
}

function streamUrl(serverUrl: string, username: string, password: string, kind: string, id: string, ext = ''): string {
  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)
  const cleanExt = ext ? `.${String(ext).replace(/^\./, '')}` : ''
  return `${baseUrl(serverUrl)}/${kind}/${u}/${p}/${id}${cleanExt}`
}

function sanitizeExt(ext: unknown, fallback = 'mp4'): string {
  const cleaned = String(ext ?? '').replace(/^\./, '').replace(/[^a-z0-9]/gi, '')
  return cleaned || fallback
}

function cleanCategory(raw: Record<string, unknown>) {
  const id = String(raw?.category_id ?? '').trim()
  const name = String(raw?.category_name ?? '').trim()
  if (!id || !name) return null
  return { id, name }
}

function qualityFromName(name: unknown): string {
  const match = String(name ?? '').match(/\b(4K|FHD|HD|SD|1080p|720p)\b/i)
  if (!match?.[1]) return 'DEFAULT'
  const quality = match[1].toUpperCase()
  if (quality === '1080P') return 'FHD'
  if (quality === '720P') return 'HD'
  return quality
}

function cleanLiveName(name: unknown): string {
  const rawName = String(name ?? '').trim()
  return rawName.replace(/\b(4K|FHD|HD|SD|1080p|720p)\b/gi, '').replace(/\[.*?\]/g, '').replace(/\|.*?\|/g, '').replace(/[-|]/g, '').trim().replace(/\s+/g, ' ') || rawName
}

function groupLiveStreams(raw: unknown, serverUrl: string, credentials: { username: string; password: string }) {
  const grouped = new Map<string, Record<string, unknown>>()
  const qualityPriority: Record<string, number> = { DEFAULT: 0, SD: 1, HD: 2, FHD: 3, '4K': 4 }
  for (const entry of Array.isArray(raw) ? raw : []) {
    const e = entry as Record<string, unknown>
    const streamId = String(e?.stream_id ?? '').trim()
    if (!streamId) continue
    const rawName = String(e?.name ?? '').trim()
    if (!rawName) continue
    const displayName = cleanLiveName(rawName)
    const quality = qualityFromName(rawName)
    const key = normalizeText(displayName)
    const url = streamUrl(serverUrl, credentials.username, credentials.password, 'live', streamId, 'm3u8')
    const logoCdn = String(e?.logo_cdn ?? '').trim()
    const logoPlaylist = String(e?.stream_icon ?? '').trim()
    const logoPlaceholder = String(e?.logo_placeholder ?? '').trim()
    if (!grouped.has(key)) {
      grouped.set(key, { id: streamId, name: displayName, logo: logoCdn || logoPlaylist, logoCdn, logoPlaylist, logoPlaceholder, categoryId: String(e?.category_id ?? ''), streamUrl: url, streams: { [quality]: url } })
      continue
    }
    const existing = grouped.get(key)!
    const streams = existing.streams as Record<string, string>
    const currentTop = Object.keys(streams).sort((a, b) => (qualityPriority[b] ?? 0) - (qualityPriority[a] ?? 0))[0] ?? 'DEFAULT'
    if ((qualityPriority[quality] ?? 0) > (qualityPriority[currentTop] ?? 0)) { existing.id = streamId; existing.streamUrl = url }
    streams[quality] = url
    if (!existing.logoCdn && logoCdn) { existing.logoCdn = logoCdn; existing.logo = logoCdn }
    if (!existing.logoPlaylist && logoPlaylist) existing.logoPlaylist = logoPlaylist
    if (!existing.logoPlaceholder && logoPlaceholder) existing.logoPlaceholder = logoPlaceholder
  }
  return [...grouped.values()]
}

function cleanVodStreams(raw: unknown, serverUrl: string, credentials: { username: string; password: string }) {
  return (Array.isArray(raw) ? raw : []).map((entry) => {
    const e = entry as Record<string, unknown>
    const id = String(e?.stream_id ?? '').trim()
    const name = String(e?.name ?? '').trim()
    if (!id || !name) return null
    const ext = sanitizeExt(e?.container_extension)
    const backdropRaw = e?.backdrop_path
    const backdrop = Array.isArray(backdropRaw) && backdropRaw.length > 0 ? String(backdropRaw[0]) : typeof backdropRaw === 'string' && backdropRaw ? backdropRaw : undefined
    return { id, name, poster: String(e?.stream_icon ?? ''), categoryId: String(e?.category_id ?? ''), streamUrl: streamUrl(serverUrl, credentials.username, credentials.password, 'movie', id, ext), ext, plot: e?.plot ? String(e.plot) : undefined, year: e?.year ? String(e.year) : undefined, rating: e?.rating ? String(e.rating) : undefined, backdrop, logoText: typeof e?.movie_image === 'string' && e.movie_image ? e.movie_image : undefined }
  }).filter(Boolean)
}

function cleanSeries(raw: unknown) {
  return (Array.isArray(raw) ? raw : []).map((entry) => {
    const e = entry as Record<string, unknown>
    const id = String(e?.series_id ?? '').trim()
    const name = String(e?.name ?? '').trim()
    if (!id || !name) return null
    const backdropRaw = e?.backdrop_path
    const backdrop = Array.isArray(backdropRaw) && backdropRaw.length > 0 ? String(backdropRaw[0]) : typeof backdropRaw === 'string' && backdropRaw ? backdropRaw : undefined
    return { id, name, cover: String(e?.cover ?? ''), categoryId: String(e?.category_id ?? ''), plot: e?.plot ? String(e.plot) : undefined, year: e?.year ? String(e.year) : undefined, rating: e?.rating ? String(e.rating) : undefined, backdrop, logoText: typeof e?.movie_image === 'string' && e.movie_image ? e.movie_image : undefined }
  }).filter(Boolean)
}

function cleanInfo(rawInfo: unknown) {
  const info = rawInfo && typeof rawInfo === 'object' ? rawInfo as Record<string, unknown> : {}
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
    backdrop_path: Array.isArray(info.backdrop_path) ? (info.backdrop_path as unknown[]).filter((item) => typeof item === 'string') : typeof info.backdrop_path === 'string' ? info.backdrop_path : undefined,
    trailer: info.trailer ? String(info.trailer) : undefined,
    youtube_trailer: info.youtube_trailer ? String(info.youtube_trailer) : undefined,
    cover: info.cover ? String(info.cover) : undefined,
  }
}

function cleanEpisodes(raw: unknown) {
  const episodes = (raw as Record<string, unknown>)?.episodes && typeof (raw as Record<string, unknown>).episodes === 'object'
    ? (raw as Record<string, unknown>).episodes as Record<string, unknown[]>
    : {}
  const result: Record<string, unknown[]> = {}
  for (const [season, list] of Object.entries(episodes)) {
    result[season] = (Array.isArray(list) ? list : []).map((entry) => {
      const e = entry as Record<string, unknown>
      const info = e?.info && typeof e.info === 'object' ? e.info as Record<string, unknown> : {}
      const id = String(e?.id ?? '').trim()
      if (!id) return null
      return {
        id, title: String(e?.title ?? `Episodio ${e?.episode_num ?? ''}`).trim(),
        episodeNum: parseInt(String(e?.episode_num ?? '0'), 10) || 0,
        season: parseInt(String(e?.season ?? season), 10) || parseInt(season, 10) || 0,
        ext: sanitizeExt(e?.container_extension),
        image: String(e?.movie_image ?? e?.cover_big ?? e?.cover ?? e?.stream_icon ?? e?.image ?? info?.movie_image ?? info?.cover_big ?? info?.cover ?? info?.image ?? (info as Record<string, unknown>)?.screenshot ?? '') || undefined,
      }
    }).filter(Boolean)
  }
  return result
}

function decodeBase64(value: unknown): string {
  if (!value) return ''
  try { return atob(String(value)).trim() } catch { return String(value) }
}

function cleanEpg(raw: unknown) {
  const list = Array.isArray((raw as Record<string, unknown>)?.epg_listings) ? (raw as Record<string, unknown>).epg_listings as unknown[] : []
  return list.map((entry) => {
    const e = entry as Record<string, unknown>
    return { title: decodeBase64(e?.title ?? ''), start: String(e?.start ?? ''), end: String(e?.end ?? '') }
  })
}

function authOk(raw: unknown): boolean {
  const auth = (raw as Record<string, unknown>)?.user_info && typeof (raw as Record<string, unknown>).user_info === 'object'
    ? ((raw as Record<string, unknown>).user_info as Record<string, unknown>)?.auth
    : undefined
  return auth === 1 || auth === '1'
}

function cleanUserInfo(raw: unknown) {
  const userInfo = (raw as Record<string, unknown>)?.user_info && typeof (raw as Record<string, unknown>).user_info === 'object'
    ? (raw as Record<string, unknown>).user_info as Record<string, unknown>
    : {}
  return {
    username: userInfo.username ? String(userInfo.username) : undefined,
    status: userInfo.status ? String(userInfo.status) : undefined,
    expDate: userInfo.exp_date ? String(userInfo.exp_date) : undefined,
    activeCons: userInfo.active_cons ? String(userInfo.active_cons) : undefined,
    maxConnections: userInfo.max_connections ? String(userInfo.max_connections) : undefined,
  }
}

async function validateLoginOnServer(serverUrl: string, credentials: { username: string; password: string }) {
  let raw: unknown
  try {
    raw = await fetchXtream(serverUrl, credentials, undefined)
  } catch (error) {
    if (isAuthHttpError(error)) throw new ApiError('invalid_credentials', 'Usuario ou senha IPTV invalidos.', 401)
    throw error
  }
  if (!authOk(raw)) throw new ApiError('invalid_credentials', 'Usuario ou senha IPTV invalidos.', 401)
  return { serverUrl, userInfo: cleanUserInfo(raw) }
}

async function handleLogin(body: Record<string, unknown>): Promise<Response> {
  const credentials = requireCredentials(body)
  const requestedServer = typeof body.serverUrl === 'string' && body.serverUrl.trim()
    ? [ensureAllowedServer(body.serverUrl)]
    : ALLOWED_SERVER_URLS

  const errors: ApiError[] = []
  for (const serverUrl of requestedServer) {
    try {
      return okResponse(await validateLoginOnServer(serverUrl, credentials))
    } catch (error) {
      errors.push(toApiError(error))
    }
  }

  if (errors.some((e) => e.type === 'invalid_credentials')) throw new ApiError('invalid_credentials', 'Usuario ou senha IPTV invalidos.', 401)
  const timeout = errors.find((e) => e.type === 'timeout')
  if (timeout && errors.every((e) => e.type === 'timeout')) throw timeout
  const network = errors.find((e) => e.type === 'network_error')
  if (network) throw network
  throw errors[0] ?? new ApiError('unknown_error', 'Nenhum servidor IPTV respondeu.', 502)
}

async function categoriesEndpoint(body: Record<string, unknown>, action: string): Promise<Response> {
  const credentials = requireCredentials(body)
  const serverUrl = ensureAllowedServer(body.serverUrl)
  const raw = await fetchXtream(serverUrl, credentials, action)
  const items = (Array.isArray(raw) ? raw : []).map((r) => cleanCategory(r as Record<string, unknown>)).filter(Boolean)
  return okResponse({ items })
}

async function liveStreamsEndpoint(body: Record<string, unknown>): Promise<Response> {
  const credentials = requireCredentials(body)
  const serverUrl = ensureAllowedServer(body.serverUrl)
  const options = normalizePageOptions(body)
  const params = options.categoryId ? { category_id: options.categoryId } : {}
  const raw = await fetchXtream(serverUrl, credentials, 'get_live_streams', params)
  const items = groupLiveStreams(raw, serverUrl, credentials)
  const page = paginateItems(items, options)
  return listResponse(page.page, page.limit, page.total, page.items)
}

async function vodStreamsEndpoint(body: Record<string, unknown>): Promise<Response> {
  const credentials = requireCredentials(body)
  const serverUrl = ensureAllowedServer(body.serverUrl)
  const options = normalizePageOptions(body)
  const params = options.categoryId ? { category_id: options.categoryId } : {}
  const raw = await fetchXtream(serverUrl, credentials, 'get_vod_streams', params)
  const items = cleanVodStreams(raw, serverUrl, credentials)
  const page = paginateItems(items, options)
  return listResponse(page.page, page.limit, page.total, page.items)
}

async function seriesEndpoint(body: Record<string, unknown>): Promise<Response> {
  const credentials = requireCredentials(body)
  const serverUrl = ensureAllowedServer(body.serverUrl)
  const options = normalizePageOptions(body)
  const params = options.categoryId ? { category_id: options.categoryId } : {}
  const raw = await fetchXtream(serverUrl, credentials, 'get_series', params)
  const items = cleanSeries(raw)
  const page = paginateItems(items, options)
  return listResponse(page.page, page.limit, page.total, page.items)
}

async function vodInfoEndpoint(body: Record<string, unknown>): Promise<Response> {
  const credentials = requireCredentials(body)
  const serverUrl = ensureAllowedServer(body.serverUrl)
  const vodId = typeof body.vodId === 'string' ? body.vodId.trim() : ''
  if (!vodId) throw new ApiError('unknown_error', 'Informe vodId.', 400)
  const raw = await fetchXtream(serverUrl, credentials, 'get_vod_info', { vod_id: vodId })
  return okResponse({ info: cleanInfo((raw as Record<string, unknown>)?.info) })
}

async function seriesInfoEndpoint(body: Record<string, unknown>): Promise<Response> {
  const credentials = requireCredentials(body)
  const serverUrl = ensureAllowedServer(body.serverUrl)
  const seriesId = typeof body.seriesId === 'string' ? body.seriesId.trim() : ''
  if (!seriesId) throw new ApiError('unknown_error', 'Informe seriesId.', 400)
  const raw = await fetchXtream(serverUrl, credentials, 'get_series_info', { series_id: seriesId })
  return okResponse({ info: cleanInfo((raw as Record<string, unknown>)?.info), episodes: cleanEpisodes(raw) })
}

async function epgShortEndpoint(body: Record<string, unknown>): Promise<Response> {
  const credentials = requireCredentials(body)
  const serverUrl = ensureAllowedServer(body.serverUrl)
  const streamId = typeof body.streamId === 'string' ? body.streamId.trim() : ''
  const limit = Math.min(Math.max(parseInt(String(body.limit ?? '2'), 10) || 2, 1), 10)
  if (!streamId) throw new ApiError('unknown_error', 'Informe streamId.', 400)
  const raw = await fetchXtream(serverUrl, credentials, 'get_short_epg', { stream_id: streamId, limit })
  return okResponse({ items: cleanEpg(raw) })
}

const routes = new Map<string, (body: Record<string, unknown>) => Promise<Response>>([
  ['/api/xtream/login', handleLogin],
  ['/api/xtream/live/categories', (body) => categoriesEndpoint(body, 'get_live_categories')],
  ['/api/xtream/live/streams', liveStreamsEndpoint],
  ['/api/xtream/vod/categories', (body) => categoriesEndpoint(body, 'get_vod_categories')],
  ['/api/xtream/vod/streams', vodStreamsEndpoint],
  ['/api/xtream/series/categories', (body) => categoriesEndpoint(body, 'get_series_categories')],
  ['/api/xtream/series', seriesEndpoint],
  ['/api/xtream/series/info', seriesInfoEndpoint],
  ['/api/xtream/vod/info', vodInfoEndpoint],
  ['/api/xtream/epg/short', epgShortEndpoint],
])

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const routeHandler = routes.get(url.pathname)
  if (!routeHandler) {
    return jsonResponse(404, { ok: false, type: 'unknown_error', message: 'Rota nao encontrada.' })
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { ok: false, type: 'unknown_error', message: 'Metodo nao permitido.' })
  }

  try {
    const body = await request.json() as Record<string, unknown>
    return await routeHandler(body)
  } catch (error) {
    return errorResponse(error)
  }
}
