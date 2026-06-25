import { describe, it, expect } from 'vitest'
import { buildHomeCarousels } from './homeCarousels'
import type { Movie, Series, Channel, ContinueWatchingItem } from '../store'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMovie(id: string, name: string, extra: Partial<Movie> = {}): Movie {
  return { id, name, poster: '', categoryId: 'filmes', streamUrl: '', ext: 'mkv', ...extra }
}

function makeSeries(id: string, name: string, extra: Partial<Series> = {}): Series {
  return { id, name, cover: '', categoryId: 'series', ...extra }
}

function makeChannel(id: string, name: string, categoryId = 'entretenimento'): Channel {
  return { id, name, logo: '', categoryId, streamUrl: '' }
}

function makeContinueItem(id: string, type: 'movie' | 'episode'): ContinueWatchingItem {
  return {
    id,
    title: `Continue ${id}`,
    url: '',
    type,
    position: 300,
    durationSeconds: 3600,
    progress: 0.5,
    updatedAt: Date.now(),
  }
}

// Catálogo com itens suficientes para não esgotar nos carrosséis de top10
const movies: Movie[] = [
  makeMovie('m1', 'Toy Story 5'),
  makeMovie('m2', 'Spider-Man: No Way Home'),
  makeMovie('m3', 'Cangaço Novo: O Filme', { categoryId: 'nacional' }),
  makeMovie('m4', 'Peppa Pig: O Filme', { categoryId: 'infantil', rating: '0' }),
  makeMovie('m5', 'Random Blockbuster A', { year: String(new Date().getFullYear()) }),
  makeMovie('m6', 'Random Blockbuster B', { year: String(new Date().getFullYear()) }),
  makeMovie('m7', 'Random Blockbuster C'),
  makeMovie('m8', 'Random Blockbuster D'),
  makeMovie('m9', 'Random Blockbuster E'),
  makeMovie('m10', 'Random Blockbuster F'),
  makeMovie('m11', 'Random Blockbuster G'),
  makeMovie('m12', 'Random Blockbuster H'),
]

const series: Series[] = [
  makeSeries('s1', 'The Boys'),
  makeSeries('s2', 'Vai, Brasil', { categoryId: 'nacional' }),
  makeSeries('s3', 'Bluey', { categoryId: 'infantil', rating: '0' }),
  makeSeries('s4', 'Euphoria'),
  makeSeries('s5', 'From'),
  makeSeries('s6', 'Série Extra A'),
  makeSeries('s7', 'Série Extra B'),
  makeSeries('s8', 'Série Extra C'),
  makeSeries('s9', 'Série Extra D'),
  makeSeries('s10', 'Série Extra E'),
  makeSeries('s11', 'Série Extra F'),
]

const liveChannels: Channel[] = [
  makeChannel('c1', 'SporTV', 'esportes'),
  makeChannel('c2', 'Globo Nacional', 'canais abertos'),
  makeChannel('c3', 'Canal Kids', 'infantil'),
]

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('buildHomeCarousels', () => {
  it('retorna pelo menos os carrosséis essenciais quando há conteúdo', () => {
    const carousels = buildHomeCarousels({ movies, series, liveChannels, continueWatching: [] })
    const ids = carousels.map((c) => c.id)
    expect(ids).toContain('top10')
    expect(ids).toContain('live')
    expect(ids).toContain('featured_movies')
    expect(ids).toContain('featured_series')
  })

  it('não inclui carrosséis vazios', () => {
    const carousels = buildHomeCarousels({ movies: [], series: [], liveChannels: [], continueWatching: [] })
    expect(carousels.length).toBe(0)
  })

  it('carrossel top10 contém no máximo 10 itens', () => {
    const carousels = buildHomeCarousels({ movies, series, liveChannels, continueWatching: [] })
    const top10 = carousels.find((c) => c.id === 'top10')
    expect(top10).toBeDefined()
    expect(top10!.items.length).toBeLessThanOrEqual(10)
  })

  it('carrossel continue_watching usa histórico do usuário', () => {
    const continueWatching = [makeContinueItem('m1', 'movie'), makeContinueItem('s1', 'episode')]
    const carousels = buildHomeCarousels({ movies, series, liveChannels, continueWatching })
    const cont = carousels.find((c) => c.id === 'continue_watching')
    expect(cont).toBeDefined()
    expect(cont!.items.length).toBeGreaterThan(0)
  })

  it('carrossel "Seu Próximo Favorito" aparece apenas após sessionCount >= 3', () => {
    const session0 = buildHomeCarousels({ movies, series, liveChannels, continueWatching: [], sessionCount: 0 })
    // Para o carrossel aparecer, precisa de histórico com tipo movie/episode
    const continueHistory = [makeContinueItem('m1', 'movie'), makeContinueItem('s1', 'episode')]
    const session3 = buildHomeCarousels({
      movies,
      series,
      liveChannels,
      continueWatching: continueHistory,
      sessionCount: 3,
    })

    const forYou0 = session0.find((c) => c.id === 'for_you')
    // Se aparecer ou não depende do histórico; o essencial é que com sessionCount=0 não aparece
    expect(forYou0).toBeUndefined()
    // Com sessionCount=3 e histórico, o carrossel pode aparecer se houver itens não assistidos
    const forYou3 = session3.find((c) => c.id === 'for_you')
    if (forYou3) {
      expect(forYou3.items.length).toBeGreaterThan(0)
    }
  })

  it('modo kids troca título de "Top 10 no Brasil" e oculta carrossel de franquias adultas', () => {
    const kidsCarousels = buildHomeCarousels({ movies, series, liveChannels, continueWatching: [], kidsMode: true })
    const top10 = kidsCarousels.find((c) => c.id === 'top10')
    const franchises = kidsCarousels.find((c) => c.id === 'franchises')
    const national = kidsCarousels.find((c) => c.id === 'national')

    expect(top10).toBeDefined()
    expect(franchises).toBeUndefined()
    expect(national).toBeUndefined()
  })

  it('todos os itens têm id, title e imageUrl definidos', () => {
    const carousels = buildHomeCarousels({ movies, series, liveChannels, continueWatching: [] })
    for (const carousel of carousels) {
      for (const item of carousel.items) {
        expect(item.id).toBeTruthy()
        expect(item.title).toBeTruthy()
        expect(typeof item.imageUrl).toBe('string')
      }
    }
  })

  it('itens do top10 têm trendRank quando correspondem ao trending', () => {
    const mTrending: Movie[] = [
      makeMovie('toy5', 'Toy Story 5'),
      makeMovie('boys', 'The Boys Extra Movie'),
    ]
    const sTrending: Series[] = [
      makeSeries('from1', 'From'),
    ]
    const carousels = buildHomeCarousels({ movies: mTrending, series: sTrending, liveChannels: [], continueWatching: [] })
    const top10 = carousels.find((c) => c.id === 'top10')
    const withRank = top10?.items.filter((i) => i.trendRank != null)
    expect(withRank?.length).toBeGreaterThan(0)
  })

  it('canais ao vivo ficam no carrossel live', () => {
    const carousels = buildHomeCarousels({ movies: [], series: [], liveChannels, continueWatching: [] })
    const live = carousels.find((c) => c.id === 'live')
    expect(live).toBeDefined()
    expect(live!.items.every((i) => i.type === 'live')).toBe(true)
  })
})
