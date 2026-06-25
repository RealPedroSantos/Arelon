import { describe, it, expect } from 'vitest'
import { detectFranchise, scoreMovie, scoreSeries, scoreChannel } from './contentScore'
import type { Movie, Series, Channel } from '../store'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 'test-movie',
    name: 'Test Movie',
    poster: '',
    categoryId: 'filmes',
    streamUrl: '',
    ext: 'mkv',
    year: String(new Date().getFullYear()),
    rating: '14',
    ...overrides,
  }
}

function makeSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: 'test-series',
    name: 'Test Series',
    cover: '',
    categoryId: 'series',
    year: String(new Date().getFullYear()),
    rating: '14',
    ...overrides,
  }
}

function makeChannel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: 'test-ch',
    name: 'Test Channel',
    logo: '',
    categoryId: 'entretenimento',
    streamUrl: '',
    ...overrides,
  }
}

// ─── detectFranchise ──────────────────────────────────────────────────────────

describe('detectFranchise', () => {
  it('detecta Marvel', () => {
    expect(detectFranchise('Vingadores: Ultimato')).toBe(null)
    expect(detectFranchise('Avengers: Endgame')).toBe('marvel')
    expect(detectFranchise('Spider-Man: No Way Home')).toBe('marvel')
    expect(detectFranchise('Thor: Love and Thunder')).toBe('marvel')
  })

  it('detecta DC', () => {
    expect(detectFranchise('Batman Begins')).toBe('dc')
    expect(detectFranchise('Supergirl')).toBe('dc')
    expect(detectFranchise('Aquaman')).toBe('dc')
  })

  it('detecta Star Wars', () => {
    expect(detectFranchise('The Mandalorian')).toBe('star_wars')
    expect(detectFranchise('Star Wars: A Nova Esperança')).toBe('star_wars')
  })

  it('detecta Toy Story', () => {
    expect(detectFranchise('Toy Story 5')).toBe('toy_story')
  })

  it('retorna null para título sem franquia', () => {
    expect(detectFranchise('The Boys')).toBe(null)
    expect(detectFranchise('Euphoria')).toBe(null)
  })
})

// ─── scoreMovie ───────────────────────────────────────────────────────────────

describe('scoreMovie', () => {
  it('score base está entre 0 e 1', () => {
    const score = scoreMovie(makeMovie())
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('franquia aumenta o score', () => {
    const base = scoreMovie(makeMovie({ name: 'Filme Qualquer' }))
    const franchise = scoreMovie(makeMovie({ name: 'Spider-Man: No Way Home' }))
    expect(franchise).toBeGreaterThan(base)
  })

  it('conteúdo nacional aumenta o score', () => {
    const base = scoreMovie(makeMovie({ name: 'Random Movie', categoryId: 'filmes' }))
    const national = scoreMovie(makeMovie({ name: 'Filme Nacional', categoryId: 'nacional' }))
    expect(national).toBeGreaterThan(base)
  })

  it('trend rank #1 adiciona boost máximo', () => {
    const noTrend = scoreMovie(makeMovie())
    const trending = scoreMovie(makeMovie(), { trendRank: 1 })
    expect(trending).toBeGreaterThan(noTrend)
  })

  it('penaliza conteúdo já assistido', () => {
    const notWatched = scoreMovie(makeMovie())
    const watched = scoreMovie(makeMovie(), { isWatched: true })
    expect(watched).toBeLessThan(notWatched)
  })

  it('score nunca fica abaixo de 0', () => {
    const score = scoreMovie(makeMovie({ year: '1990' }), { isWatched: true })
    expect(score).toBeGreaterThanOrEqual(0)
  })
})

// ─── scoreSeries ──────────────────────────────────────────────────────────────

describe('scoreSeries', () => {
  it('série tem score base maior que filme', () => {
    const seriesScore = scoreSeries(makeSeries({ name: 'Test' }))
    const movieScore = scoreMovie(makeMovie({ name: 'Test' }))
    expect(seriesScore).toBeGreaterThan(movieScore)
  })

  it('novo episódio aumenta o score', () => {
    const base = scoreSeries(makeSeries())
    const withNew = scoreSeries(makeSeries(), { hasNewEpisode: true })
    expect(withNew).toBeGreaterThan(base)
  })

  it('score nunca ultrapassa 1', () => {
    const score = scoreSeries(makeSeries({ name: 'Spider-Man' }), {
      trendRank: 1,
      hasNewEpisode: true,
      hasPtBrAudio: true,
    })
    expect(score).toBeLessThanOrEqual(1)
  })
})

// ─── scoreChannel ─────────────────────────────────────────────────────────────

describe('scoreChannel', () => {
  it('canal esportivo tem score maior que entretenimento', () => {
    const sport = scoreChannel(makeChannel({ categoryId: 'esportes' }))
    const ent = scoreChannel(makeChannel({ categoryId: 'entretenimento' }))
    expect(sport).toBeGreaterThan(ent)
  })

  it('URL morta penaliza o score', () => {
    const alive = scoreChannel(makeChannel({ categoryId: 'esportes' }))
    const dead = scoreChannel(makeChannel({ categoryId: 'esportes' }), { isDead: true })
    expect(dead).toBeLessThan(alive)
  })

  it('score nunca ultrapassa 1', () => {
    const score = scoreChannel(
      makeChannel({ name: 'Globo Nacional', categoryId: 'esportes' }),
      { isNowLive: true },
    )
    expect(score).toBeLessThanOrEqual(1)
  })

  it('score nunca fica abaixo de 0', () => {
    const score = scoreChannel(makeChannel({ categoryId: 'desconhecido' }), { isDead: true })
    expect(score).toBeGreaterThanOrEqual(0)
  })
})
