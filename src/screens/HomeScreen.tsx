import { useEffect, useRef } from 'react'
import { useStore, shouldShowChannel } from '../store'
import type { Channel, ContinueWatchingItem, Movie, Series } from '../store'
import {
  getLiveChannels,
  getMovies,
  getAllSeries,
  getLiveCategories,
  getMovieCategories,
  getSeriesCategories,
} from '../api/xtream'
import { focusFirst, moveFocus, useRemote } from '../hooks/useRemote'
import { MediaRow } from '../components/MediaRow'
import { MediaCard } from '../components/MediaCard'


export function HomeScreen() {
  const server = useStore((s) => s.server)!
  const rawLiveChannels = useStore((s) => s.liveChannels)
  const selectedState = useStore((s) => s.selectedState)
  const liveChannels = rawLiveChannels.filter(c => shouldShowChannel(c.name, selectedState))
  const movies = useStore((s) => s.movies)
  const series = useStore((s) => s.series)
  const continueWatching = useStore((s) => s.continueWatching)
  const setLive = useStore((s) => s.setLive)
  const setMovies = useStore((s) => s.setMovies)
  const setSeries = useStore((s) => s.setSeries)
  const setCurrentMedia = useStore((s) => s.setCurrentMedia)
  const setSelectedDetailMedia = useStore((s) => s.setSelectedDetailMedia)

  const isLoading = useStore((s) => s.isLoading)
  const setLoading = useStore((s) => s.setLoading)

  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (liveChannels.length === 0 && movies.length === 0 && series.length === 0) {
      setLoading(true)
      const tasks: Array<() => Promise<{ k: string; n: number }>> = [
        async () => {
          const cats = await getLiveCategories(server.activeServer, server.username, server.password)
          const chs = await getLiveChannels(server.activeServer, server.username, server.password)
          setLive(cats, chs)
          return { k: 'canais', n: chs.length }
        },

        async () => {
          const cats = await getMovieCategories(server.activeServer, server.username, server.password)
          const mvs = await getMovies(server.activeServer, server.username, server.password)
          setMovies(cats, mvs)
          return { k: 'filmes', n: mvs.length }
        },

        async () => {
          const cats = await getSeriesCategories(server.activeServer, server.username, server.password)
          const srs = await getAllSeries(server.activeServer, server.username, server.password)
          setSeries(cats, srs)
          return { k: 'séries', n: srs.length }
        },
      ]
      void (async () => {
        const results: Array<PromiseSettledResult<{ k: string; n: number }>> = []
        for (const task of tasks) {
          try {
            results.push({ status: 'fulfilled', value: await task() })
          } catch (reason: unknown) {
            results.push({ status: 'rejected', reason })
          }
        }
        return results
      })()
        .then((results) => {
          const oks = results
            .filter((r): r is PromiseFulfilledResult<{ k: string; n: number }> => r.status === 'fulfilled')
            .map((r) => r.value)
          const fails = results
            .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
            .map((r): unknown => r.reason)
          const counts = oks.map((o) => `${o.k}:${o.n}`).join(', ')
          const total = oks.reduce((s, o) => s + o.n, 0)
          if (fails.length > 0 || total === 0) {
            // Logado também para sdb dlog (console da TV)
            console.error('[Arelon] carregamento', { server: server.activeServer, counts, fails })
          }
        })
        .finally(() => setLoading(false))
    }
    const t = setTimeout(() => focusFirst(pageRef.current), 200)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (cmd === 'BACK') focusTopNavigation()
    else if (cmd === 'UP') moveFocus('UP')
    else if (cmd === 'DOWN') moveFocus('DOWN')
    else if (cmd === 'LEFT') moveFocus('LEFT')
    else if (cmd === 'RIGHT') moveFocus('RIGHT')
    else if (cmd === 'ENTER') (document.activeElement as HTMLElement)?.click()
  })

  function playChannel(ch: Channel) {
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

  function resumeMedia(item: ContinueWatchingItem) {
    setCurrentMedia({ ...item, startPosition: item.position })
  }

  function handleWatchNow() {
    // Sorteia aleatoriamente entre todos os conteúdos disponíveis
    const allActions: Array<() => void> = [
      ...liveChannels.map((ch) => () => playChannel(ch)),
      ...movies.map((m) => () => playMovie(m)),
      ...series.map((s) => () => playSeries(s)),
    ]
    if (allActions.length === 0) return
    const randomIndex = Math.floor(Math.random() * allActions.length)
    allActions[randomIndex]!()
  }

  const featChannels = liveChannels.slice(0, 15)
  const featMovies = movies.slice(0, 15)
  
  // Combina filmes e séries de forma intercalada, completando até 10 mesmo se só um tipo estiver disponível.
  const top10Combined = (() => {
    const list: Array<({ type: 'movie' } & Movie) | ({ type: 'series' } & Series)> = []
    const limit = 10
    const topMoviesList = movies.slice(0, limit)
    const topSeriesList = series.slice(0, limit)
    for (let i = 0; list.length < limit && (i < topMoviesList.length || i < topSeriesList.length); i++) {
      const movie = topMoviesList[i]
      const srs = topSeriesList[i]
      if (movie && list.length < limit) list.push({ type: 'movie', ...movie })
      if (srs && list.length < limit) list.push({ type: 'series', ...srs })
    }
    return list
  })()

  const featSeries = series.slice(5, 20)
  const hasAnyContent = liveChannels.length > 0 || movies.length > 0 || series.length > 0
  const isEmpty = !isLoading && !hasAnyContent

  return (
    <div className="home-page home-page--arelon" ref={pageRef}>
      <section className="arelon-hero" aria-label="Destaque Arelon">
        <div className="arelon-hero-copy">
          <h1>Viva grandes histórias</h1>
          <p>TV ao vivo, filmes e séries quando e onde quiser.</p>
          <button
            className="arelon-primary-cta hero-btn"
            data-focusable="true"
            aria-disabled={!hasAnyContent}
            onClick={handleWatchNow}
          >
            ASSISTIR AGORA
          </button>
        </div>
      </section>

      <div className="arelon-home-rails">
        {isLoading && (
          <div className="arelon-loading-block">
            <div className="status-msg">Carregando catálogo...</div>
            <div className="arelon-skeleton-row" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div className="arelon-skeleton-card" key={idx} />
              ))}
            </div>
          </div>
        )}

        {isEmpty && <div className="status-msg">Nenhum conteúdo disponível.</div>}

        {top10Combined.length > 0 && (
          <MediaRow title="Top 10">
            {top10Combined.map((item, idx) => (
              <MediaCard
                key={`top-${item.type}-${item.id}`}
                id={item.id}
                title={item.name}
                imageUrl={item.type === 'movie' ? (item as Movie).poster : (item as Series).cover}
                aspectRatio="poster"
                topNumber={idx + 1}
                onClick={() => {
                  if (item.type === 'movie') playMovie(item)
                  else playSeries(item)
                }}
              />
            ))}
          </MediaRow>
        )}

        {continueWatching.length > 0 && (
          <MediaRow title="Continue assistindo">
            {continueWatching.slice(0, 10).map((item) => (
              <MediaCard
                key={`cont-${item.type}-${item.id}`}
                id={item.id}
                title={item.title}
                imageUrl={item.poster || ''}
                aspectRatio={item.type === 'live' ? 'landscape' : 'poster'}
                onClick={() => resumeMedia(item)}
              />
            ))}
          </MediaRow>
        )}

        {featMovies.length > 0 && (
          <MediaRow title="Lançamentos">
            {featMovies.map((m) => (
              <MediaCard
                key={`new-${m.id}`}
                id={m.id}
                title={m.name}
                imageUrl={m.poster || ''}
                aspectRatio="poster"
                onClick={() => playMovie(m)}
              />
            ))}
          </MediaRow>
        )}

        {featSeries.length > 0 && (
          <MediaRow title="Séries em destaque">
            {featSeries.map((s) => (
              <MediaCard
                key={`feat-${s.id}`}
                id={s.id}
                title={s.name}
                imageUrl={s.cover || ''}
                aspectRatio="poster"
                onClick={() => playSeries(s)}
              />
            ))}
          </MediaRow>
        )}

        {featChannels.length > 0 && (
          <MediaRow title="TV ao vivo">
            {featChannels.map((ch) => (
              <MediaCard
                key={`live-${ch.id}`}
                id={ch.id}
                title={ch.name}
                imageUrl={ch.logo || ''}
                aspectRatio="landscape"
                logoTile
                logoCdn={ch.logoCdn}
                logoPlaylist={ch.logoPlaylist}
                logoPlaceholder={ch.logoPlaceholder}
                onClick={() => playChannel(ch)}
              />
            ))}
          </MediaRow>
        )}
      </div>
    </div>
  )
}
