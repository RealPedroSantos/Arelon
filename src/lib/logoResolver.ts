export const CHANNEL_LOGO_PLACEHOLDER = '/assets/arelon/Icone_SF_Arelon.png'

const INTERNAL_LOGO_CACHE_KEY = 'arelon:channel-logos:v1'
const CHANNEL_LOGO_OVERRIDES: Record<string, string> = {}
let internalLogoCache: Record<string, string> | null = null
let logoBank: Record<string, string> = {}

export function loadLogoBank(bank: Record<string, string>): void {
  logoBank = bank
}

export interface ChannelLogoOptions {
  logoCdn?: string
  logoPlaylist?: string
  logoPlaceholder?: string
}

export function normalizeChannelLogoKey(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(hd|fhd|full\s*hd|sd|4k|h264|h265|hevc|1080p|720p|3d|vip|alt)\b/gi, '')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\|[^|]*\|/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim()

  if (cleaned.includes('aande') || cleaned === 'ae') return 'aande'
  if (cleaned.includes('foxsports2') || cleaned.includes('foxsport2')) return 'foxsports2'
  if (cleaned.includes('foxsports') || cleaned.includes('foxsport')) return 'foxsports'
  if (cleaned.includes('sportv3')) return 'sportv3'
  if (cleaned.includes('sportv2')) return 'sportv2'
  if (cleaned.includes('sportv') || cleaned.includes('spoptv')) return 'sportv'
  if (cleaned.includes('espnbrasil')) return 'espnbrasil'
  if (cleaned.includes('espn2')) return 'espn2'
  if (cleaned.includes('espnextra')) return 'espnextra'
  if (cleaned.includes('espn')) return 'espn'
  if (cleaned.includes('premiere2')) return 'premiere2'
  if (cleaned.includes('premiere3')) return 'premiere3'
  if (cleaned.includes('premiere4')) return 'premiere4'
  if (cleaned.includes('premiere5')) return 'premiere5'
  if (cleaned.includes('premiere6')) return 'premiere6'
  if (cleaned.includes('premiere7')) return 'premiere7'
  if (cleaned.includes('premiere8')) return 'premiere8'
  if (cleaned.includes('premiereclubes')) return 'premiereclubes'
  if (cleaned.includes('premierefc') || cleaned.includes('premiere')) return 'premiere'
  if (cleaned.includes('globonews')) return 'globonews'
  if (cleaned.includes('gloob')) return 'gloob'
  if (cleaned.includes('globorj') || cleaned.includes('globo')) return 'globo'
  if (cleaned.includes('telecineaction')) return 'telecineaction'
  if (cleaned.includes('telecinefun')) return 'telecinefun'
  if (cleaned.includes('telecinepipoca')) return 'telecinepipoca'
  if (cleaned.includes('telecinepremium')) return 'telecinepremium'
  if (cleaned.includes('telecinetouch')) return 'telecinetouch'
  if (cleaned.includes('telecinecult')) return 'telecinecult'
  if (cleaned.includes('hbo2')) return 'hbo2'
  if (cleaned.includes('hbofamily')) return 'hbofamily'
  if (cleaned.includes('hboplus')) return 'hboplus'
  if (cleaned.includes('hbosignature')) return 'hbosignature'
  if (cleaned.includes('hbo')) return 'hbo'
  if (cleaned.includes('disneyjunior') || cleaned.includes('disneyjr')) return 'disneyjunior'
  if (cleaned.includes('nickelodeon') || cleaned.includes('nick')) return cleaned.includes('jr') ? 'nickjr' : 'nickelodeon'
  if (cleaned.includes('discoverykids')) return 'discoverykids'
  if (cleaned.includes('discoveryhomehealth') || cleaned.includes('discoveryhomeandhealth')) return 'discoveryhomehealth'
  if (cleaned.includes('discoverychannel')) return 'discoverychannel'
  if (cleaned.includes('discoveryscience')) return 'discoveryscience'
  if (cleaned.includes('discoveryturbo')) return 'discoveryturbo'
  if (cleaned.includes('discoverycivilization')) return 'discoverycivilization'
  if (cleaned.includes('discoverytheater')) return 'discoverytheater'
  if (cleaned.includes('discoveryworld')) return 'discoveryworld'
  if (cleaned.includes('animalplanet')) return 'animalplanet'
  if (cleaned.includes('comedycentral')) return 'comedycentral'
  if (cleaned.includes('history2') || cleaned.includes('h2')) return 'history2'
  if (cleaned.includes('history')) return 'history'
  if (cleaned.includes('nationalgeographic') || cleaned.includes('natgeo')) {
    if (cleaned.includes('wild')) return 'natgeowild'
    if (cleaned.includes('kids')) return 'natgeokids'
    return 'nationalgeographic'
  }
  if (cleaned.includes('warner')) return 'warner'
  if (cleaned.includes('studiouniversal')) return 'studiouniversal'
  if (cleaned.includes('cnn')) return 'cnn'

  return cleaned
}

function dedupeUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const url of urls) {
    const trimmed = url?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }

  return result
}

function readInternalLogoCache(): Record<string, string> {
  if (internalLogoCache) return internalLogoCache

  try {
    const raw = window.localStorage.getItem(INTERNAL_LOGO_CACHE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    internalLogoCache = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
  } catch {
    internalLogoCache = {}
  }

  return internalLogoCache
}

export function getKnownChannelLogo(channelName: string): string | null {
  const key = normalizeChannelLogoKey(channelName)
  return CHANNEL_LOGO_OVERRIDES[key] ?? readInternalLogoCache()[key] ?? null
}

export function setInternalChannelLogoCache(logos: Record<string, string>): void {
  internalLogoCache = logos

  try {
    window.localStorage.setItem(INTERNAL_LOGO_CACHE_KEY, JSON.stringify(logos))
  } catch {
    // Cache local é apenas uma otimização; o fallback da playlist continua funcionando.
  }
}

export function resolveChannelLogoCandidates(channelName: string, playlistLogo = '', options: ChannelLogoOptions = {}): string[] {
  const key = normalizeChannelLogoKey(channelName)
  return dedupeUrls([
    options.logoCdn,
    getKnownChannelLogo(channelName),
    logoBank[key],
    options.logoPlaylist ?? playlistLogo,
    options.logoPlaceholder ?? CHANNEL_LOGO_PLACEHOLDER,
  ])
}

export function resolveChannelLogo(channelName: string, playlistLogo = '', options: ChannelLogoOptions = {}): string {
  return resolveChannelLogoCandidates(channelName, playlistLogo, options)[0] ?? CHANNEL_LOGO_PLACEHOLDER
}
