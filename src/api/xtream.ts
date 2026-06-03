import type { Category, Channel, Episode, Movie, Series } from '../store'
import {
  ArelonProxyError,
  buildXtreamStreamUrl,
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
        return 'Erro de rede ao conectar na API Arelon. Verifique internet, DNS ou servidor indisponivel.'
      case 'timeout':
        return 'Tempo esgotado ao conectar no servidor IPTV.'
      case 'upstream_http_error':
        return 'O servidor IPTV respondeu com erro HTTP.'
      case 'invalid_json':
        return 'O servidor IPTV retornou uma resposta invalida.'
      case 'mixed_content_or_cors':
        return 'O navegador bloqueou a chamada por CORS ou mixed content. Use a API HTTPS da Arelon.'
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
  _timeoutMs = 8000,
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
    return {
      authOk: false,
      liveCategories: 0,
      vodCategories: 0,
      seriesCategories: 0,
      epgOk: false,
      message: getXtreamErrorMessage(error),
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

export async function getLiveCategories(serverUrl: string, username: string, password: string): Promise<Category[]> {
  return await proxyLiveCategories(credentials(serverUrl, username, password))
}

export async function getLiveChannelsPage(
  serverUrl: string,
  username: string,
  password: string,
  options: PageRequest = {},
): Promise<PaginatedResult<Channel>> {
  return await getLiveStreams(credentials(serverUrl, username, password), {
    page: 1,
    limit: 50,
    ...options,
  })
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
  return await getVodCategories(credentials(serverUrl, username, password))
}

export async function getMoviesPage(
  serverUrl: string,
  username: string,
  password: string,
  options: PageRequest = {},
): Promise<PaginatedResult<Movie>> {
  return await getVodStreams(credentials(serverUrl, username, password), {
    page: 1,
    limit: 50,
    ...options,
  })
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
  return await proxySeriesCategories(credentials(serverUrl, username, password))
}

export async function getSeriesPage(
  serverUrl: string,
  username: string,
  password: string,
  options: PageRequest = {},
): Promise<PaginatedResult<Series>> {
  return await proxySeries(credentials(serverUrl, username, password), {
    page: 1,
    limit: 50,
    ...options,
  })
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
