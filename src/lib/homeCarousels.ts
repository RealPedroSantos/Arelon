import type { Channel, Movie, Series, ContinueWatchingItem } from '../store'
import {
  getTop10Home,
  getTop10KidsHome,
  type RankedCatalogItem,
} from './trendingTop10'
import { scoreChannel, scoreMovie, scoreSeries, detectFranchise } from './contentScore'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CarouselItem {
  id: string
  title: string
  imageUrl: string
  type: 'movie' | 'series' | 'live'
  /** Posição no ranking de trending, se aplicável */
  trendRank?: number
  /** Score calculado para debug/ordenação */
  score?: number
}

export interface HomeCarousel {
  id: string
  title: string
  items: CarouselItem[]
  /** Exibir apenas se length > 0 */
  isEmpty: boolean
}

export interface HomeCarouselsResult {
  /** Carrosséis ordenados para renderização */
  carousels: HomeCarousel[]
  /** Sessão ativa (quantidade de sessões do usuário, para ocultar recomendação antes da 3ª) */
  sessionCount: number
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function movieToCarouselItem(m: Movie, trendRank?: number, score?: number): CarouselItem {
  return { id: m.id, title: m.name, imageUrl: m.poster ?? '', type: 'movie', trendRank, score }
}

function seriesToCarouselItem(s: Series, trendRank?: number, score?: number): CarouselItem {
  return { id: s.id, title: s.name, imageUrl: s.cover ?? '', type: 'series', trendRank, score }
}

function channelToCarouselItem(ch: Channel, score?: number): CarouselItem {
  return { id: ch.id, title: ch.name, imageUrl: ch.logoCdn ?? ch.logo ?? '', type: 'live', score }
}

function rankedItemToCarouselItem(r: RankedCatalogItem): CarouselItem {
  if (r.kind === 'movie') return movieToCarouselItem(r.item, r.item.trendRank)
  return seriesToCarouselItem(r.item, r.item.trendRank)
}

/** Filtra e ordena canais por score, sem duplicar ids já usados */
function topChannels(channels: Channel[], limit: number, usedIds?: Set<string>): { item: Channel; score: number }[] {
  return channels
    .filter((ch) => !usedIds?.has(ch.id))
    .map((ch) => ({ item: ch, score: scoreChannel(ch, { isNowLive: true }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Detecta conteúdo nacional pelo nome ou categoria */
function isBrazilian(name: string, categoryId?: string): boolean {
  const patterns = /nacional|brasileiro|brasileira/i
  const knownBrShows = /vai,?\s*brasil|cangaço|pico dos marins|tapas|sessão de terapia|os outros|emergência|territorios|testamento|juntas|separadas|avenida brasil|bbb|big brother/i
  return patterns.test(name) || patterns.test(categoryId ?? '') || knownBrShows.test(name)
}

/** Detecta conteúdo infantil/família pela classificação indicativa ou categoria */
function isFamily(movie: Movie | Series): boolean {
  const familyCategories = /infantil|kids|familia|family|animacao|animação|crianca|criança/i
  const rating = (movie as Movie).rating ?? ''
  const numericRating = parseInt(rating.replace(/\D/g, ''), 10)
  const ratingOk = !isNaN(numericRating) && numericRating <= 12
  return familyCategories.test(movie.categoryId) || ratingOk
}

// ─── Builder principal ────────────────────────────────────────────────────────

export interface BuildCarouselsOptions {
  movies: Movie[]
  series: Series[]
  liveChannels: Channel[]
  continueWatching: ContinueWatchingItem[]
  /** Número de sessões do usuário (para mostrar "Seu próximo favorito" apenas a partir da 3ª) */
  sessionCount?: number
  /** IDs de conteúdo que o usuário assistiu por completo */
  watchedIds?: Set<string>
  /** Modo kids: troca top10 e esconde conteúdo adulto */
  kidsMode?: boolean
}

/**
 * Monta a lista ordenada de carrosséis para a HomeScreen,
 * aplicando todas as regras de curadoria definidas.
 */
export function buildHomeCarousels(opts: BuildCarouselsOptions): HomeCarousel[] {
  const {
    movies,
    series,
    liveChannels,
    continueWatching,
    sessionCount = 0,
    watchedIds = new Set<string>(),
    kidsMode = false,
  } = opts

  const carousels: HomeCarousel[] = []
  const usedMovieIds = new Set<string>()
  const usedSeriesIds = new Set<string>()

  // ── 1. Top 10 (trending) ────────────────────────────────────────────────────
  const top10Items = kidsMode
    ? getTop10KidsHome(movies, series)
    : getTop10Home(movies, series)

  top10Items.forEach((r) => {
    if (r.kind === 'movie') usedMovieIds.add(r.item.id)
    else usedSeriesIds.add(r.item.id)
  })

  carousels.push({
    id: 'top10',
    title: 'Top 10',
    items: top10Items.map(rankedItemToCarouselItem),
    isEmpty: top10Items.length === 0,
  })

  // ── 2. Continue Assistindo ──────────────────────────────────────────────────
  const continueItems = continueWatching
    .filter((i) => i.type !== 'live') // canais ao vivo não têm posição de retomada
    .slice(0, 8)
    .map((i) => ({
      id: i.id,
      title: i.title,
      imageUrl: i.poster ?? '',
      type: i.type as 'movie' | 'series',
    }))

  carousels.push({
    id: 'continue_watching',
    title: 'Continue assistindo',
    items: continueItems,
    isEmpty: continueItems.length === 0,
  })

  // ── 3. Franquias e Universos ────────────────────────────────────────────────
  const franchiseMovies = movies
    .filter((m) => !usedMovieIds.has(m.id) && detectFranchise(m.name) !== null)
    .map((m) => ({ item: m, score: scoreMovie(m, { isWatched: watchedIds.has(m.id) }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  const franchiseSeries = series
    .filter((s) => !usedSeriesIds.has(s.id) && detectFranchise(s.name) !== null)
    .map((s) => ({ item: s, score: scoreSeries(s, { isWatched: watchedIds.has(s.id) }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  // Intercala filmes e séries de franquias
  const franchiseItems: CarouselItem[] = []
  const maxFranchise = 15
  for (let i = 0; franchiseItems.length < maxFranchise && (i < franchiseMovies.length || i < franchiseSeries.length); i++) {
    if (franchiseMovies[i]) {
      franchiseItems.push(movieToCarouselItem(franchiseMovies[i]!.item, undefined, franchiseMovies[i]!.score))
      usedMovieIds.add(franchiseMovies[i]!.item.id)
    }
    if (franchiseSeries[i] && franchiseItems.length < maxFranchise) {
      franchiseItems.push(seriesToCarouselItem(franchiseSeries[i]!.item, undefined, franchiseSeries[i]!.score))
      usedSeriesIds.add(franchiseSeries[i]!.item.id)
    }
  }

  if (!kidsMode) {
    carousels.push({
      id: 'franchises',
      title: 'Franquias e Universos',
      items: franchiseItems,
      isEmpty: franchiseItems.length === 0,
    })
  }

  // ── 4. Produções Nacionais ──────────────────────────────────────────────────
  const nationalMovies = movies
    .filter((m) => !usedMovieIds.has(m.id) && isBrazilian(m.name, m.categoryId))
    .map((m) => ({ item: m, score: scoreMovie(m, { isWatched: watchedIds.has(m.id) }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  const nationalSeries = series
    .filter((s) => !usedSeriesIds.has(s.id) && isBrazilian(s.name, s.categoryId))
    .map((s) => ({ item: s, score: scoreSeries(s, { isWatched: watchedIds.has(s.id) }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  const nationalItems: CarouselItem[] = [
    ...nationalSeries.map((x) => seriesToCarouselItem(x.item, undefined, x.score)),
    ...nationalMovies.map((x) => movieToCarouselItem(x.item, undefined, x.score)),
  ].slice(0, 15)

  nationalItems.forEach((i) => {
    if (i.type === 'movie') usedMovieIds.add(i.id)
    else usedSeriesIds.add(i.id)
  })

  if (!kidsMode) {
    carousels.push({
      id: 'national',
      title: 'Produções Nacionais',
      items: nationalItems,
      isEmpty: nationalItems.length === 0,
    })
  }

  // ── 5. Para a Família Toda ──────────────────────────────────────────────────
  const familyMovies = movies
    .filter((m) => !usedMovieIds.has(m.id) && isFamily(m))
    .map((m) => ({ item: m, score: scoreMovie(m, { isWatched: watchedIds.has(m.id) }) + (detectFranchise(m.name) ? 0.05 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  const familySeries = series
    .filter((s) => !usedSeriesIds.has(s.id) && isFamily(s))
    .map((s) => ({ item: s, score: scoreSeries(s, { isWatched: watchedIds.has(s.id) }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)

  const familyItems: CarouselItem[] = [
    ...familyMovies.map((x) => movieToCarouselItem(x.item, undefined, x.score)),
    ...familySeries.map((x) => seriesToCarouselItem(x.item, undefined, x.score)),
  ].slice(0, 10)

  carousels.push({
    id: 'family',
    title: kidsMode ? 'Filmes e Séries' : 'Para a Família Toda',
    items: familyItems,
    isEmpty: familyItems.length === 0,
  })

  // ── 6. Canais Ao Vivo ───────────────────────────────────────────────────────
  const liveUsedIds = new Set<string>()
  const topLive = topChannels(liveChannels, 15, liveUsedIds)

  carousels.push({
    id: 'live',
    title: 'Canais Ao Vivo',
    items: topLive.map((x) => channelToCarouselItem(x.item, x.score)),
    isEmpty: topLive.length === 0,
  })

  // ── 7. Filmes em Destaque ───────────────────────────────────────────────────
  const featMovies = movies
    .filter((m) => !usedMovieIds.has(m.id))
    .map((m) => ({ item: m, score: scoreMovie(m, { isWatched: watchedIds.has(m.id) }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  featMovies.forEach((x) => usedMovieIds.add(x.item.id))

  carousels.push({
    id: 'featured_movies',
    title: kidsMode ? 'Filmes' : 'Lançamentos',
    items: featMovies.map((x) => movieToCarouselItem(x.item, undefined, x.score)),
    isEmpty: featMovies.length === 0,
  })

  // ── 8. Séries em Destaque ───────────────────────────────────────────────────
  const featSeries = series
    .filter((s) => !usedSeriesIds.has(s.id))
    .map((s) => ({ item: s, score: scoreSeries(s, { isWatched: watchedIds.has(s.id) }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  featSeries.forEach((x) => usedSeriesIds.add(x.item.id))

  carousels.push({
    id: 'featured_series',
    title: 'Séries em Destaque',
    items: featSeries.map((x) => seriesToCarouselItem(x.item, undefined, x.score)),
    isEmpty: featSeries.length === 0,
  })

  // ── 9. Seu Próximo Favorito (personalização — aparece após 3ª sessão) ────────
  if (sessionCount >= 3) {
    // Pega os gêneros/categorias mais assistidos do histórico de continueWatching
    const watchedCategories = continueWatching.map((i) => i.type).filter(Boolean)
    const hasMovieHistory = watchedCategories.includes('movie')
    const hasSeriesHistory = watchedCategories.includes('episode')

    const personalMovies = hasMovieHistory
      ? movies
          .filter((m) => !usedMovieIds.has(m.id) && !watchedIds.has(m.id))
          .map((m) => ({ item: m, score: scoreMovie(m) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
      : []

    const personalSeries = hasSeriesHistory
      ? series
          .filter((s) => !usedSeriesIds.has(s.id) && !watchedIds.has(s.id))
          .map((s) => ({ item: s, score: scoreSeries(s) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 7)
      : []

    const personalItems: CarouselItem[] = [
      ...personalMovies.map((x) => movieToCarouselItem(x.item, undefined, x.score)),
      ...personalSeries.map((x) => seriesToCarouselItem(x.item, undefined, x.score)),
    ].slice(0, 10)

    carousels.push({
      id: 'for_you',
      title: 'Seu Próximo Favorito',
      items: personalItems,
      isEmpty: personalItems.length === 0,
    })
  }

  // Retorna apenas carrosséis com conteúdo
  return carousels.filter((c) => !c.isEmpty)
}
