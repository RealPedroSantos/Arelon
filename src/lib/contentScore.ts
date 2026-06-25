import type { Movie, Series, Channel } from '../store'
import { normalizeTrendingTitle } from './trendingTop10'

// ─── Constantes de peso ───────────────────────────────────────────────────────

/** Grupos M3U → peso base do canal */
const CHANNEL_GROUP_WEIGHTS: Record<string, number> = {
  esporte: 0.85,
  sport: 0.85,
  esportes: 0.85,
  sports: 0.85,
  futebol: 0.85,
  'canais pagos': 0.80,
  premium: 0.80,
  infantil: 0.75,
  kids: 0.75,
  familia: 0.75,
  family: 0.75,
  'canais abertos': 0.72,
  abertos: 0.72,
  noticias: 0.70,
  news: 0.70,
  jornalismo: 0.70,
  entretenimento: 0.65,
  entertainment: 0.65,
  filmes: 0.65,
  series: 0.65,
}

/** Palavras-chave de franquia → boost de score */
const FRANCHISE_PATTERNS: Array<{ regex: RegExp; tag: string }> = [
  { regex: /marvel|avenger|spider.?man|iron.?man|thor|hulk|guardians|wanda|hawkeye|loki|she.?hulk|ms\.?\s*marvel|moon.?knight|black.?panther|ant.?man|eternals|shang.?chi|doctor.?strange/i, tag: 'marvel' },
  { regex: /star.?wars|mandalorian|ahsoka|andor|obi.?wan|book.?of.?boba|bad.?batch|acolyte/i, tag: 'star_wars' },
  { regex: /harry.?potter|fantastic.?beast|hogwarts/i, tag: 'harry_potter' },
  { regex: /\bdc\b|batman|superman|aquaman|\bflash\b|wonder.?woman|black.?adam|shazam|suicide.?squad|birds.?of.?prey|blue.?beetle|supergirl/i, tag: 'dc' },
  { regex: /turma.?da.?m[oô]nica|chico.?bento|cascão|cebolinha|magali/i, tag: 'turma_monica' },
  { regex: /fast.?furious|velozes.*(furiosos|raivosos)|dominic.?toretto/i, tag: 'fast_furious' },
  { regex: /jurassic/i, tag: 'jurassic' },
  { regex: /miss[aã]o.?imposs[ií]vel|mission.?impossible/i, tag: 'missao_impossivel' },
  { regex: /toy.?story/i, tag: 'toy_story' },
  { regex: /mario|luigi|bowser|mushroom.?kingdom/i, tag: 'mario' },
  { regex: /transformers/i, tag: 'transformers' },
  { regex: /minions|gru|despicable/i, tag: 'minions' },
  { regex: /john.?wick/i, tag: 'john_wick' },
  { regex: /alien|predator|xenomorph/i, tag: 'alien_predator' },
  { regex: /lord.?of.?the.?rings|hobbit|tolkien|middle.?earth|senhor.?dos.?an[eé]is/i, tag: 'lotr' },
]

/** Indicativos de conteúdo nacional (BR) pelo nome/grupo do canal */
const BR_CHANNEL_PATTERNS = /\bbrasi(l|leiro|leira)\b|\bsbt\b|\bglobo\b|\brecord\b|\bband\b|\bredetv\b|\bcultura\b|\bcnt\b|\bnacional\b/i

// ─── Utilitários ──────────────────────────────────────────────────────────────

/** Extrai a tag de franquia do título, se houver */
export function detectFranchise(title: string): string | null {
  for (const { regex, tag } of FRANCHISE_PATTERNS) {
    if (regex.test(title)) return tag
  }
  return null
}

/** Normaliza nome de grupo M3U para lookup na tabela de pesos */
function normalizeGroup(group: string): string {
  return normalizeTrendingTitle(group)
}

/** Peso base de um canal pelo grupo M3U */
function channelGroupWeight(group: string): number {
  const normalized = normalizeGroup(group)
  for (const [key, weight] of Object.entries(CHANNEL_GROUP_WEIGHTS)) {
    if (normalized.includes(key)) return weight
  }
  return 0.40 // sem grupo reconhecido
}

/** Detecta se o nome/grupo do canal sugere origem BR */
function isChannelBrazilian(ch: Channel): boolean {
  return BR_CHANNEL_PATTERNS.test(ch.name) || BR_CHANNEL_PATTERNS.test(ch.categoryId ?? '')
}

// ─── Scoring público ──────────────────────────────────────────────────────────

/**
 * Calcula content_score para um canal IPTV (0–1).
 * Considera grupo, horário nobre, origem BR e health check.
 */
export function scoreChannel(
  ch: Channel,
  options: {
    isDead?: boolean        // URL falhou no último health check
    isNowLive?: boolean     // está transmitindo ao vivo no momento
  } = {},
): number {
  let score = channelGroupWeight(ch.categoryId ?? '')

  // Boost horário nobre (19h–23h BRT = UTC-3)
  const hourBRT = (new Date().getUTCHours() - 3 + 24) % 24
  if (options.isNowLive && hourBRT >= 19 && hourBRT < 23) {
    score += 0.15
  }

  // Boost origem BR
  if (isChannelBrazilian(ch)) score += 0.10

  // Penalidade URL morta
  if (options.isDead) score -= 0.10

  return Math.max(0, Math.min(1, score))
}

/**
 * Calcula content_score para um filme (0–1).
 */
export function scoreMovie(
  movie: Movie,
  options: {
    trendRank?: number       // posição no ranking de trending (1 = melhor)
    isWatched?: boolean      // usuário já assistiu por completo
    hasPtBrAudio?: boolean   // tem áudio/legenda PT-BR confirmado
  } = {},
): number {
  let score = 0.75 // base: filme VOD

  // Franquia → boost
  const franchise = detectFranchise(movie.name)
  if (franchise) score += 0.10

  // Conteúdo nacional
  if (isBrazilianContent(movie.name, movie.categoryId)) score += 0.10

  // Trending → boost escalonado por rank
  if (options.trendRank != null) {
    const trendBoost = Math.max(0, (20 - options.trendRank) / 20) * 0.15
    score += trendBoost
  }

  // Áudio/legenda PT-BR
  if (options.hasPtBrAudio) score += 0.05

  // Já assistiu
  if (options.isWatched) score -= 0.20

  // Ano recente (campo year é string "2024", "2025", etc.)
  const year = parseInt(movie.year ?? '0', 10)
  const currentYear = new Date().getFullYear()
  if (year >= currentYear) score += 0.10
  else if (year >= currentYear - 1) score += 0.05

  return Math.max(0, Math.min(1, score))
}

/**
 * Calcula content_score para uma série (0–1).
 */
export function scoreSeries(
  series: Series,
  options: {
    trendRank?: number
    isWatched?: boolean
    hasPtBrAudio?: boolean
    hasNewEpisode?: boolean   // novo episódio disponível
  } = {},
): number {
  let score = 0.80 // base: série — ligeiramente maior que filme

  const franchise = detectFranchise(series.name)
  if (franchise) score += 0.10

  if (isBrazilianContent(series.name, series.categoryId)) score += 0.10

  if (options.trendRank != null) {
    const trendBoost = Math.max(0, (20 - options.trendRank) / 20) * 0.15
    score += trendBoost
  }

  if (options.hasPtBrAudio) score += 0.05
  if (options.hasNewEpisode) score += 0.10
  if (options.isWatched) score -= 0.20

  const year = parseInt(series.year ?? '0', 10)
  const currentYear = new Date().getFullYear()
  if (year >= currentYear) score += 0.10
  else if (year >= currentYear - 1) score += 0.05

  return Math.max(0, Math.min(1, score))
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

const BR_CONTENT_PATTERNS = /\bnacional\b|\bbrasileiro\b|\bbrasileira\b|\bnacional\b/i
const BR_KNOWN_SERIES = /\b(vai,?\s*brasil|cangaço|pico dos marins|tapas|beijos|sessão de terapia|os outros|emergência radioativa|territorios|o testamento|juntas|separadas|malhação|avenida brasil|o clone|bbb|big brother brasil|domingão|the noite|lady night|porta dos fundos|chat indireto|tô de graça)\b/i

function isBrazilianContent(name: string, categoryId?: string): boolean {
  if (BR_CONTENT_PATTERNS.test(categoryId ?? '')) return true
  if (BR_CONTENT_PATTERNS.test(name)) return true
  if (BR_KNOWN_SERIES.test(name)) return true
  return false
}
