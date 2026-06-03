import { useMemo, useRef } from 'react'
import { useStore } from '../store'
import type { Channel, Movie, Series } from '../store'
import { moveFocus, useRemote } from '../hooks/useRemote'
import { useMainReturnPoint } from '../hooks/useMainReturnPoint'
import { MediaRow } from '../components/MediaRow'
import { MediaCard } from '../components/MediaCard'

const KIDS_KEYWORDS = [
  'infantil',
  'kids',
  'kid',
  'criança',
  'crianca',
  'desenho',
  'cartoon',
  'animação',
  'animacao',
  'anime',
  'disney',
  'nick',
  'nickelodeon',
]

function hasKidsKeyword(value: string) {
  const normalized = value.toLowerCase()
  return KIDS_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

export function KidsScreen() {
  const liveChannels = useStore((s) => s.liveChannels)
  const liveCategories = useStore((s) => s.liveCategories)
  const movies = useStore((s) => s.movies)
  const movieCategories = useStore((s) => s.movieCategories)
  const series = useStore((s) => s.series)
  const seriesCategories = useStore((s) => s.seriesCategories)
  const server = useStore((s) => s.server)!
  const setCurrentMedia = useStore((s) => s.setCurrentMedia)
  const setSelectedDetailMedia = useStore((s) => s.setSelectedDetailMedia)
  const setScreen = useStore((s) => s.setScreen)
  const pageRef = useRef<HTMLDivElement>(null)
  const rememberReturnPoint = useMainReturnPoint('kids', pageRef)

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

  function playChannel(ch: Channel) {
    rememberReturnPoint()
    setCurrentMedia({
      id: ch.id,
      title: ch.name,
      url: ch.streamUrl,
      type: 'live',
      poster: ch.logo,
      isLive: true,
      assignedServer: server.activeServer,
      streams: ch.streams,
    })
  }

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
      rating: m.rating,
    })
  }

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
      rating: s.rating,
    })
  }

  const { kidsChannels, kidsMovies, kidsSeries } = useMemo(() => {
    const liveKidsIds = new Set(liveCategories.filter((cat) => hasKidsKeyword(cat.name)).map((cat) => cat.id))
    const movieKidsIds = new Set(movieCategories.filter((cat) => hasKidsKeyword(cat.name)).map((cat) => cat.id))
    const seriesKidsIds = new Set(seriesCategories.filter((cat) => hasKidsKeyword(cat.name)).map((cat) => cat.id))

    return {
      kidsChannels: liveChannels
        .filter((channel) => liveKidsIds.has(channel.categoryId) || hasKidsKeyword(channel.name))
        .slice(0, 15),
      kidsMovies: movies
        .filter((movie) => movieKidsIds.has(movie.categoryId) || hasKidsKeyword(movie.name))
        .slice(0, 15),
      kidsSeries: series
        .filter((item) => seriesKidsIds.has(item.categoryId) || hasKidsKeyword(item.name))
        .slice(0, 15),
    }
  }, [liveCategories, liveChannels, movieCategories, movies, seriesCategories, series])

  const kidsTop10 = useMemo(() => {
    const list: Array<({ type: 'movie' } & Movie) | ({ type: 'series' } & Series)> = []
    const limit = 10
    const topMovies = kidsMovies.slice(0, limit)
    const topSeries = kidsSeries.slice(0, limit)
    for (let i = 0; list.length < limit && (i < topMovies.length || i < topSeries.length); i++) {
      const movie = topMovies[i]
      const srs = topSeries[i]
      if (movie && list.length < limit) list.push({ type: 'movie', ...movie })
      if (srs && list.length < limit) list.push({ type: 'series', ...srs })
    }
    return list
  }, [kidsMovies, kidsSeries])

  const isEmpty = kidsChannels.length === 0 && kidsMovies.length === 0 && kidsSeries.length === 0

  return (
    <div className="home-page catalog-page" ref={pageRef}>
      <div className="home-content catalog-content">

        {isEmpty && <div className="status-msg">Nenhum conteúdo infantil encontrado no catálogo atual.</div>}

        {kidsTop10.length > 0 && (
          <MediaRow title="Top 10">
            {kidsTop10.map((item, idx) => (
              <MediaCard
                key={`top-${item.type}-${item.id}`}
                id={item.id}
                title={item.name}
                imageUrl={item.type === 'movie' ? (item as Movie).poster : (item as Series).cover}
                aspectRatio="poster"
                topNumber={idx + 1}
                focusKey={`kids-top-${item.type}-${item.id}`}
                onClick={() => {
                  if (item.type === 'movie') playMovie(item)
                  else playSeries(item)
                }}
              />
            ))}
          </MediaRow>
        )}

        {kidsChannels.length > 0 && (
          <MediaRow title="Canais infantis">
            {kidsChannels.map((channel) => (
              <MediaCard
                key={channel.id}
                id={channel.id}
                title={channel.name}
                imageUrl={channel.logo || ''}
                aspectRatio="landscape"
                logoTile
                logoCdn={channel.logoCdn}
                logoPlaylist={channel.logoPlaylist}
                logoPlaceholder={channel.logoPlaceholder}
                focusKey={`kids-live-${channel.id}`}
                onClick={() => playChannel(channel)}
              />
            ))}
          </MediaRow>
        )}

        {kidsMovies.length > 0 && (
          <MediaRow title="Filmes infantis">
            {kidsMovies.map((movie) => (
              <MediaCard
                key={movie.id}
                id={movie.id}
                title={movie.name}
                imageUrl={movie.poster || ''}
                aspectRatio="poster"
                focusKey={`kids-movie-${movie.id}`}
                onClick={() => playMovie(movie)}
              />
            ))}
          </MediaRow>
        )}

        {kidsSeries.length > 0 && (
          <MediaRow title="Séries infantis">
            {kidsSeries.map((item) => (
              <MediaCard
                key={item.id}
                id={item.id}
                title={item.name}
                imageUrl={item.cover || ''}
                aspectRatio="poster"
                focusKey={`kids-series-${item.id}`}
                onClick={() => playSeries(item)}
              />
            ))}
          </MediaRow>
        )}
      </div>
    </div>
  )
}
