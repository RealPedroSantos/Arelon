import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { moveFocus, useRemote } from '../hooks/useRemote'
import { useMainReturnPoint } from '../hooks/useMainReturnPoint'
import { MediaRow } from '../components/MediaRow'
import { MediaCard } from '../components/MediaCard'
import type { FavoriteItem, Series } from '../store'
import { getSeriesCategories, getSeriesPage } from '../api/xtream'

const ROW_LIMIT = 15
const INITIAL_CATEGORY_COUNT = 6
const IGNORED_CATEGORY_KEYWORDS = ['cliente', 'aviso', 'teste', 'suporte']

type RowState = {
  items: Series[]
  page: number
  hasMore: boolean
  loading: boolean
  loaded: boolean
}

function mergeSeries(existing: Series[], next: Series[]): Series[] {
  const byId = new Map(existing.map((item) => [item.id, item]))
  for (const item of next) byId.set(item.id, item)
  return Array.from(byId.values())
}

export function SeriesScreen() {
  const server = useStore((s) => s.server)!
  const series = useStore((s) => s.series)
  const seriesCategories = useStore((s) => s.seriesCategories)
  const favorites = useStore((s) => s.favorites)
  const setSeries = useStore((s) => s.setSeries)
  const appendSeries = useStore((s) => s.appendSeries)
  const setSelectedDetailMedia = useStore((s) => s.setSelectedDetailMedia)
  const setScreen = useStore((s) => s.setScreen)
  const pageRef = useRef<HTMLDivElement>(null)
  const rememberReturnPoint = useMainReturnPoint('series', pageRef)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(INITIAL_CATEGORY_COUNT)

  useEffect(() => {
    if (seriesCategories.length > 0) return
    let cancelled = false

    getSeriesCategories(server.activeServer, server.username, server.password)
      .then((categories) => {
        if (!cancelled) setSeries(categories, series)
      })
      .catch((error) => console.error('[Arelon] erro ao carregar categorias de series', error))

    return () => {
      cancelled = true
    }
  }, [series, seriesCategories.length, server, setSeries])

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
      const result = await getSeriesPage(server.activeServer, server.username, server.password, {
        categoryId,
        page,
        limit: ROW_LIMIT,
      })
      appendSeries(result.items)
      setRows((prev) => ({
        ...prev,
        [categoryId]: {
          items: mergeSeries(page > 1 ? prev[categoryId]?.items ?? [] : [], result.items),
          page: result.page,
          hasMore: result.hasMore,
          loading: false,
          loaded: true,
        },
      }))
    } catch (error) {
      console.error('[Arelon] erro ao carregar series paginadas', { categoryId, page, error })
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
  }, [appendSeries, server])

  const filteredCategories = useMemo(() => (
    seriesCategories.filter((cat) => {
      const lower = cat.name.toLowerCase()
      return !IGNORED_CATEGORY_KEYWORDS.some((keyword) => lower.includes(keyword))
    })
  ), [seriesCategories])

  const visibleCategories = filteredCategories.slice(0, visibleCategoryCount)
  const favoriteSeries = useMemo(() => (
    favorites
      .filter((item) => item.type === 'series')
      .map((favorite) => ({ favorite, seriesItem: series.find((item) => item.id === favorite.id) }))
  ), [favorites, series])

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

  function playSeries(s: Series) {
    rememberReturnPoint()
    setSelectedDetailMedia({
      id: s.id,
      title: s.name,
      url: '',
      type: 'episode',
      poster: s.cover,
      plot: s.plot,
      year: s.year,
      rating: s.rating
    })
  }

  function playFavoriteSeries(favorite: FavoriteItem, seriesItem?: Series) {
    rememberReturnPoint()
    setSelectedDetailMedia({
      id: favorite.id,
      title: seriesItem?.name ?? favorite.title,
      url: '',
      type: 'episode',
      poster: seriesItem?.cover ?? favorite.poster,
      plot: seriesItem?.plot ?? favorite.plot,
      year: seriesItem?.year ?? favorite.year,
      rating: seriesItem?.rating ?? favorite.rating,
    })
  }

  return (
    <div className="home-page catalog-page" ref={pageRef}>
      <div className="home-content catalog-content">

        {favoriteSeries.length > 0 && (
          <MediaRow title="Séries favoritas">
            {favoriteSeries.map(({ favorite, seriesItem }) => (
              <MediaCard
                key={`favorite-${favorite.id}`}
                id={favorite.id}
                title={seriesItem?.name ?? favorite.title}
                imageUrl={seriesItem?.cover || favorite.poster || ''}
                aspectRatio="poster"
                focusKey={`series-favorite-${favorite.id}`}
                onClick={() => playFavoriteSeries(favorite, seriesItem)}
              />
            ))}
          </MediaRow>
        )}

        {series.length > 0 && (
          <MediaRow title="Top 10">
            {series.slice(0, 10).map((s, idx) => (
              <MediaCard
                key={`top-${s.id}`}
                id={s.id}
                title={s.name}
                imageUrl={s.cover || ''}
                aspectRatio="poster"
                topNumber={idx + 1}
                focusKey={`series-top-${s.id}`}
                onClick={() => playSeries(s)}
              />
            ))}
          </MediaRow>
        )}

        {visibleCategories.map((cat) => {
          const row = rows[cat.id]
          const catSeries = row?.items ?? series.filter((s) => s.categoryId === cat.id).slice(0, ROW_LIMIT)
          if (catSeries.length === 0) return null
          return (
            <MediaRow key={cat.id} title={cat.name}>
              {catSeries.map((s) => (
                <MediaCard
                  key={s.id}
                  id={s.id}
                  title={s.name}
                  imageUrl={s.cover || ''}
                  aspectRatio="poster"
                  focusKey={`series-${cat.id}-${s.id}`}
                  onClick={() => playSeries(s)}
                />
              ))}
              {row?.hasMore && (
                <MediaCard
                  id={`more-${cat.id}`}
                  title={row.loading ? 'Carregando...' : 'Carregar mais'}
                  imageUrl=""
                  aspectRatio="poster"
                  focusKey={`series-more-${cat.id}`}
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
