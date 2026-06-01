import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { focusFirst, moveFocus, useRemote } from '../hooks/useRemote'
import { MediaRow } from '../components/MediaRow'
import { MediaCard } from '../components/MediaCard'
import type { Series } from '../store'

export function SeriesScreen() {
  const series = useStore((s) => s.series)
  const seriesCategories = useStore((s) => s.seriesCategories)
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

  return (
    <div className="home-page catalog-page" ref={pageRef}>
      <div className="home-content catalog-content">

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
                onClick={() => playSeries(s)}
              />
            ))}
          </MediaRow>
        )}

        {seriesCategories.filter(c => !['cliente', 'aviso', 'teste', 'suporte'].some(kw => c.name.toLowerCase().includes(kw))).map((cat) => {
          const catSeries = series.filter((s) => s.categoryId === cat.id).slice(0, 15)
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
                  onClick={() => playSeries(s)}
                />
              ))}
            </MediaRow>
          )
        })}
      </div>
    </div>
  )
}
