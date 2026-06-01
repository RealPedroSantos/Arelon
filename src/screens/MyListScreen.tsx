import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import type { ContinueWatchingItem } from '../store'
import { focusFirst, moveFocus, useRemote } from '../hooks/useRemote'
import { MediaRow } from '../components/MediaRow'
import { MediaCard } from '../components/MediaCard'

export function MyListScreen() {
  const continueWatching = useStore((s) => s.continueWatching)
  const setCurrentMedia = useStore((s) => s.setCurrentMedia)
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

  function resumeMedia(item: ContinueWatchingItem) {
    setCurrentMedia({ ...item, startPosition: item.position })
  }

  return (
    <div className="home-page catalog-page" ref={pageRef}>
      <div className="home-content catalog-content">
        <section className="catalog-heading">
          <h1>Minha Lista</h1>
          <p>Itens salvos e conteúdos em andamento aparecem aqui quando houver dados reais do usuário.</p>
        </section>

        {continueWatching.length === 0 ? (
          <div className="status-msg">Nenhum conteúdo salvo no Arelon.</div>
        ) : (
          <MediaRow title="Continue assistindo">
            {continueWatching.slice(0, 20).map((item) => (
              <MediaCard
                key={`${item.type}-${item.id}`}
                id={item.id}
                title={item.title}
                imageUrl={item.poster || ''}
                aspectRatio={item.type === 'live' ? 'landscape' : 'poster'}
                onClick={() => resumeMedia(item)}
              />
            ))}
          </MediaRow>
        )}
      </div>
    </div>
  )
}
