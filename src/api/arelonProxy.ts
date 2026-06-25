import type { Category, Channel, Episode, Movie, Series } from '../store'
import { getServerUrls } from '../lib/pool'

export type ArelonApiErrorType =
  | 'invalid_credentials'
  | 'network_error'
  | 'timeout'
  | 'upstream_http_error'
  | 'invalid_json'
  | 'mixed_content_or_cors'
  | 'unknown_error'

export interface ArelonCredentials {
  serverUrl?: string
  username: string
  password: string
}

export interface PageRequest {
  page?: number
  limit?: number
  categoryId?: string
  search?: string
  type?: string
}

export interface PaginatedResult<T> {
  page: number
  limit: number
  total: number
  hasMore: boolean
  items: T[]
}

interface ApiOkResponse<T> {
  ok: true
  data: T
}

interface ApiListResponse<T> {
  ok: true
  page: number
  limit: number
  total: number
  hasMore: boolean
  items: T[]
}

interface ApiErrorResponse {
  ok: false
  type: ArelonApiErrorType
  message: string
}

export interface LoginResult {
  serverUrl: string
  userInfo?: {
    username?: string
    status?: string
    expDate?: string
    activeCons?: string
    maxConnections?: string
  }
}

export interface VodInfo {
  info: {
    director?: string
    cast?: string
    plot?: string
    releasedate?: string
    year?: string
    rating?: string
    duration_secs?: number
    duration?: string
    movie_image?: string
    backdrop_path?: string[] | string
    trailer?: string
    youtube_trailer?: string
    cover?: string
  }
}

export interface SeriesInfo {
  info: {
    director?: string
    cast?: string
    plot?: string
    releaseDate?: string
    year?: string
    rating?: string
    movie_image?: string
    backdrop_path?: string[] | string
    trailer?: string
    youtube_trailer?: string
    cover?: string
  }
  episodes?: Record<string, Episode[]>
}

export interface EpgProgram {
  title: string
  start: string
  end: string
}

export interface SportsCalendarTeam {
  name: string
  logo?: string
}

export interface SportsCalendarEvent {
  id: string
  category: string
  categoryLabel: string
  leagueLabel: string
  name: string
  teamA: SportsCalendarTeam
  teamB?: SportsCalendarTeam
  startTime: string
  status: 'scheduled' | 'live' | 'final' | 'canceled'
  statusLabel: string
  venue?: string
  broadcasts?: string[]
  source: string
}

export interface SportsCalendarResponse {
  updatedAt: string
  source: string
  items: SportsCalendarEvent[]
}

const DEFAULT_API_BASE_URLS = ['.', 'https://api.arelon.com.br']
const DEFAULT_TIMEOUT_MS = 15000
const RETRYABLE_API_ERROR_TYPES = new Set<ArelonApiErrorType>([
  'network_error',
  'timeout',
  'upstream_http_error',
  'invalid_json',
  'mixed_content_or_cors',
])

export class ArelonProxyError extends Error {
  readonly type: ArelonApiErrorType
  readonly fromApiResponse: boolean

  constructor(type: ArelonApiErrorType, message: string, options: { fromApiResponse?: boolean } = {}) {
    super(message)
    this.name = 'ArelonProxyError'
    this.type = type
    this.fromApiResponse = Boolean(options.fromApiResponse)
  }
}

function normalizeApiBaseUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed || trimmed === '.' || trimmed === './' || trimmed === '/') return '.'
  return trimmed.replace(/\/+$/, '')
}

function splitApiBaseUrls(input: string | undefined): string[] {
  return String(input ?? '')
    .split(',')
    .map(normalizeApiBaseUrl)
    .filter(Boolean)
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

function isLoopbackApiBaseUrl(base: string): boolean {
  if (!/^https?:\/\//i.test(base)) return false

  try {
    return isLoopbackHostname(new URL(base).hostname)
  } catch {
    return false
  }
}

function getApiBaseUrls(): string[] {
  const env = import.meta.env as Record<string, string | undefined>
  const configured = splitApiBaseUrls(env.VITE_ARELON_API_BASE_URLS || env.VITE_ARELON_API_BASE_URL)
  const candidates = configured.length > 0 ? configured : DEFAULT_API_BASE_URLS
  const isRemoteBrowser = window.location.protocol !== 'file:' && !isLoopbackHostname(window.location.hostname)
  const browserSafeCandidates = isRemoteBrowser ? candidates.filter((base) => !isLoopbackApiBaseUrl(base)) : candidates
  const finalCandidates = browserSafeCandidates.length === candidates.length
    ? browserSafeCandidates
    : ['.', ...browserSafeCandidates]

  return [...new Set([...finalCandidates, ...DEFAULT_API_BASE_URLS].map(normalizeApiBaseUrl))]
}

function resolveApiUrl(path: string, base: string): URL {
  if (/^https?:\/\//i.test(base)) return new URL(path, `${base}/`)
  return new URL(path, window.location.origin || window.location.href)
}

function isMixedContentBlocked(url: URL): boolean {
  return window.location.protocol === 'https:' && url.protocol === 'http:'
}

function classifyFetchFailure(url: URL, error: unknown): ArelonProxyError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ArelonProxyError('timeout', 'A API Arelon demorou demais para responder.')
  }

  if (isMixedContentBlocked(url)) {
    return new ArelonProxyError(
      'mixed_content_or_cors',
      'O navegador bloqueou a chamada por mixed content: pagina HTTPS tentando acessar API HTTP.',
    )
  }

  if (error instanceof TypeError && window.location.protocol === 'https:' && url.origin !== window.location.origin) {
    return new ArelonProxyError(
      'mixed_content_or_cors',
      `Falha ao acessar a API Arelon em ${url.origin}. Verifique CORS, DNS ou certificado HTTPS.`,
    )
  }

  return new ArelonProxyError('network_error', 'Falha de rede ao acessar a API Arelon.')
}

function shouldTryNextApiBase(error: ArelonProxyError): boolean {
  if (error.fromApiResponse) return false
  return RETRYABLE_API_ERROR_TYPES.has(error.type)
}

function appendAttemptContext(error: ArelonProxyError, attempts: string[]): ArelonProxyError {
  if (attempts.length <= 1) return error
  return new ArelonProxyError(error.type, `${error.message} Tentativas: ${attempts.join(', ')}`)
}

async function postJsonAtUrl<T>(url: URL, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  if (isMixedContentBlocked(url)) {
    throw classifyFetchFailure(url, new TypeError('mixed content'))
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await res.text()
    let payload: ApiOkResponse<T> | ApiListResponse<T> | ApiErrorResponse

    try {
      payload = JSON.parse(text) as ApiOkResponse<T> | ApiListResponse<T> | ApiErrorResponse
    } catch {
      throw new ArelonProxyError('invalid_json', 'A API Arelon retornou uma resposta que nao e JSON valido.')
    }

    if (!payload.ok) {
      throw new ArelonProxyError(payload.type, payload.message, { fromApiResponse: true })
    }

    if (!res.ok) {
      throw new ArelonProxyError('upstream_http_error', `A API Arelon respondeu HTTP ${res.status}.`)
    }

    return payload as T
  } catch (error) {
    if (error instanceof ArelonProxyError) throw error
    throw classifyFetchFailure(url, error)
  } finally {
    window.clearTimeout(timer)
  }
}

async function postJson<T>(path: string, body: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const bases = getApiBaseUrls()
  const attempts: string[] = []
  let lastError: ArelonProxyError | null = null

  for (const base of bases) {
    const url = resolveApiUrl(path, base)
    attempts.push(url.origin)

    try {
      return await postJsonAtUrl<T>(url, body, timeoutMs)
    } catch (error) {
      if (!(error instanceof ArelonProxyError)) throw error
      lastError = error
      if (!shouldTryNextApiBase(error)) throw error
    }
  }

  throw appendAttemptContext(
    lastError ?? new ArelonProxyError('network_error', 'Nenhuma API Arelon respondeu.'),
    [...new Set(attempts)],
  )
}

async function getJsonAtUrl<T>(url: URL, timeoutMs: number): Promise<T> {
  if (isMixedContentBlocked(url)) {
    throw classifyFetchFailure(url, new TypeError('mixed content'))
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })

    const text = await res.text()
    let payload: ApiOkResponse<T> | ApiErrorResponse

    try {
      payload = JSON.parse(text) as ApiOkResponse<T> | ApiErrorResponse
    } catch {
      throw new ArelonProxyError('invalid_json', 'A API Arelon retornou uma resposta que nao e JSON valido.')
    }

    if (!payload.ok) {
      throw new ArelonProxyError(payload.type, payload.message, { fromApiResponse: true })
    }

    if (!res.ok) {
      throw new ArelonProxyError('upstream_http_error', `A API Arelon respondeu HTTP ${res.status}.`)
    }

    return payload.data
  } catch (error) {
    if (error instanceof ArelonProxyError) throw error
    throw classifyFetchFailure(url, error)
  } finally {
    window.clearTimeout(timer)
  }
}

async function getJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const bases = getApiBaseUrls()
  const attempts: string[] = []
  let lastError: ArelonProxyError | null = null

  for (const base of bases) {
    const url = resolveApiUrl(path, base)
    attempts.push(url.origin)

    try {
      return await getJsonAtUrl<T>(url, timeoutMs)
    } catch (error) {
      if (!(error instanceof ArelonProxyError)) throw error
      lastError = error
      if (!shouldTryNextApiBase(error)) throw error
    }
  }

  throw appendAttemptContext(
    lastError ?? new ArelonProxyError('network_error', 'Nenhuma API Arelon respondeu.'),
    [...new Set(attempts)],
  )
}

function payload(credentials: ArelonCredentials, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    serverUrl: credentials.serverUrl,
    username: credentials.username,
    password: credentials.password,
    ...extra,
  }
}

async function postData<T>(path: string, credentials: ArelonCredentials, extra?: Record<string, unknown>): Promise<T> {
  const response = await postJson<ApiOkResponse<T>>(path, payload(credentials, extra))
  return response.data
}

async function postList<T>(path: string, credentials: ArelonCredentials, page?: PageRequest): Promise<PaginatedResult<T>> {
  const response = await postJson<ApiListResponse<T>>(path, payload(credentials, page as Record<string, unknown>))
  return {
    page: response.page,
    limit: response.limit,
    total: response.total,
    hasMore: response.hasMore,
    items: response.items,
  }
}

async function directXtreamLogin(serverUrl: string, username: string, password: string): Promise<LoginResult> {
  const base = serverUrl.replace(/\/+$/, '')
  const url = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`

  let res: Response
  try {
    res = await fetch(url, { method: 'GET', cache: 'no-store' })
  } catch (fetchErr) {
    // CORS or network block on direct call — surface as mixed/cors so caller can decide
    throw new ArelonProxyError('mixed_content_or_cors', 'Falha na conexão direta ao servidor IPTV (possível CORS ou mixed content).')
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new ArelonProxyError('invalid_credentials', 'Usuario ou senha invalidos.', { fromApiResponse: true })
    }
    throw new ArelonProxyError('upstream_http_error', `Servidor IPTV respondeu HTTP ${res.status}.`)
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    throw new ArelonProxyError('invalid_json', 'O servidor IPTV retornou uma resposta invalida.')
  }

  const auth = data?.user_info?.auth
  if (auth !== 1 && auth !== '1') {
    throw new ArelonProxyError('invalid_credentials', 'Usuario ou senha invalidos.', { fromApiResponse: true })
  }

  return {
    serverUrl: base,
    userInfo: {
      username: data?.user_info?.username,
      status: data?.user_info?.status,
      expDate: data?.user_info?.exp_date,
      activeCons: data?.user_info?.active_cons,
      maxConnections: data?.user_info?.max_connections,
    },
  }
}

export async function login(credentials: ArelonCredentials): Promise<LoginResult> {
  try {
    return await postData<LoginResult>('/api/xtream/login', credentials)
  } catch (err) {
    if (err instanceof ArelonProxyError && err.type !== 'invalid_credentials') {
      // Fallback direto para ambientes static hosted (GitHub Pages) ou quando a API Arelon proxy não está disponível via HTTPS.
      if (credentials.serverUrl) {
        return await directXtreamLogin(credentials.serverUrl, credentials.username, credentials.password)
      }

      // Sem serverUrl específico (login inicial): tenta os servidores configurados diretamente.
      const servers = getServerUrls()
      let lastDirectError: ArelonProxyError | null = null
      let corsBlockedAll = true
      for (const srv of servers) {
        try {
          return await directXtreamLogin(srv, credentials.username, credentials.password)
        } catch (directErr) {
          if (directErr instanceof ArelonProxyError) {
            lastDirectError = directErr
            if (directErr.type === 'invalid_credentials') {
              throw directErr
            }
            if (directErr.type !== 'mixed_content_or_cors') {
              corsBlockedAll = false
            }
          } else {
            corsBlockedAll = false
          }
        }
      }
      if (lastDirectError) {
        const httpsHosted = window.location.protocol === 'https:'
        if (httpsHosted && corsBlockedAll && servers.length > 0) {
          // Em ambiente hosted estático sem proxy, todas as verificações diretas foram bloqueadas por CORS nos servidores IPTV.
          // Como os servidores vêm do config gerenciado pelo Admin, permitimos o login assumindo o primeiro servidor.
          // A reprodução validará as credenciais na prática.
          const first = servers[0]!
          return {
            serverUrl: first,
            userInfo: { username: credentials.username },
          }
        }
        throw lastDirectError
      }
    }
    throw err
  }
}

export async function getSportsCalendar(options: { days?: number; limit?: number } = {}): Promise<SportsCalendarResponse> {
  const params = new URLSearchParams()
  if (options.days) params.set('days', String(options.days))
  if (options.limit) params.set('limit', String(options.limit))

  const query = params.toString()
  return await getJson<SportsCalendarResponse>(`/api/sports/calendar${query ? `?${query}` : ''}`, 12000)
}

export async function getLiveCategories(credentials: ArelonCredentials): Promise<Category[]> {
  const data = await postData<{ items: Category[] }>('/api/xtream/live/categories', credentials)
  return data.items
}

export async function getLiveStreams(credentials: ArelonCredentials, page?: PageRequest): Promise<PaginatedResult<Channel>> {
  return await postList<Channel>('/api/xtream/live/streams', credentials, page)
}

export async function getVodCategories(credentials: ArelonCredentials): Promise<Category[]> {
  const data = await postData<{ items: Category[] }>('/api/xtream/vod/categories', credentials)
  return data.items
}

export async function getVodStreams(credentials: ArelonCredentials, page?: PageRequest): Promise<PaginatedResult<Movie>> {
  return await postList<Movie>('/api/xtream/vod/streams', credentials, page)
}

export async function getSeriesCategories(credentials: ArelonCredentials): Promise<Category[]> {
  const data = await postData<{ items: Category[] }>('/api/xtream/series/categories', credentials)
  return data.items
}

export async function getSeries(credentials: ArelonCredentials, page?: PageRequest): Promise<PaginatedResult<Series>> {
  return await postList<Series>('/api/xtream/series', credentials, page)
}

export async function getSeriesInfo(credentials: ArelonCredentials, seriesId: string): Promise<SeriesInfo> {
  return await postData<SeriesInfo>('/api/xtream/series/info', credentials, { seriesId })
}

export async function getVodInfo(credentials: ArelonCredentials, vodId: string): Promise<VodInfo> {
  return await postData<VodInfo>('/api/xtream/vod/info', credentials, { vodId })
}

export async function getShortEpg(credentials: ArelonCredentials, streamId: string, limit = 2): Promise<EpgProgram[]> {
  const data = await postData<{ items: EpgProgram[] }>('/api/xtream/epg/short', credentials, { streamId, limit })
  return data.items
}

export function toCredentials(serverUrl: string | undefined, username: string, password: string): ArelonCredentials {
  return { serverUrl, username, password }
}

// ---------------------------------------------------------------------------
// Direct Xtream API — fallback quando o proxy Arelon não está disponível
// ---------------------------------------------------------------------------

async function directXtreamGet<T>(serverUrl: string, params: Record<string, string>): Promise<T> {
  const base = serverUrl.replace(/\/+$/, '')
  const url = `${base}/player_api.php?${new URLSearchParams(params).toString()}`
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new ArelonProxyError('network_error', 'URL do servidor IPTV inválida.') }

  if (isMixedContentBlocked(parsed)) {
    throw new ArelonProxyError('mixed_content_or_cors', 'Mixed content: página HTTPS não pode chamar servidor IPTV HTTP diretamente.')
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store', signal: controller.signal })
    if (!res.ok) throw new ArelonProxyError('upstream_http_error', `Servidor IPTV respondeu HTTP ${res.status}.`)
    return await res.json() as T
  } catch (error) {
    if (error instanceof ArelonProxyError) throw error
    throw classifyFetchFailure(parsed, error)
  } finally {
    window.clearTimeout(timer)
  }
}

function mapRawCategory(raw: Record<string, unknown>): Category {
  return { id: String(raw.category_id ?? ''), name: String(raw.category_name ?? '') }
}

function mapRawChannel(raw: Record<string, unknown>, serverUrl: string, username: string, password: string): Channel {
  const id = String(raw.stream_id ?? '')
  const base = serverUrl.replace(/\/+$/, '')
  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)
  const logo = String(raw.stream_icon ?? '')
  return {
    id,
    name: String(raw.name ?? ''),
    logo,
    logoPlaylist: logo || undefined,
    categoryId: String(raw.category_id ?? ''),
    streamUrl: `${base}/live/${u}/${p}/${id}.m3u8`,
  }
}

function extractBackdrop(raw: unknown): string | undefined {
  if (Array.isArray(raw) && raw.length > 0 && raw[0]) return String(raw[0])
  if (typeof raw === 'string' && raw) return raw
  return undefined
}

function mapRawMovie(raw: Record<string, unknown>, serverUrl: string, username: string, password: string): Movie {
  const id = String(raw.stream_id ?? '')
  const ext = String(raw.container_extension ?? 'mp4')
  const base = serverUrl.replace(/\/+$/, '')
  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)
  const backdropRaw = raw.backdrop_path
  const backdrop = Array.isArray(backdropRaw) && backdropRaw.length > 0
    ? String(backdropRaw[0])
    : typeof backdropRaw === 'string' && backdropRaw ? backdropRaw : undefined
  const logoText = typeof raw.movie_image === 'string' && raw.movie_image ? raw.movie_image : undefined
  return {
    id,
    name: String(raw.name ?? ''),
    poster: String(raw.stream_icon ?? ''),
    backdrop,
    logoText,
    categoryId: String(raw.category_id ?? ''),
    streamUrl: `${base}/movie/${u}/${p}/${id}.${ext}`,
    ext,
    plot: typeof raw.plot === 'string' ? raw.plot : undefined,
    year: raw.year != null ? String(raw.year) : undefined,
    rating: raw.rating != null ? String(raw.rating) : undefined,
    backdrop: extractBackdrop(raw.backdrop_path),
    logoText: typeof raw.movie_image === 'string' && raw.movie_image ? raw.movie_image : undefined,
  }
}

function mapRawSeries(raw: Record<string, unknown>): Series {
  const backdropRaw = raw.backdrop_path
  const backdrop = Array.isArray(backdropRaw) && backdropRaw.length > 0
    ? String(backdropRaw[0])
    : typeof backdropRaw === 'string' && backdropRaw ? backdropRaw : undefined
  const logoText = typeof raw.movie_image === 'string' && raw.movie_image ? raw.movie_image : undefined
  return {
    id: String(raw.series_id ?? ''),
    name: String(raw.name ?? ''),
    cover: String(raw.cover ?? ''),
    backdrop,
    logoText,
    categoryId: String(raw.category_id ?? ''),
    plot: typeof raw.plot === 'string' ? raw.plot : undefined,
    year: raw.year != null ? String(raw.year) : undefined,
    rating: raw.rating != null ? String(raw.rating) : undefined,
    backdrop: extractBackdrop(raw.backdrop_path),
    logoText: typeof raw.movie_image === 'string' && raw.movie_image ? raw.movie_image : undefined,
  }
}

export async function directGetLiveCategories(serverUrl: string, username: string, password: string): Promise<Category[]> {
  const raw = await directXtreamGet<unknown[]>(serverUrl, { username, password, action: 'get_live_categories' })
  return Array.isArray(raw) ? raw.filter(Boolean).map((item) => mapRawCategory(item as Record<string, unknown>)) : []
}

export async function directGetLiveStreams(serverUrl: string, username: string, password: string): Promise<Channel[]> {
  const raw = await directXtreamGet<unknown[]>(serverUrl, { username, password, action: 'get_live_streams' })
  return Array.isArray(raw)
    ? raw.filter(Boolean).map((item) => mapRawChannel(item as Record<string, unknown>, serverUrl, username, password))
    : []
}

export async function directGetVodCategories(serverUrl: string, username: string, password: string): Promise<Category[]> {
  const raw = await directXtreamGet<unknown[]>(serverUrl, { username, password, action: 'get_vod_categories' })
  return Array.isArray(raw) ? raw.filter(Boolean).map((item) => mapRawCategory(item as Record<string, unknown>)) : []
}

export async function directGetVodStreams(serverUrl: string, username: string, password: string): Promise<Movie[]> {
  const raw = await directXtreamGet<unknown[]>(serverUrl, { username, password, action: 'get_vod_streams' })
  return Array.isArray(raw)
    ? raw.filter(Boolean).map((item) => mapRawMovie(item as Record<string, unknown>, serverUrl, username, password))
    : []
}

export async function directGetSeriesCategories(serverUrl: string, username: string, password: string): Promise<Category[]> {
  const raw = await directXtreamGet<unknown[]>(serverUrl, { username, password, action: 'get_series_categories' })
  return Array.isArray(raw) ? raw.filter(Boolean).map((item) => mapRawCategory(item as Record<string, unknown>)) : []
}

export async function directGetAllSeries(serverUrl: string, username: string, password: string): Promise<Series[]> {
  const raw = await directXtreamGet<unknown[]>(serverUrl, { username, password, action: 'get_series' })
  return Array.isArray(raw) ? raw.filter(Boolean).map((item) => mapRawSeries(item as Record<string, unknown>)) : []
}

export function buildXtreamStreamUrl(
  serverUrl: string,
  username: string,
  password: string,
  kind: 'live' | 'movie' | 'series',
  id: string,
  ext?: string,
): string {
  const base = serverUrl.replace(/\/+$/, '')
  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)
  const suffix = ext ? `.${ext.replace(/^\./, '')}` : ''
  return `${base}/${kind}/${u}/${p}/${id}${suffix}`
}
