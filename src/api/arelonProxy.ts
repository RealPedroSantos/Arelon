import type { Category, Channel, Episode, Movie, Series } from '../store'

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

const DEFAULT_API_BASE_URL = 'https://api.arelon.com.br'
const DEFAULT_TIMEOUT_MS = 15000

export class ArelonProxyError extends Error {
  readonly type: ArelonApiErrorType

  constructor(type: ArelonApiErrorType, message: string) {
    super(message)
    this.name = 'ArelonProxyError'
    this.type = type
  }
}

function getApiBaseUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>
  return (env.VITE_ARELON_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
}

function resolveApiUrl(path: string): URL {
  const base = getApiBaseUrl()
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
      'Falha ao acessar a API Arelon. Verifique CORS, DNS ou certificado HTTPS de https://api.arelon.com.br.',
    )
  }

  return new ArelonProxyError('network_error', 'Falha de rede ao acessar a API Arelon.')
}

async function postJson<T>(path: string, body: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const url = resolveApiUrl(path)
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
      throw new ArelonProxyError(payload.type, payload.message)
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

export async function login(credentials: ArelonCredentials): Promise<LoginResult> {
  return await postData<LoginResult>('/api/xtream/login', credentials)
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
