// Pool de servidores IPTV — distribui streams entre múltiplos CDNs.
// A lista começa com defaults, mas pode ser substituída pelo painel Master.

export const DEFAULT_SERVER_URLS = [
  'http://fravub.online',
  'http://mxcdnr.xyz:80',
  'http://glimen.online',
  'http://resfcdn.online:80',
  'http://ultraviracdn.online:80',
  'http://purolab.online:80',
]

export const SERVER_URLS = [...DEFAULT_SERVER_URLS]

// Contagem de streams ativos por servidor (índice do array)
const usage = new Array<number>(SERVER_URLS.length).fill(0)

export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `http://${trimmed}`
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const url of urls) {
    const next = normalizeServerUrl(url)
    if (!next || seen.has(next)) continue
    seen.add(next)
    normalized.push(next)
  }

  return normalized
}

export function setServerUrls(urls: string[]): void {
  const nextUrls = uniqueUrls(urls)
  SERVER_URLS.splice(0, SERVER_URLS.length, ...(nextUrls.length > 0 ? nextUrls : DEFAULT_SERVER_URLS))
  usage.splice(0, usage.length, ...new Array<number>(SERVER_URLS.length).fill(0))
}

export function getServerUrls(): string[] {
  return [...SERVER_URLS]
}

export function getServerCount(): number {
  return SERVER_URLS.length
}

/** Pega o servidor menos carregado, excluindo os informados */
export function pickServer(exclude: string[] = []): string {
  let best = -1
  let bestCount = Infinity

  for (let i = 0; i < SERVER_URLS.length; i++) {
    const url = SERVER_URLS[i]!
    if (exclude.includes(url)) continue
    if (usage[i]! < bestCount) {
      bestCount = usage[i]!
      best = i
    }
  }

  if (best === -1) {
    // Todos excluídos — usa o menos carregado sem restrição
    let fallback = 0
    let fallbackCount = Infinity
    for (let i = 0; i < SERVER_URLS.length; i++) {
      if (usage[i]! < fallbackCount) {
        fallbackCount = usage[i]!
        fallback = i
      }
    }
    best = fallback
  }

  return SERVER_URLS[best]!
}

/** Registra stream ativo, retorna função para liberar */
export function acquireServer(url: string): () => void {
  const idx = SERVER_URLS.indexOf(url)
  if (idx >= 0) usage[idx]!++
  return () => {
    if (idx >= 0 && usage[idx]! > 0) usage[idx]!--
  }
}

/** Pega N servidores diferentes para multi-view */
export function pickServersForMultiView(count: number): string[] {
  const picked: string[] = []
  for (let i = 0; i < count; i++) {
    picked.push(pickServer(picked))
  }
  return picked
}

type StreamType = 'live' | 'movie' | 'series'

/** Reconstrói a URL de stream com outro servidor */
export function rebuildUrl(
  originalUrl: string,
  newServer: string,
  username: string,
  password: string,
): string {
  const base = newServer.replace(/\/$/, '')
  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)

  // Detecta tipo e extrai stream ID
  const liveMatch = originalUrl.match(/\/live\/[^/]+\/[^/]+\/([^.]+)(\.\w+)?$/)
  if (liveMatch) return `${base}/live/${u}/${p}/${liveMatch[1]}.m3u8`

  const movieMatch = originalUrl.match(/\/movie\/[^/]+\/[^/]+\/([^.]+)(\.\w+)?$/)
  if (movieMatch) {
    const ext = movieMatch[2] ?? '.mp4'
    return `${base}/movie/${u}/${p}/${movieMatch[1]}${ext}`
  }

  const seriesMatch = originalUrl.match(/\/series\/[^/]+\/[^/]+\/([^.]+)(\.\w+)?$/)
  if (seriesMatch) {
    const ext = seriesMatch[2] ?? '.mp4'
    return `${base}/series/${u}/${p}/${seriesMatch[1]}${ext}`
  }

  return originalUrl
}

/** Detecta o tipo do stream pela URL */
export function detectStreamType(url: string): StreamType {
  if (url.includes('/movie/')) return 'movie'
  if (url.includes('/series/')) return 'series'
  return 'live'
}
