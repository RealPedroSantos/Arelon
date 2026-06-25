import { useRef, useMemo, useState, useEffect } from 'react'
import { useStore, shouldShowChannel } from '../store'
import type { Channel, ContinueWatchingItem, Movie, Series } from '../store'
import { moveFocus, useRemote } from '../hooks/useRemote'
import { useMainReturnPoint } from '../hooks/useMainReturnPoint'
import { MediaRow } from '../components/MediaRow'
import { MediaCard } from '../components/MediaCard'
import { buildHomeCarousels, type CarouselItem } from '../lib/homeCarousels'

function runRandomAction(actions: Array<() => void>) {
  if (actions.length === 0) return
  const randomIndex = Math.floor(Math.random() * actions.length)
  actions[randomIndex]?.()
}

export function HomeScreen() {
  const server = useStore((s) => s.server)!
  const rawLiveChannels = useStore((s) => s.liveChannels)
  const selectedState = useStore((s) => s.selectedState)
  const liveChannels = rawLiveChannels.filter((c) => shouldShowChannel(c.name, selectedState))
  const movies = useStore((s) => s.movies)
  const series = useStore((s) => s.series)
  const error = useStore((s) => s.error)
  const continueWatching = useStore((s) => s.continueWatching)
  const setCurrentMedia = useStore((s) => s.setCurrentMedia)
  const setSelectedDetailMedia = useStore((s) => s.setSelectedDetailMedia)

  const pageRef = useRef<HTMLDivElement>(null)
  const rememberReturnPoint = useMainReturnPoint('home', pageRef)

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

  function resumeMedia(item: ContinueWatchingItem) {
    rememberReturnPoint()
    setCurrentMedia({ ...item, startPosition: item.position })
  }

  function handleCarouselItemClick(item: CarouselItem) {
    rememberReturnPoint()
    if (item.type === 'live') {
      const ch = liveChannels.find((c) => c.id === item.id)
      if (ch) playChannel(ch)
      return
    }
    if (item.type === 'movie') {
      const m = movies.find((x) => x.id === item.id)
      if (m) playMovie(m)
      return
    }
    if (item.type === 'series') {
      const s = series.find((x) => x.id === item.id)
      if (s) playSeries(s)
    }
  }

  function handleWatchNow() {
    const allActions: Array<() => void> = [
      ...liveChannels.map((ch) => () => playChannel(ch)),
      ...movies.map((m) => () => playMovie(m)),
      ...series.map((s) => () => playSeries(s)),
    ]
    runRandomAction(allActions)
  }

  // ── Monta carrosséis com curadoria inteligente ─────────────────────────────
  const carousels = useMemo(
    () =>
      buildHomeCarousels({
        movies,
        series,
        liveChannels,
        continueWatching,
        // sessionCount: recuperar do store ou localStorage quando implementado
        sessionCount: 0,
      }),
    [movies, series, liveChannels, continueWatching],
  )

  // Carrossel "Continue Assistindo" é renderizado separadamente para usar resumeMedia
  const continueWatchingCarousel = continueWatching
    .filter((i) => i.type !== 'live')
    .slice(0, 8)

  const hasAnyContent = liveChannels.length > 0 || movies.length > 0 || series.length > 0
  const isEmpty = !hasAnyContent

  // ── Hero dinâmico ────────────────────────────────────────────────────────
  const heroItems = useMemo(() => {
    type HeroItem = { title: string; plot?: string; backdrop: string; type: 'movie' | 'series'; item: Movie | Series }
    const items: HeroItem[] = []
    for (const m of movies.slice(0, 30)) {
      if (m.backdrop) items.push({ title: m.name, plot: m.plot, backdrop: m.backdrop, type: 'movie', item: m })
    }
    for (const s of series.slice(0, 30)) {
      if (s.backdrop) items.push({ title: s.name, plot: s.plot, backdrop: s.backdrop, type: 'series', item: s })
    }
    return items.slice(0, 8)
  }, [movies, series])

  const [heroIndex, setHeroIndex] = useState(0)
  useEffect(() => {
    if (heroItems.length <= 1) return
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % heroItems.length), 8000)
    return () => clearInterval(t)
  }, [heroItems.length])

  const currentHero = heroItems[heroIndex] ?? null

  function handleHeroClick() {
    if (!currentHero) { handleWatchNow(); return }
    if (currentHero.type === 'movie') playMovie(currentHero.item as Movie)
    else playSeries(currentHero.item as Series)
  }

    return (
    <div className="home-page home-page--arelon" ref={pageRef}>
      <section
        className="arelon-hero"
        aria-label="Destaque Arelon"
        style={currentHero ? {
          backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,.96) 0%, rgba(0,0,0,.72) 35%, rgba(0,0,0,.08) 68%, rgba(0,0,0,.42) 100%), linear-gradient(180deg, rgba(0,0,0,.22) 0%, rgba(0,0,0,.04) 48%, #000 100%), url("' + currentHero.backdrop + '")' ,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      >
        <div className="arelon-hero-copy">
          <h1>{currentHero ? currentHero.title : 'Viva grandes histórias'}</h1>
          <p style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {currentHero?.plot ?? 'TV ao vivo, filmes e séries quando e onde quiser.'}
          </p>
          <button
            className="arelon-primary-cta hero-btn"
            data-focusable="true"
            aria-disabled={!hasAnyContent}
            onClick={handleHeroClick}
          >
            ASSISTIR AGORA
          </button>
        </div>
      </section>

      <div className="arelon-home-rails">
        {isEmpty && (
          <div className="status-msg">
            <p>{error || 'Nenhum conteúdo disponível.'}</p>
            <button
              className="arelon-primary-cta"
              data-focusable="true"
              onClick={() => window.location.reload()}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Carrosséis de curadoria inteligente */}
        {carousels.map((carousel) => {
          // "Continue assistindo" tem lógica própria de click (resumeMedia)
          if (carousel.id === 'continue_watching') {
            if (continueWatchingCarousel.length === 0) return null
            return (
              <MediaRow key="continue_watching" title={carousel.title}>
                {continueWatchingCarousel.map((item) => (
                  <MediaCard
                    key={`cont-${item.type}-${item.id}`}
                    id={item.id}
                    title={item.title}
                    imageUrl={item.poster ?? ''}
                    aspectRatio={item.type === 'live' ? 'landscape' : 'poster'}
                    focusKey={`home-continue-${item.type}-${item.id}`}
                    onClick={() => resumeMedia(item)}
                  />
                ))}
              </MediaRow>
            )
          }

          return (
            <MediaRow key={carousel.id} title={carousel.title}>
              {carousel.items.map((item, idx) => (
                <MediaCard
                  key={`${carousel.id}-${item.type}-${item.id}`}
                  id={item.id}
                  title={item.title}
                  imageUrl={item.imageUrl}
                  aspectRatio={item.type === 'live' ? 'landscape' : 'poster'}
                  logoTile={item.type === 'live'}
                  topNumber={carousel.id === 'top10' ? idx + 1 : undefined}
                  focusKey={`home-${carousel.id}-${item.type}-${item.id}`}
                  onClick={() => handleCarouselItemClick(item)}
                />
              ))}
            </MediaRow>
          )
        })}
      </div>
    </div>
  )
}
