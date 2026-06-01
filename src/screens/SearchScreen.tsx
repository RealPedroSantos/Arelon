import { useRef, useState } from 'react'
import { useStore } from '../store'

import { moveFocus, useRemote } from '../hooks/useRemote'
import { MediaRow } from '../components/MediaRow'
import { MediaCard } from '../components/MediaCard'
import { Keyboard } from '../components/Keyboard'
import type { Channel, Movie, Series } from '../store'

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const liveChannels = useStore((s) => s.liveChannels)
  const movies = useStore((s) => s.movies)
  const series = useStore((s) => s.series)
  
  const setSelectedDetailMedia = useStore((s) => s.setSelectedDetailMedia)
  const setCurrentMedia = useStore((s) => s.setCurrentMedia)
  const setScreen = useStore((s) => s.setScreen)
  const server = useStore((s) => s.server)!

  const pageRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [browsingResults, setBrowsingResults] = useState(false)

  function focusTopNavigation() {
    const layout = pageRef.current?.closest<HTMLElement>('.app-layout')
    layout?.scrollTo({ top: 0, behavior: 'auto' })

    requestAnimationFrame(() => {
      const searchButton = document.querySelector<HTMLElement>(
        '.arelon-icon-button[aria-label="Buscar"][data-focusable="true"]',
      )
      searchButton?.focus()
    })
  }

  useRemote((cmd, type) => {
    if (type !== 'keydown' && type !== 'tizenhwkey') return
    const cur = document.activeElement as HTMLElement | null
    if (cmd === 'BACK') {
      if (cur?.closest('.arelon-topbar')) {
        setScreen('home')
      } else if (browsingResults) {
        setBrowsingResults(false)
      } else if (query !== '') {
        setQuery('')
      } else {
        focusTopNavigation()
      }
      return
    }
    if (cur?.closest('.arelon-topbar')) {
      if (cmd === 'UP') moveFocus('UP')
      else if (cmd === 'DOWN') moveFocus('DOWN')
      else if (cmd === 'LEFT') moveFocus('LEFT')
      else if (cmd === 'RIGHT') moveFocus('RIGHT')
      else if (cmd === 'ENTER') (document.activeElement as HTMLElement)?.click()
      return
    }
    // When browsing results, handle D-Pad navigation
    if (browsingResults) {
      if (cmd === 'UP') moveFocus('UP')
      else if (cmd === 'DOWN') moveFocus('DOWN')
      else if (cmd === 'LEFT') moveFocus('LEFT')
      else if (cmd === 'RIGHT') moveFocus('RIGHT')
      else if (cmd === 'ENTER') (document.activeElement as HTMLElement)?.click()
    }
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
      streams: ch.streams
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
      rating: m.rating
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
      rating: s.rating
    })
  }

  function handleSearchDone() {
    if (hasResults) {
      setBrowsingResults(true)
      setTimeout(() => {
        const firstCard = resultsRef.current?.querySelector<HTMLElement>('[data-focusable="true"]')
        firstCard?.focus()
      }, 100)
    }
  }

  const normalizedQuery = query.toLowerCase().trim()
  
  const searchResultsChannels = normalizedQuery 
    ? liveChannels.filter(c => c.name.toLowerCase().includes(normalizedQuery)).slice(0, 15)
    : []

  const searchResultsMovies = normalizedQuery 
    ? movies.filter(m => m.name.toLowerCase().includes(normalizedQuery)).slice(0, 15)
    : []

  const searchResultsSeries = normalizedQuery 
    ? series.filter(s => s.name.toLowerCase().includes(normalizedQuery)).slice(0, 15)
    : []

  const hasResults = searchResultsChannels.length > 0 || searchResultsMovies.length > 0 || searchResultsSeries.length > 0

  return (
    <div className="search-page" ref={pageRef}>
      <div className="search-top">
        <div className="search-panel">
          <div className="search-input-row">
            <div className="search-icon-tile" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </div>

            <div className="search-display">
              <span className="search-display-value">{query}</span>
            </div>
          </div>

          {!browsingResults && (
            <div className="search-keyboard">
              <Keyboard
                label="Buscar"
                value={query}
                onChange={setQuery}
                onDone={handleSearchDone}
                doneLabel="Buscar"
              />
            </div>
          )}
        </div>

        <div className="search-results" ref={resultsRef}>
          {query && !hasResults && (
            <div className="status-msg">Nenhum resultado encontrado para "{query}".</div>
          )}

          {searchResultsChannels.length > 0 && (
            <MediaRow title="Canais de TV Ao Vivo">
              {searchResultsChannels.map((c) => (
                <MediaCard
                  key={c.id}
                  id={c.id}
                  title={c.name}
                  imageUrl={c.logo || ''}
                  aspectRatio="landscape"
                  logoTile
                  logoCdn={c.logoCdn}
                  logoPlaylist={c.logoPlaylist}
                  logoPlaceholder={c.logoPlaceholder}
                  onClick={() => playChannel(c)}
                />
              ))}
            </MediaRow>
          )}

          {searchResultsMovies.length > 0 && (
            <MediaRow title="Filmes Encontrados">
              {searchResultsMovies.map((m) => (
                <MediaCard
                  key={m.id}
                  id={m.id}
                  title={m.name}
                  imageUrl={m.poster || ''}
                  aspectRatio="poster"
                  onClick={() => playMovie(m)}
                />
              ))}
            </MediaRow>
          )}

          {searchResultsSeries.length > 0 && (
            <MediaRow title="Séries Encontradas">
              {searchResultsSeries.map((s) => (
                <MediaCard
                  key={s.id}
                  id={s.id}
                  title={s.name}
                  imageUrl={s.cover || ''}
                  aspectRatio="poster"
                  onClick={() => playSeries(s)}
                />
              ))}
            </MediaRow>
          )}
        </div>
      </div>
    </div>
  )
}
