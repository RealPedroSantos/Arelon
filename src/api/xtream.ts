import type { Category, Channel, Episode, Movie, Series } from '../store'
import {
  ArelonProxyError,
  buildXtreamStreamUrl,
  directGetAllSeries,
  directGetLiveCategories,
  directGetLiveStreams,
  directGetSeriesCategories,
  directGetVodCategories,
  directGetVodStreams,
  getLiveCategories as proxyLiveCategories,
  getLiveStreams,
  getSeries as proxySeries,
  getSeriesCategories as proxySeriesCategories,
  getSeriesInfo as proxySeriesInfo,
  getShortEpg as proxyShortEpg,
  getVodCategories,
  getVodInfo as proxyVodInfo,
  getVodStreams,
  login,
  toCredentials,
  type ArelonApiErrorType,
  type EpgProgram,
  type PageRequest,
  type PaginatedResult,
  type SeriesInfo,
  type VodInfo,
} from './arelonProxy'

export {
  ArelonProxyError,
  type ArelonApiErrorType,
  type EpgProgram,
  type PageRequest,
  type PaginatedResult,
  type SeriesInfo,
  type VodInfo,
}

function credentials(serverUrl: string | undefined, username: string, password: string) {
  return toCredentials(serverUrl, username, password)
}

export function getXtreamErrorMessage(error: unknown): string {
  if (error instanceof ArelonProxyError) {
    switch (error.type) {
      case 'invalid_credentials':
        return 'Usuario ou senha invalidos.'
      case 'network_error':
        if (/servidor IPTV/i.test(error.message)) {
          return 'Falha de rede no servidor IPTV. Tente novamente ou valide o servidor no Admin.'
        }
        return 'API Arelon indisponivel. No modo TV local, rode npm run dev no Mac e abra pelo IP da rede.'
      case 'timeout':
        return 'Tempo esgotado ao conectar no servidor IPTV.'
      case 'upstream_http_error':
        return 'O servidor IPTV respondeu com erro HTTP.'
      case 'invalid_json':
        return 'O servidor IPTV retornou uma resposta invalida.'
      case 'mixed_content_or_cors':
        return 'API bloqueada por CORS ou mixed content. Use o modo TV local ou uma API HTTPS ativa.'
      default:
        return error.message || 'Erro inesperado.'
    }
  }

  if (error instanceof Error && error.message) return error.message
  return 'Erro inesperado.'
}

/** Testa credenciais via API Arelon e retorna o primeiro servidor IPTV valido. */
export async function authenticate(username: string, password: string): Promise<string | null> {
  try {
    const result = await login({ username, password })
    return result.serverUrl || null
  } catch (error) {
    if (error instanceof ArelonProxyError && error.type === 'invalid_credentials') {
      return null
    }
    throw error
  }
}

export async function checkServerConnection(
  serverUrl: string,
  username: string,
  password: string,
): Promise<boolean> {
  try {
    await login(credentials(serverUrl, username, password))
    return true
  } catch {
    return false
  }
}

export type ServerHealth = {
  authOk: boolean
  liveCategories: number
  vodCategories: number
  seriesCategories: number
  epgOk: boolean
  message?: string
}

export async function checkServerHealth(
  serverUrl: string,
  username: string,
  password: string,
): Promise<ServerHealth> {
  try {
    await login(credentials(serverUrl, username, password))
  } catch (error) {
    const isCorsBlocked = error instanceof ArelonProxyError && error.type === 'mixed_content_or_cors'
    return {
      authOk: isCorsBlocked, // Em modo hosted estático (GitHub Pages sem proxy Arelon público), não conseguimos verificar via rede mas o servidor está listado no Admin. Assumimos OK para permitir uso do painel.
      liveCategories: 0,
      vodCategories: 0,
      seriesCategories: 0,
      epgOk: false,
      message: isCorsBlocked
        ? 'Verificação limitada (sem proxy Arelon HTTPS configurado). Servidor listado no config compartilhado.'
        : getXtreamErrorMessage(error),
    }
  }

  let liveCategories: Category[] = []
  let vodCategories: Category[] = []
  let seriesCategories: Category[] = []
  let epgOk = false

  try {
    const [liveCatsRes, vodCatsRes, seriesCatsRes] = await Promise.allSettled([
      getLiveCategories(serverUrl, username, password),
      getMovieCategories(serverUrl, username, password),
      getSeriesCategories(serverUrl, username, password),
    ])

    liveCategories = liveCatsRes.status === 'fulfilled' ? liveCatsRes.value : []
    vodCategories = vodCatsRes.status === 'fulfilled' ? vodCatsRes.value : []
    seriesCategories = seriesCatsRes.status === 'fulfilled' ? seriesCatsRes.value : []

    const firstCatId = liveCategories[0]?.id
    if (firstCatId) {
      const page = await getLiveChannelsPage(serverUrl, username, password, { categoryId: firstCatId, limit: 1 })
      const firstChannel = page.items[0]
      if (firstChannel) {
        await getShortEpg(serverUrl, username, password, firstChannel.id, 2)
        epgOk = true
      }
    }
  } catch (error) {
    return {
      authOk: true,
      liveCategories: liveCategories.length,
      vodCategories: vodCategories.length,
      seriesCategories: seriesCategories.length,
      epgOk,
      message: getXtreamErrorMessage(error),
    }
  }

  return {
    authOk: true,
    liveCategories: liveCategories.length,
    vodCategories: vodCategories.length,
    seriesCategories: seriesCategories.length,
    epgOk,
  }
}

export async function getShortEpg(
  serverUrl: string,
  username: string,
  password: string,
  streamId: string,
  limit = 2,
): Promise<EpgProgram[]> {
  try {
    return await proxyShortEpg(credentials(serverUrl, username, password), streamId, limit)
  } catch {
    return []
  }
}

function isProxyUnavailable(e: unknown): boolean {
  // Qualquer falha do proxy que NÃO seja credencial inválida deve permitir
  // o fallback direto ao Xtream (timeout, HTTP 5xx, JSON inválido, CORS, rede).
  return e instanceof ArelonProxyError && e.type !== 'invalid_credentials'
}

export async function getLiveCategories(serverUrl: string, username: string, password: string): Promise<Category[]> {
  try {
    return await proxyLiveCategories(credentials(serverUrl, username, password))
  } catch (e) {
    if (isProxyUnavailable(e)) {
      try { return await directGetLiveCategories(serverUrl, username, password) } catch { return [] }
    }
    throw e
  }
}

export async function getLiveChannelsPage(
  serverUrl: string,
  username: string,
  password: string,
  options: PageRequest = {},
): Promise<PaginatedResult<Channel>> {
  try {
    return await getLiveStreams(credentials(serverUrl, username, password), { page: 1, limit: 50, ...options })
  } catch (e) {
    if (isProxyUnavailable(e)) {
      try {
        const all = await directGetLiveStreams(serverUrl, username, password)
        const filtered = options.categoryId ? all.filter((c) => c.categoryId === options.categoryId) : all
        return { page: 1, limit: filtered.length, total: filtered.length, hasMore: false, items: filtered }
      } catch { return { page: 1, limit: 0, total: 0, hasMore: false, items: [] } }
    }
    throw e
  }
}

export async function getLiveChannels(
  serverUrl: string,
  username: string,
  password: string,
  categoryId?: string,
): Promise<Channel[]> {
  const page = await getLiveChannelsPage(serverUrl, username, password, { categoryId })
  return page.items
}

export async function getMovieCategories(serverUrl: string, username: string, password: string): Promise<Category[]> {
  try {
    return await getVodCategories(credentials(serverUrl, username, password))
  } catch (e) {
    if (isProxyUnavailable(e)) {
      try { return await directGetVodCategories(serverUrl, username, password) } catch { return [] }
    }
    throw e
  }
}

export async function getMoviesPage(
  serverUrl: string,
  username: string,
  password: string,
  options: PageRequest = {},
): Promise<PaginatedResult<Movie>> {
  try {
    return await getVodStreams(credentials(serverUrl, username, password), { page: 1, limit: 50, ...options })
  } catch (e) {
    if (isProxyUnavailable(e)) {
      try {
        const all = await directGetVodStreams(serverUrl, username, password)
        const filtered = options.categoryId ? all.filter((m) => m.categoryId === options.categoryId) : all
        return { page: 1, limit: filtered.length, total: filtered.length, hasMore: false, items: filtered }
      } catch { return { page: 1, limit: 0, total: 0, hasMore: false, items: [] } }
    }
    throw e
  }
}

export async function getMovies(
  serverUrl: string,
  username: string,
  password: string,
  categoryId?: string,
): Promise<Movie[]> {
  const page = await getMoviesPage(serverUrl, username, password, { categoryId })
  return page.items
}

export async function getSeriesCategories(serverUrl: string, username: string, password: string): Promise<Category[]> {
  try {
    return await proxySeriesCategories(credentials(serverUrl, username, password))
  } catch (e) {
    if (isProxyUnavailable(e)) {
      try { return await directGetSeriesCategories(serverUrl, username, password) } catch { return [] }
    }
    throw e
  }
}

export async function getSeriesPage(
  serverUrl: string,
  username: string,
  password: string,
  options: PageRequest = {},
): Promise<PaginatedResult<Series>> {
  try {
    return await proxySeries(credentials(serverUrl, username, password), { page: 1, limit: 50, ...options })
  } catch (e) {
    if (isProxyUnavailable(e)) {
      try {
        const all = await directGetAllSeries(serverUrl, username, password)
        const filtered = options.categoryId ? all.filter((s) => s.categoryId === options.categoryId) : all
        return { page: 1, limit: filtered.length, total: filtered.length, hasMore: false, items: filtered }
      } catch { return { page: 1, limit: 0, total: 0, hasMore: false, items: [] } }
    }
    throw e
  }
}

export async function getAllSeries(
  serverUrl: string,
  username: string,
  password: string,
  categoryId?: string,
): Promise<Series[]> {
  const page = await getSeriesPage(serverUrl, username, password, { categoryId })
  return page.items
}

export async function getSeriesEpisodes(
  serverUrl: string,
  username: string,
  password: string,
  seriesId: string,
): Promise<Record<string, Episode[]>> {
  const raw = await proxySeriesInfo(credentials(serverUrl, username, password), seriesId)
  return raw.episodes ?? {}
}

export function episodeUrl(serverUrl: string, username: string, password: string, episodeId: string, ext: string): string {
  return buildXtreamStreamUrl(serverUrl, username, password, 'series', episodeId, ext || 'mp4')
}

export async function getVodInfo(
  serverUrl: string,
  username: string,
  password: string,
  vodId: string,
): Promise<VodInfo> {
  return await proxyVodInfo(credentials(serverUrl, username, password), vodId)
}

export async function getSeriesInfo(
  serverUrl: string,
  username: string,
  password: string,
  seriesId: string,
): Promise<SeriesInfo> {
  return await proxySeriesInfo(credentials(serverUrl, username, password), seriesId)
}
