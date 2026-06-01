import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { focusFirst, moveFocus, useRemote } from '../hooks/useRemote'
import { MediaRow } from '../components/MediaRow'
import { MediaCard } from '../components/MediaCard'
import type { Movie } from '../store'

export function MoviesScreen() {
  const movies = useStore((s) => s.movies)
  const movieCategories = useStore((s) => s.movieCategories)
  const setSelectedDetailMedia = useStore((s) => s.setSelectedDetailMedia)
  const setScreen = useStore((s) => s.setScreen)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => focusFirst(pageRef.current), 150)
    return () => clearTimeout(t)
  }, [])

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

  return (
    <div className="home-page catalog-page" ref={pageRef}>
      <div className="home-content catalog-content">

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
                onClick={() => playMovie(m)}
              />
            ))}
          </MediaRow>
        )}

        {movieCategories.filter(c => !['cliente', 'aviso', 'teste', 'suporte'].some(kw => c.name.toLowerCase().includes(kw))).map((cat) => {
          const catMovies = movies.filter((m) => m.categoryId === cat.id).slice(0, 15)
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
                  onClick={() => playMovie(m)}
                />
              ))}
            </MediaRow>
          )
        })}
      </div>
    </div>
  )
}
