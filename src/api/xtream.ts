import { getServerUrls } from '../lib/pool'
import type { Category, Channel, Movie, Series, Episode } from '../store'

function base(url: string): string {
  return url.replace(/\/$/, '')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class NonRetryableRequestError extends Error {}

async function get<T>(url: string): Promise<T> {
  const retryDelaysMs = [700, 1600]
  let lastError: unknown

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const error = new Error(`HTTP ${res.status}`)
        if (res.status !== 429 && res.status < 500) {
          throw new NonRetryableRequestError(error.message)
        }
        throw error
      }

      const text = await res.text()
      try {
        return JSON.parse(text) as T
      } catch {
        throw new NonRetryableRequestError('Resposta inválida do servidor')
      }
    } catch (error) {
      if (error instanceof NonRetryableRequestError) {
        throw new Error(error.message, { cause: error })
      }
      lastError = error
      const retryDelay = retryDelaysMs[attempt]
      if (retryDelay === undefined) break
      await delay(retryDelay)
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(String(lastError))
}

function apiUrl(serverUrl: string, username: string, password: string, action: string, extra = ''): string {
  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)
  return `${base(serverUrl)}/player_api.php?username=${u}&password=${p}&action=${action}${extra}`
}

/** Decodifica base64 (UTF-8 seguro) — títulos de EPG vêm em base64. */
function decodeBase64Utf8(s: string): string {
  if (!s) return ''
  try {
    const bin = atob(s)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes).trim()
  } catch {
    return s
  }
}

export interface EpgProgram {
  title: string
  start: string
  end: string
}

/** Programa atual/próximos de um canal (get_short_epg). Retorna [] se o provedor não tiver EPG. */
export async function getShortEpg(
  serverUrl: string,
  username: string,
  password: string,
  streamId: string,
  limit = 2,
): Promise<EpgProgram[]> {
  try {
    const raw = await get<{ epg_listings?: Array<{ title?: string; start?: string; end?: string }> }>(
      apiUrl(serverUrl, username, password, 'get_short_epg', `&stream_id=${streamId}&limit=${limit}`),
    )
    const list = raw?.epg_listings
    if (!Array.isArray(list)) return []
    return list.map((e) => ({
      title: decodeBase64Utf8(e.title ?? ''),
      start: e.start ?? '',
      end: e.end ?? '',
    }))
  } catch {
    return []
  }
}

/** Testa credenciais contra todos os servidores do pool, retorna o primeiro que funcionar */
export async function authenticate(username: string, password: string): Promise<string | null> {
  for (const serverUrl of getServerUrls()) {
    try {
      const u = encodeURIComponent(username)
      const p = encodeURIComponent(password)
      const data = await get<{ user_info?: { auth: number | string } }>(
        `${base(serverUrl)}/player_api.php?username=${u}&password=${p}`,
      )
      const auth = data?.user_info?.auth
      if (auth === 1 || auth === '1') return serverUrl
    } catch {
      // servidor indisponível, tenta o próximo
    }
  }
  return null
}

export async function checkServerConnection(
  serverUrl: string,
  username: string,
  password: string,
  timeoutMs = 8000,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const u = encodeURIComponent(username)
    const p = encodeURIComponent(password)
    const res = await fetch(`${base(serverUrl)}/player_api.php?username=${u}&password=${p}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) return false

    const data = (await res.json()) as { user_info?: { auth?: number | string } }
    const auth = data?.user_info?.auth
    return auth === 1 || auth === '1'
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
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
  const authOk = await checkServerConnection(serverUrl, username, password)
  if (!authOk) {
    return {
      authOk: false,
      liveCategories: 0,
      vodCategories: 0,
      seriesCategories: 0,
      epgOk: false,
      message: 'Falha na autenticação',
    }
  }

  let liveCategories = 0
  let vodCategories = 0
  let seriesCategories = 0
  let epgOk = false

  try {
    const [liveCatsRes, vodCatsRes, seriesCatsRes] = await Promise.allSettled([
      getLiveCategories(serverUrl, username, password),
      getMovieCategories(serverUrl, username, password),
      getSeriesCategories(serverUrl, username, password),
    ])

    liveCategories = liveCatsRes.status === 'fulfilled' ? liveCatsRes.value.length : 0
    vodCategories = vodCatsRes.status === 'fulfilled' ? vodCatsRes.value.length : 0
    seriesCategories = seriesCatsRes.status === 'fulfilled' ? seriesCatsRes.value.length : 0

    // Testa EPG usando a primeira categoria de ao vivo (leve)
    if (liveCatsRes.status === 'fulfilled' && liveCatsRes.value.length > 0) {
      const firstCatId = liveCatsRes.value[0]?.id
      if (firstCatId) {
        try {
          const streams = await getLiveChannels(serverUrl, username, password, firstCatId)
          if (streams.length > 0 && streams[0]) {
            await getShortEpg(serverUrl, username, password, streams[0].id, 2)
            epgOk = true
          }
        } catch {
          epgOk = false
        }
      }
    }
  } catch (err: any) {
    return {
      authOk: true,
      liveCategories,
      vodCategories,
      seriesCategories,
      epgOk,
      message: err?.message || 'Erro ao carregar categorias/EPG',
    }
  }

  return {
    authOk: true,
    liveCategories,
    vodCategories,
    seriesCategories,
    epgOk,
  }
}

export async function getLiveCategories(serverUrl: string, username: string, password: string): Promise<Category[]> {
  const raw = await get<Array<{ category_id: string; category_name: string }>>(
    apiUrl(serverUrl, username, password, 'get_live_categories'),
  )
  return (Array.isArray(raw) ? raw : []).map((c) => ({ id: c.category_id, name: c.category_name }))
}

export async function getLiveChannels(
  serverUrl: string,
  username: string,
  password: string,
  categoryId?: string,
): Promise<Channel[]> {
  const extra = categoryId ? `&category_id=${categoryId}` : ''
  const raw = await get<Array<{ stream_id: number; name: string; stream_icon: string; category_id: string; logo_cdn?: string; logo_placeholder?: string }>>(
    apiUrl(serverUrl, username, password, 'get_live_streams', extra),
  )

  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)

  const qualityRegex = /\b(4K|FHD|HD|SD|1080p|720p)\b/i
  const grouped = new Map<string, Channel>()
  
  for (const c of (Array.isArray(raw) ? raw : [])) {
    const rawName = c.name.trim()
    
    const match = rawName.match(qualityRegex)
    const quality = match ? (match[1] || '').toUpperCase() : 'DEFAULT'
    
    const baseName = rawName
      .replace(/\b(4K|FHD|HD|SD|1080p|720p)\b/ig, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\|.*?\|/g, '')
      .replace(/[-|]/g, '')
      .trim()
      .replace(/\s+/g, ' ') || rawName
      
    const key = baseName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      
    const streamUrl = `${base(serverUrl)}/live/${u}/${p}/${c.stream_id}.m3u8`
    const logoCdn = c.logo_cdn?.trim() ?? ''
    const logoPlaylist = c.stream_icon?.trim() ?? ''
    const logoPlaceholder = c.logo_placeholder?.trim() ?? ''
    
    // Check if group exists
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: String(c.stream_id),
        name: baseName, // clean name
        logo: logoCdn || logoPlaylist,
        logoCdn,
        logoPlaylist,
        logoPlaceholder,
        categoryId: String(c.category_id),
        streamUrl: streamUrl,
        streams: { [quality]: streamUrl }
      })
    } else {
      const existing = grouped.get(key)!
      
      // Atualiza o nome de exibição para formato misto se o existente for totalmente em maiúsculas (melhoria estética)
      const isAllCaps = (str: string) => str === str.toUpperCase() && str !== str.toLowerCase()
      if (isAllCaps(existing.name) && !isAllCaps(baseName)) {
        existing.name = baseName
      }
      
      // Upgrade default streamUrl if we find a better quality and currently have DEFAULT or lower
      const qPriority: Record<string, number> = { 'DEFAULT': 0, 'SD': 1, 'HD': 2, 'FHD': 3, '4K': 4 }
      
      // Determine current top quality
      const existingQualities = Object.keys(existing.streams || {})
      const topExistingQuality = existingQualities.sort((a, b) => (qPriority[b] || 0) - (qPriority[a] || 0))[0] || 'DEFAULT'
      
      if ((qPriority[quality] || 0) > (qPriority[topExistingQuality] || 0)) {
        existing.streamUrl = streamUrl // upgrade default fallback
        existing.id = String(c.stream_id) // upgrade ID to match
      }
      
      if (!existing.streams) existing.streams = {}
      existing.streams[quality] = streamUrl

      if (!existing.logoCdn && logoCdn) {
        existing.logoCdn = logoCdn
        existing.logo = logoCdn
      }
      if (!existing.logoPlaylist && logoPlaylist) existing.logoPlaylist = logoPlaylist
      if (!existing.logoPlaceholder && logoPlaceholder) existing.logoPlaceholder = logoPlaceholder
      if (!existing.logo && (existing.logoCdn || existing.logoPlaylist)) {
        existing.logo = existing.logoCdn || existing.logoPlaylist || ''
      }
    }
  }

  return Array.from(grouped.values())
}

export async function getMovieCategories(serverUrl: string, username: string, password: string): Promise<Category[]> {
  const raw = await get<Array<{ category_id: string; category_name: string }>>(
    apiUrl(serverUrl, username, password, 'get_vod_categories'),
  )
  return (Array.isArray(raw) ? raw : []).map((c) => ({ id: c.category_id, name: c.category_name }))
}

export async function getMovies(
  serverUrl: string,
  username: string,
  password: string,
  categoryId?: string,
): Promise<Movie[]> {
  const extra = categoryId ? `&category_id=${categoryId}` : ''
  const raw = await get<
    Array<{
      stream_id: number
      name: string
      stream_icon: string
      category_id: string
      container_extension: string
      plot?: string
      year?: string
      rating?: string
    }>
  >(apiUrl(serverUrl, username, password, 'get_vod_streams', extra))

  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)
  const ext = (e: string) => e || 'mp4'

  return (Array.isArray(raw) ? raw : []).map((m) => ({
    id: String(m.stream_id),
    name: m.name,
    poster: m.stream_icon ?? '',
    categoryId: String(m.category_id),
    ext: ext(m.container_extension),
    plot: m.plot,
    year: m.year,
    rating: m.rating,
    streamUrl: `${base(serverUrl)}/movie/${u}/${p}/${m.stream_id}.${ext(m.container_extension)}`,
  }))
}

export async function getSeriesCategories(serverUrl: string, username: string, password: string): Promise<Category[]> {
  const raw = await get<Array<{ category_id: string; category_name: string }>>(
    apiUrl(serverUrl, username, password, 'get_series_categories'),
  )
  return (Array.isArray(raw) ? raw : []).map((c) => ({ id: c.category_id, name: c.category_name }))
}

export async function getAllSeries(
  serverUrl: string,
  username: string,
  password: string,
  categoryId?: string,
): Promise<Series[]> {
  const extra = categoryId ? `&category_id=${categoryId}` : ''
  const raw = await get<
    Array<{ series_id: number; name: string; cover: string; category_id: string; plot?: string; year?: string; rating?: string }>
  >(apiUrl(serverUrl, username, password, 'get_series', extra))

  return (Array.isArray(raw) ? raw : []).map((s) => ({
    id: String(s.series_id),
    name: s.name,
    cover: s.cover ?? '',
    categoryId: String(s.category_id),
    plot: s.plot,
    year: s.year,
    rating: s.rating,
  }))
}

export async function getSeriesEpisodes(
  serverUrl: string,
  username: string,
  password: string,
  seriesId: string,
): Promise<Record<string, Episode[]>> {
  const raw = await get<{
    episodes?: Record<string, Array<any>>
  }>(apiUrl(serverUrl, username, password, 'get_series_info', `&series_id=${seriesId}`))

  const eps = raw?.episodes ?? {}
  const result: Record<string, Episode[]> = {}
  for (const [season, list] of Object.entries(eps)) {
    result[season] = (Array.isArray(list) ? list : []).map((e: any) => {
      const info = e.info || {}
      // Common locations for episode thumbnail in Xtream responses
      const image =
        e.movie_image ||
        e.cover_big ||
        e.cover ||
        info.movie_image ||
        info.cover_big ||
        info.cover ||
        ''

      return {
        id: e.id,
        title: e.title || `Episódio ${e.episode_num}`,
        episodeNum: e.episode_num,
        season: e.season,
        ext: e.container_extension ?? 'mp4',
        image: image || undefined,
      }
    })
  }
  return result
}

export function episodeUrl(serverUrl: string, username: string, password: string, episodeId: string, ext: string): string {
  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)
  return `${base(serverUrl)}/series/${u}/${p}/${episodeId}.${ext}`
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
    // Rich fields often present in Xtream
    movie_image?: string
    backdrop_path?: string[] | string
    trailer?: string
    youtube_trailer?: string
    cover?: string
  }
}

export async function getVodInfo(
  serverUrl: string,
  username: string,
  password: string,
  vodId: string
): Promise<VodInfo> {
  return get<VodInfo>(apiUrl(serverUrl, username, password, 'get_vod_info', `&vod_id=${vodId}`))
}

export interface SeriesInfo {
  info: {
    director?: string
    cast?: string
    plot?: string
    releaseDate?: string
    year?: string
    rating?: string
    // Rich fields often present in Xtream
    movie_image?: string
    backdrop_path?: string[] | string
    trailer?: string
    youtube_trailer?: string
    cover?: string
  }
}

export async function getSeriesInfo(
  serverUrl: string,
  username: string,
  password: string,
  seriesId: string
): Promise<SeriesInfo> {
  return get<SeriesInfo>(apiUrl(serverUrl, username, password, 'get_series_info', `&series_id=${seriesId}`))
}
