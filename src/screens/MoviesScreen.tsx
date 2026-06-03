import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { moveFocus, useRemote } from '../hooks/useRemote'
import { useMainReturnPoint } from '../hooks/useMainReturnPoint'
import { MediaRow } from '../components/MediaRow'
import { MediaCard } from '../components/MediaCard'
import type { FavoriteItem, Movie } from '../store'
import { getMovieCategories, getMoviesPage } from '../api/xtream'

const ROW_LIMIT = 15
const INITIAL_CATEGORY_COUNT = 6
const IGNORED_CATEGORY_KEYWORDS = ['cliente', 'aviso', 'teste', 'suporte']

type RowState = {
  items: Movie[]
  page: number
  hasMore: boolean
  loading: boolean
  loaded: boolean
}

function mergeMovies(existing: Movie[], next: Movie[]): Movie[] {
  const byId = new Map(existing.map((movie) => [movie.id, movie]))
  for (const movie of next) byId.set(movie.id, movie)
  return Array.from(byId.values())
}

export function MoviesScreen() {
  const server = useStore((s) => s.server)!
  const movies = useStore((s) => s.movies)
  const movieCategories = useStore((s) => s.movieCategories)
  const favorites = useStore((s) => s.favorites)
  const setMovies = useStore((s) => s.setMovies)
  const appendMovies = useStore((s) => s.appendMovies)
  const setSelectedDetailMedia = useStore((s) => s.setSelectedDetailMedia)
  const setScreen = useStore((s) => s.setScreen)
  const pageRef = useRef<HTMLDivElement>(null)
  const rememberReturnPoint = useMainReturnPoint('movies', pageRef)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(INITIAL_CATEGORY_COUNT)

  useEffect(() => {
    if (movieCategories.length > 0) return
    let cancelled = false

    getMovieCategories(server.activeServer, server.username, server.password)
      .then((categories) => {
        if (!cancelled) setMovies(categories, movies)
      })
      .catch((error) => console.error('[Arelon] erro ao carregar categorias de filmes', error))

    return () => {
      cancelled = true
    }
  }, [movieCategories.length, movies, server, setMovies])

  const loadCategoryPage = useCallback(async (categoryId: string, page = 1) => {
    setRows((prev) => ({
      ...prev,
      [categoryId]: {
        items: page > 1 ? prev[categoryId]?.items ?? [] : [],
        page: page > 1 ? prev[categoryId]?.page ?? 0 : 0,
        hasMore: prev[categoryId]?.hasMore ?? false,
        loaded: prev[categoryId]?.loaded ?? false,
        loading: true,
      },
    }))

    try {
      const result = await getMoviesPage(server.activeServer, server.username, server.password, {
        categoryId,
        page,
        limit: ROW_LIMIT,
      })
      appendMovies(result.items)
      setRows((prev) => ({
        ...prev,
        [categoryId]: {
          items: mergeMovies(page > 1 ? prev[categoryId]?.items ?? [] : [], result.items),
          page: result.page,
          hasMore: result.hasMore,
          loading: false,
          loaded: true,
        },
      }))
    } catch (error) {
      console.error('[Arelon] erro ao carregar filmes paginados', { categoryId, page, error })
      setRows((prev) => ({
        ...prev,
        [categoryId]: {
          items: prev[categoryId]?.items ?? [],
          page: prev[categoryId]?.page ?? 0,
          hasMore: false,
          loading: false,
          loaded: true,
        },
      }))
    }
  }, [appendMovies, server])

  const filteredCategories = useMemo(() => (
    movieCategories.filter((cat) => {
      const lower = cat.name.toLowerCase()
      return !IGNORED_CATEGORY_KEYWORDS.some((keyword) => lower.includes(keyword))
    })
  ), [movieCategories])

  const visibleCategories = filteredCategories.slice(0, visibleCategoryCount)
  const favoriteMovies = useMemo(() => (
    favorites
      .filter((item) => item.type === 'movie')
      .map((favorite) => ({ favorite, movie: movies.find((movie) => movie.id === favorite.id) }))
  ), [favorites, movies])

  useEffect(() => {
    for (const category of visibleCategories) {
      const row = rows[category.id]
      if (!row?.loaded && !row?.loading) {
        void loadCategoryPage(category.id, 1)
      }
    }
  }, [loadCategoryPage, rows, visibleCategories])

  function focusTopNavigation() {
    const layout = pageRef.current?.closest<HTMLElement>('.app-layout')
    layout?.scrollTo({ top: 0, behavior: 'auto' })

    requestAnimationFrame(() => {
      const activeMenuItem = document.querySelector<HTMLElement>(
        '.arelon-topnav-item--active[data-focusable="true"]',
      )
      activeMenuItem?.focus()
    })
  }

  useRemote((cmd, type) => {
    if (type !== 'keydown' && type !== 'tizenhwkey') return
    if (cmd === 'BACK') {
      const cur = document.activeElement as HTMLElement | null
      if (cur?.closest('.arelon-topbar')) {
        setScreen('home')
      } else {
        focusTopNavigation()
      }
    }
    else if (cmd === 'UP') moveFocus('UP')
    else if (cmd === 'DOWN') moveFocus('DOWN')
    else if (cmd === 'LEFT') moveFocus('LEFT')
    else if (cmd === 'RIGHT') moveFocus('RIGHT')
    else if (cmd === 'ENTER') (document.activeElement as HTMLElement)?.click()
  })

  function playMovie(m: Movie) {
    rememberReturnPoint()
    setSelectedDetailMedia({
      id: m.id,
      title: m.name,
      url: m.streamUrl,
      type: 'movie',
      poster: m.poster,
      plot: m.plot,
      year: m.year,
      rating: m.rating
    })
  }

  function playFavoriteMovie(favorite: FavoriteItem, movie?: Movie) {
    rememberReturnPoint()
    setSelectedDetailMedia({
      id: favorite.id,
      title: movie?.name ?? favorite.title,
      url: movie?.streamUrl ?? favorite.url ?? '',
      type: 'movie',
      poster: movie?.poster ?? favorite.poster,
      plot: movie?.plot ?? favorite.plot,
      year: movie?.year ?? favorite.year,
      rating: movie?.rating ?? favorite.rating,
    })
  }

  return (
    <div className="home-page catalog-page" ref={pageRef}>
      <div className="home-content catalog-content">

        {favoriteMovies.length > 0 && (
          <MediaRow title="Filmes favoritos">
            {favoriteMovies.map(({ favorite, movie }) => (
              <MediaCard
                key={`favorite-${favorite.id}`}
                id={favorite.id}
                title={movie?.name ?? favorite.title}
                imageUrl={movie?.poster || favorite.poster || ''}
                aspectRatio="poster"
                focusKey={`movies-favorite-${favorite.id}`}
                onClick={() => playFavoriteMovie(favorite, movie)}
              />
            ))}
          </MediaRow>
        )}

        {movies.length > 0 && (
          <MediaRow title="Top 10">
            {movies.slice(0, 10).map((m, idx) => (
              <MediaCard
                key={`top-${m.id}`}
                id={m.id}
                title={m.name}
                imageUrl={m.poster || ''}
                aspectRatio="poster"
                topNumber={idx + 1}
                focusKey={`movies-top-${m.id}`}
                onClick={() => playMovie(m)}
              />
            ))}
          </MediaRow>
        )}

        {visibleCategories.map((cat) => {
          const row = rows[cat.id]
          const catMovies = row?.items ?? movies.filter((m) => m.categoryId === cat.id).slice(0, ROW_LIMIT)
          if (catMovies.length === 0) return null
          return (
            <MediaRow key={cat.id} title={cat.name}>
              {catMovies.map((m) => (
                <MediaCard
                  key={m.id}
                  id={m.id}
                  title={m.name}
                  imageUrl={m.poster || ''}
                  aspectRatio="poster"
                  focusKey={`movies-${cat.id}-${m.id}`}
                  onClick={() => playMovie(m)}
                />
              ))}
              {row?.hasMore && (
                <MediaCard
                  id={`more-${cat.id}`}
                  title={row.loading ? 'Carregando...' : 'Carregar mais'}
                  imageUrl=""
                  aspectRatio="poster"
                  focusKey={`movies-more-${cat.id}`}
                  onClick={() => {
                    if (!row.loading) void loadCategoryPage(cat.id, row.page + 1)
                  }}
                />
              )}
            </MediaRow>
          )
        })}

        {visibleCategoryCount < filteredCategories.length && (
          <button
            className="catalog-load-more-button"
            data-focusable="true"
            onClick={() => setVisibleCategoryCount((count) => Math.min(count + 6, filteredCategories.length))}
          >
            Carregar mais categorias
          </button>
        )}
      </div>
    </div>
  )
}
