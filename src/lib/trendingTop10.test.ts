import { describe, expect, it, vi } from 'vitest'
import type { Movie, Series } from '../store'
import { getTop10Movies, getTop10Series, getTop10Home, normalizeTrendingTitle } from './trendingTop10'

function movie(id: string, name: string): Movie {
  return {
    id,
    name,
    poster: `${id}.jpg`,
    categoryId: 'movies',
    streamUrl: `${id}.mp4`,
    ext: 'mp4',
  }
}

function series(id: string, name: string): Series {
  return {
    id,
    name,
    cover: `${id}.jpg`,
    categoryId: 'series',
  }
}

describe('trendingTop10', () => {
  it('normalizes noisy catalog titles', () => {
    expect(normalizeTrendingTitle('Projeto Hail Mary (2026) [FHD] DUBLADO')).toBe('projeto hail mary')
    expect(normalizeTrendingTitle('Tapas & Beijos HD')).toBe('tapas e beijos')
  })

  it('ranks current movie aliases before catalog fallback', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05T12:00:00Z'))

    const top = getTop10Movies([
      movie('random-1', 'Filme Aleatorio'),
      movie('hail-mary', 'Projeto Hail Mary 2026 4K'),
      movie('housemaid', 'A Empregada'),
    ])

    // Trending items devem vir antes do fallback aleatório
    const ids = top.map((item) => item.id)
    expect(ids.indexOf('hail-mary')).toBeLessThan(ids.indexOf('random-1'))
    expect(ids.indexOf('housemaid')).toBeLessThan(ids.indexOf('random-1'))

    vi.useRealTimers()
  })

  it('builds series and home rows from current trends when available', () => {
    const seriesTop = getTop10Series([series('other', 'Serie Qualquer'), series('from', 'Origem')])
    const homeTop = getTop10Home([movie('hail-mary', 'Project Hail Mary')], [series('from', 'From')])

    expect(seriesTop[0]?.id).toBe('from')
    expect(homeTop.map((entry) => `${entry.kind}:${entry.item.id}`)).toEqual(['series:from', 'movie:hail-mary'])
  })

  it('returns up to 10 items even with small catalog', () => {
    const smallMovies = [movie('a', 'Filme A'), movie('b', 'Filme B')]
    const result = getTop10Movies(smallMovies)
    expect(result.length).toBeLessThanOrEqual(10)
    expect(result.length).toBe(smallMovies.length)
  })

  it('assigns trendRank only to matched items', () => {
    const top = getTop10Movies([
      movie('toy5', 'Toy Story 5'),
      movie('random', 'Nao Esta No Trending'),
    ])
    const toy5 = top.find((m) => m.id === 'toy5')
    const random = top.find((m) => m.id === 'random')
    expect(toy5?.trendRank).toBeDefined()
    expect(random?.trendRank).toBeUndefined()
  })
})
