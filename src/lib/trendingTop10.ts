import type { Movie, Series } from '../store'

type TrendEntry = {
  aliases: string[]
}

type CombinedTrendEntry = TrendEntry & {
  kind: 'movie' | 'series'
}

export type RankedMovie = Movie & { trendRank?: number }
export type RankedSeries = Series & { trendRank?: number }

export type RankedCatalogItem =
  | { kind: 'movie'; item: RankedMovie }
  | { kind: 'series'; item: RankedSeries }

// Atualizado em 2026-06-24 com rankings Brasil do FlixPatrol + JustWatch Brasil (Q1/Q2 2026).
// Mantemos aliases em PT/EN porque o catálogo pode vir em qualquer idioma.
const CURRENT_MOVIE_TRENDS: TrendEntry[] = [
  { aliases: ['Toy Story 5'] },
  { aliases: ['Project Hail Mary', 'Projeto Hail Mary'] },
  { aliases: ['A Morte de Robin Hood', 'The Death of Robin Hood'] },
  { aliases: ['Supergirl', 'Supergirl: Woman of Tomorrow'] },
  { aliases: ['Dia D', 'D-Day'] },
  { aliases: ['Mestres do Universo', 'Masters of the Universe'] },
  { aliases: ['The Housemaid', 'A Empregada'] },
  { aliases: ["Lee Cronin's The Mummy", 'The Mummy', 'A Mumia', 'A Múmia'] },
  { aliases: ['Greenland 2: Migration', 'Greenland 2 Migracao', 'Greenland 2 Migração'] },
  { aliases: ['The Super Mario Galaxy Movie', 'Super Mario Galaxy', 'Super Mario Galaxy Movie'] },
  { aliases: ['Mamonas Assassinas: O Filme', 'Mamonas Assassinas'] },
  { aliases: ['Minions & Monstros', 'Minions and Monsters'] },
  { aliases: ['Scream 7', 'Panico 7', 'Pânico 7'] },
  { aliases: ['F1', 'F1 The Movie'] },
  { aliases: ['Predator: Badlands', 'Predador Dominante', 'Predador'] },
  { aliases: ['Wicked: For Good', 'Wicked Para Sempre'] },
  { aliases: ['The Life of Chuck', 'A Vida de Chuck'] },
  { aliases: ['Old Guy', 'Velhos Bandidos', 'Velho$ Bandido$'] },
  { aliases: ['The Old Guard 2'] },
  { aliases: ['KPop Demon Hunters', 'Guerreiras do K-Pop'] },
  { aliases: ['Inside Out 2', 'Divertida Mente 2'] },
  { aliases: ['The Super Mario Bros. Movie', 'Super Mario Bros'] },
  { aliases: ['Oppenheimer'] },
  { aliases: ['Nuremberg', 'Nuremberga'] },
]

const CURRENT_SERIES_TRENDS: TrendEntry[] = [
  { aliases: ['From', 'Origem'] },
  { aliases: ['The Boys', 'Os Guri'] },
  { aliases: ['Territorios - Sob o Dominio do Crime', 'Territórios - Sob o Domínio do Crime', 'Territorios'] },
  { aliases: ['Euphoria'] },
  { aliases: ['Vai, Brasil'] },
  { aliases: ['Emergência Radioativa', 'Emergencia Radioativa'] },
  { aliases: ['O Testamento: O Segredo de Anita Harley', 'The Testaments', 'O Testamento'] },
  { aliases: ['Tapas & Beijos', 'Tapas e Beijos'] },
  { aliases: ['Cangaço Novo', 'Cangaco Novo'] },
  { aliases: ['Pico dos Marins: O Caso do Escoteiro Marco Aurelio', 'Pico dos Marins'] },
  { aliases: ['Sessao de Terapia', 'Sessão de Terapia'] },
  { aliases: ['Os Outros'] },
  { aliases: ['Rick and Morty'] },
  { aliases: ['Spider-Noir', 'Spider Noir'] },
  { aliases: ['Invincible', 'INVINCIBLE'] },
  { aliases: ['The Rookie'] },
  { aliases: ['Squid Game', 'Round 6'] },
  { aliases: ['Citadel'] },
  { aliases: ['The Handmaid\'s Tale', 'O Conto da Aia'] },
  { aliases: ['Matlock'] },
  { aliases: ['Juntas & Separadas', 'Juntas e Separadas'] },
  { aliases: ['The Walking Dead'] },
  { aliases: ['The Sandman', 'Sandman'] },
  { aliases: ['Off Campus'] },
]

const CURRENT_KIDS_MOVIE_TRENDS: TrendEntry[] = [
  { aliases: ['Toy Story 5'] },
  { aliases: ['Minions & Monstros', 'Minions and Monsters'] },
  { aliases: ['KPop Demon Hunters', 'Guerreiras do K-Pop'] },
  { aliases: ['Carrossel: O Filme', 'Carrossel O Filme'] },
  { aliases: ['Carrossel 2: O Sumico de Maria Joaquina', 'Carrossel 2: O Sumiço de Maria Joaquina'] },
  { aliases: ['Despicable Me 4', 'Meu Malvado Favorito 4'] },
  { aliases: ['Inside Out 2', 'Divertida Mente 2'] },
  { aliases: ['The Super Mario Bros. Movie', 'Super Mario Bros'] },
  { aliases: ['Madagascar'] },
  { aliases: ['The Sea Beast', 'O Monstro do Mar'] },
  { aliases: ['Back to the Outback', 'A Jornada de Vivo'] },
  { aliases: ['Rango'] },
]

const CURRENT_KIDS_SERIES_TRENDS: TrendEntry[] = [
  { aliases: ['Lottie Dottie Chicken', 'Galinha Pintadinha'] },
  { aliases: ['Peppa Pig'] },
  { aliases: ['Bluey Minisodes', 'Bluey'] },
  { aliases: ['Paw Patrol', 'Patrulha Canina'] },
  { aliases: ['Masha and the Bear', 'Masha e o Urso'] },
  { aliases: ['3 Palavrinhas', 'Tres Palavrinhas'] },
  { aliases: ['Detetive Labrador'] },
  { aliases: ['Danny Go!'] },
  { aliases: ['Learning and fun with Jose Comelon', 'Jose Comelon', 'José Comelon'] },
  { aliases: ['Cine Gibi'] },
]

const CURRENT_HOME_TRENDS: CombinedTrendEntry[] = [
  { kind: 'movie',  aliases: ['Toy Story 5'] },
  { kind: 'series', aliases: ['From', 'Origem'] },
  { kind: 'movie',  aliases: ['Project Hail Mary', 'Projeto Hail Mary'] },
  { kind: 'series', aliases: ['The Boys', 'Os Guri'] },
  { kind: 'movie',  aliases: ['The Housemaid', 'A Empregada'] },
  { kind: 'series', aliases: ['Territorios - Sob o Dominio do Crime', 'Territórios - Sob o Domínio do Crime'] },
  { kind: 'movie',  aliases: ['A Morte de Robin Hood', 'The Death of Robin Hood'] },
  { kind: 'series', aliases: ['Euphoria'] },
  { kind: 'movie',  aliases: ['Mamonas Assassinas: O Filme', 'Mamonas Assassinas'] },
  { kind: 'series', aliases: ['Cangaço Novo', 'Cangaco Novo'] },
  { kind: 'movie',  aliases: ['Supergirl', 'Supergirl: Woman of Tomorrow'] },
  { kind: 'series', aliases: ['O Testamento: O Segredo de Anita Harley', 'The Testaments'] },
  { kind: 'movie',  aliases: ["Lee Cronin's The Mummy", 'The Mummy', 'A Mumia', 'A Múmia'] },
  { kind: 'series', aliases: ['Tapas & Beijos', 'Tapas e Beijos'] },
  { kind: 'movie',  aliases: ['Greenland 2: Migration', 'Greenland 2 Migracao'] },
  { kind: 'series', aliases: ['Emergência Radioativa', 'Emergencia Radioativa'] },
]

const CURRENT_KIDS_HOME_TRENDS: CombinedTrendEntry[] = [
  ...CURRENT_KIDS_MOVIE_TRENDS.slice(0, 5).map((entry) => ({ ...entry, kind: 'movie' as const })),
  ...CURRENT_KIDS_SERIES_TRENDS.slice(0, 5).map((entry) => ({ ...entry, kind: 'series' as const })),
]

const QUALITY_WORDS =
  /\b(4k|uhd|fhd|fullhd|full\s*hd|hd|sd|h264|h265|hevc|x264|x265|dual|audio|dublado|dub|legendado|leg|webdl|web|bluray|brrip|hdrip|cam|ts|vip|alt|multi|nacional)\b/g

export function normalizeTrendingTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' e ')
    .replace(/\+/g, ' e ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(QUALITY_WORDS, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function fallbackSeed(): string {
  const dayBucket = Math.floor(Date.now() / 86_400_000)
  return `arelon-top10-${dayBucket}`
}

function matchesTrendTitle(title: string, trend: TrendEntry): boolean {
  const normalizedTitle = normalizeTrendingTitle(title)
  if (!normalizedTitle) return false

  return trend.aliases.some((alias) => {
    const normalizedAlias = normalizeTrendingTitle(alias)
    if (!normalizedAlias) return false
    if (normalizedTitle === normalizedAlias) return true
    if (normalizedTitle.includes(normalizedAlias) && normalizedAlias.length >= 3) return true
    return normalizedAlias.includes(normalizedTitle) && normalizedTitle.length >= 6
  })
}

function stableFallback<T extends { id: string; name: string }>(items: T[], usedIds: Set<string>, count: number): T[] {
  if (count <= 0) return []
  const seed = fallbackSeed()

  return items
    .filter((item) => !usedIds.has(item.id))
    .map((item) => ({
      item,
      score: hashString(`${seed}:${item.id}:${normalizeTrendingTitle(item.name)}`),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map(({ item }) => item)
}

function buildRankedList<T extends { id: string; name: string }>(items: T[], trends: TrendEntry[], limit: number): Array<T & { trendRank?: number }> {
  const usedIds = new Set<string>()
  const ranked: Array<T & { trendRank?: number }> = []

  for (const [index, trend] of trends.entries()) {
    const item = items.find((candidate) => !usedIds.has(candidate.id) && matchesTrendTitle(candidate.name, trend))
    if (!item) continue

    usedIds.add(item.id)
    ranked.push({ ...item, trendRank: index + 1 })
    if (ranked.length >= limit) return ranked
  }

  return [...ranked, ...stableFallback(items, usedIds, limit - ranked.length)]
}

function findMovieTrend(movies: Movie[], trend: TrendEntry, usedMovieIds: Set<string>): RankedMovie | null {
  const movie = movies.find((candidate) => !usedMovieIds.has(candidate.id) && matchesTrendTitle(candidate.name, trend))
  return movie ? { ...movie } : null
}

function findSeriesTrend(series: Series[], trend: TrendEntry, usedSeriesIds: Set<string>): RankedSeries | null {
  const item = series.find((candidate) => !usedSeriesIds.has(candidate.id) && matchesTrendTitle(candidate.name, trend))
  return item ? { ...item } : null
}

function buildCombinedList(movies: Movie[], series: Series[], trends: CombinedTrendEntry[], limit: number): RankedCatalogItem[] {
  const usedMovieIds = new Set<string>()
  const usedSeriesIds = new Set<string>()
  const ranked: RankedCatalogItem[] = []

  for (const [index, trend] of trends.entries()) {
    if (trend.kind === 'movie') {
      const movie = findMovieTrend(movies, trend, usedMovieIds)
      if (!movie) continue
      movie.trendRank = index + 1
      usedMovieIds.add(movie.id)
      ranked.push({ kind: 'movie', item: movie })
    } else {
      const item = findSeriesTrend(series, trend, usedSeriesIds)
      if (!item) continue
      item.trendRank = index + 1
      usedSeriesIds.add(item.id)
      ranked.push({ kind: 'series', item })
    }

    if (ranked.length >= limit) return ranked
  }

  const fallbackItems: RankedCatalogItem[] = [
    ...stableFallback(movies, usedMovieIds, movies.length).map((item) => ({ kind: 'movie' as const, item })),
    ...stableFallback(series, usedSeriesIds, series.length).map((item) => ({ kind: 'series' as const, item })),
  ]
    .map((entry) => ({
      entry,
      score: hashString(`${fallbackSeed()}:${entry.kind}:${entry.item.id}:${normalizeTrendingTitle(entry.item.name)}`),
    }))
    .sort((a, b) => a.score - b.score)
    .map(({ entry }) => entry)

  return [...ranked, ...fallbackItems].slice(0, limit)
}

function searchTermsFrom(entries: TrendEntry[], maxAliasesPerEntry = 2): string[] {
  const terms = entries.flatMap((entry) => entry.aliases.slice(0, maxAliasesPerEntry))
  return [...new Set(terms)]
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getTop10Movies(movies: Movie[]): RankedMovie[] {
  return buildRankedList(movies, CURRENT_MOVIE_TRENDS, 10)
}

export function getTop10Series(series: Series[]): RankedSeries[] {
  return buildRankedList(series, CURRENT_SERIES_TRENDS, 10)
}

export function getTop10KidsMovies(movies: Movie[]): RankedMovie[] {
  return buildRankedList(movies, CURRENT_KIDS_MOVIE_TRENDS, 10)
}

export function getTop10KidsSeries(series: Series[]): RankedSeries[] {
  return buildRankedList(series, CURRENT_KIDS_SERIES_TRENDS, 10)
}

export function getTop10Home(movies: Movie[], series: Series[]): RankedCatalogItem[] {
  return buildCombinedList(movies, series, CURRENT_HOME_TRENDS, 10)
}

export function getTop10KidsHome(movies: Movie[], series: Series[]): RankedCatalogItem[] {
  return buildCombinedList(movies, series, CURRENT_KIDS_HOME_TRENDS, 10)
}

export function getTrendingSearchTerms(): string[] {
  return searchTermsFrom([...CURRENT_HOME_TRENDS])
}

export function getTrendingMovieSearchTerms(): string[] {
  return searchTermsFrom(CURRENT_MOVIE_TRENDS)
}

export function getTrendingSeriesSearchTerms(): string[] {
  return searchTermsFrom(CURRENT_SERIES_TRENDS)
}

export function getTrendingKidsSearchTerms(): string[] {
  return searchTermsFrom([...CURRENT_KIDS_MOVIE_TRENDS, ...CURRENT_KIDS_SERIES_TRENDS])
}
