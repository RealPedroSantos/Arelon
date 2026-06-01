import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore, type Screen } from '../store'
import { activateFocusedElement, focusFirst, moveFocus, useRemote } from '../hooks/useRemote'
import { playLogoutSound, unlockAudio } from '../lib/tvSound'

type AppShellProps = {
  children: ReactNode
}

type TopNavItem = {
  label: string
  screen: Screen
  activeScreens?: Screen[]
}

const TOP_NAV_ITEMS: TopNavItem[] = [
  { label: 'Início', screen: 'home' },
  { label: 'Ao vivo', screen: 'tv', activeScreens: ['tv', 'live'] },
  { label: 'Esporte', screen: 'esporte' },
  { label: 'Filme', screen: 'movies' },
  { label: 'Série', screen: 'series' },
  { label: 'Infantil', screen: 'kids' },
  { label: 'Minha Lista', screen: 'mylist' },
]

export function AppShell({ children }: AppShellProps) {
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const currentMedia = useStore((s) => s.currentMedia)
  const selectedDetailMedia = useStore((s) => s.selectedDetailMedia)
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const logout = useStore((s) => s.logout)

  const modalRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const shellActive = isAuthenticated && !currentMedia

  useEffect(() => {
    if (layoutRef.current) {
      layoutRef.current.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [screen, selectedDetailMedia])

  useEffect(() => {
    if (!showLogoutModal) return

    // 1) Marca os elementos atrás do modal como inert para impedir qualquer foco nativo
    const topbar = layoutRef.current?.querySelector<HTMLElement>('.arelon-topbar')
    const contentArea = layoutRef.current?.querySelector<HTMLElement>('.app-content-area')
    if (topbar) topbar.setAttribute('inert', '')
    if (contentArea) contentArea.setAttribute('inert', '')

    // 2) Foca o primeiro botão do modal
    const t = setTimeout(() => focusFirst(modalRef.current), 50)

    // 3) Listener de segurança: se o foco escapar do modal, redireciona de volta
    const trapFocus = (e: FocusEvent) => {
      const modal = modalRef.current
      if (!modal) return
      const target = e.target as HTMLElement | null
      if (target && !modal.contains(target)) {
        e.stopImmediatePropagation()
        focusFirst(modal)
      }
    }
    document.addEventListener('focusin', trapFocus, true)

    return () => {
      clearTimeout(t)
      document.removeEventListener('focusin', trapFocus, true)
      if (topbar) topbar.removeAttribute('inert')
      if (contentArea) contentArea.removeAttribute('inert')
    }
  }, [showLogoutModal])

  useRemote((cmd, type) => {
    if (!shellActive || !showLogoutModal || (type !== 'keydown' && type !== 'tizenhwkey')) return
    if (cmd === 'BACK') setShowLogoutModal(false)
    else if (cmd === 'UP') moveFocus('UP')
    else if (cmd === 'DOWN') moveFocus('DOWN')
    else if (cmd === 'LEFT') moveFocus('LEFT')
    else if (cmd === 'RIGHT') moveFocus('RIGHT')
    else if (cmd === 'ENTER') activateFocusedElement(modalRef.current)
  }, true, { allowWhenModal: true })

  if (!shellActive) return <>{children}</>
  const showTopbar = !selectedDetailMedia && screen !== 'multiview'

  function navigate(newScreen: Screen) {
    setScreen(newScreen)
  }

  function confirmLogout() {
    unlockAudio();
    playLogoutSound();
    setShowLogoutModal(false)
    logout()
  }

  function isActive(item: TopNavItem) {
    return item.activeScreens ? item.activeScreens.includes(screen) : screen === item.screen
  }

  return (
    <div className="app-layout" ref={layoutRef}>
      {showTopbar && <header className="arelon-topbar">
        <div className="arelon-logo-container">
          <img
            className="arelon-logo"
            src="assets/arelon/logo-arelon-padrao.png"
            alt="Arelon"
          />
        </div>

        <nav className="arelon-topnav" aria-label="Navegação principal">
          {TOP_NAV_ITEMS.map((item) => {
            const active = isActive(item)
            return (
              <button
                key={item.screen}
                className={`arelon-topnav-item ${active ? 'arelon-topnav-item--active' : ''}`}
                data-focusable="true"
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(item.screen)}
              >
                <span>{item.label}</span>
                {active && (
                  <img
                    className="arelon-active-indicator"
                    src="assets/arelon/icone-pagina-ativa.png"
                    alt=""
                    aria-hidden="true"
                  />
                )}
              </button>
            )
          })}
        </nav>

        <div className="arelon-top-actions">
          <button
            className="arelon-icon-button"
            data-focusable="true"
            aria-label="Buscar"
            onClick={() => navigate('search')}
          >
            <img src="assets/arelon/pesquisar-icone.png" alt="" aria-hidden="true" className="arelon-action-icon" />
          </button>

          <button
            className="arelon-icon-button"
            data-focusable="true"
            aria-label="Multi-View"
            onClick={() => navigate('multiview')}
          >
            <img src="assets/arelon/multiview-icone.png" alt="" aria-hidden="true" className="arelon-action-icon" />
          </button>

          <button
            className="arelon-icon-button"
            data-focusable="true"
            aria-label="Perfil"
            onClick={() => {
              unlockAudio();
              playLogoutSound();
              setShowLogoutModal(true);
            }}
          >
            <img src="assets/arelon/usuario-icone.png" alt="" aria-hidden="true" className="arelon-action-icon" />
          </button>
        </div>
      </header>}

      <main className="app-content-area">
        {children}
      </main>

      {showLogoutModal && (
        <div className="modal-overlay">
          <div className="modal-content" ref={modalRef}>
            <h2>Tem certeza que deseja sair?</h2>
            <p>Você precisará fazer login novamente para acessar o Arelon.</p>
            <div className="modal-actions">
              <button
                className="modal-btn"
                data-focusable="true"
                onClick={() => setShowLogoutModal(false)}
              >
                Cancelar
              </button>
              <button
                className="modal-btn modal-btn-danger"
                data-focusable="true"
                onClick={confirmLogout}
              >
                Sair
              </button>
            </div>
            <div className="modal-version-info">
              Versão do Sistema: v1.0.8
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
