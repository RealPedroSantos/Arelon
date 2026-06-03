import { useEffect, useRef } from 'react'
import { unlockAudio } from '../lib/tvSound'

export type RemoteCommand =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'ENTER'
  | 'BACK'
  | 'MENU'
  | 'CHANNEL_UP'
  | 'CHANNEL_DOWN'
  | 'MEDIA_PLAY'
  | 'MEDIA_PAUSE'
  | 'MEDIA_PLAY_PAUSE'
  | 'MEDIA_FAST_FORWARD'
  | 'MEDIA_REWIND'
  | 'MEDIA_STOP'

type UseRemoteOptions = {
  allowWhenModal?: boolean
}

export function useRemote(handler: (cmd: RemoteCommand, type: string) => void, active = true, options: UseRemoteOptions = {}) {
  const handlerRef = useRef(handler)
  const allowWhenModal = options.allowWhenModal ?? false

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!active) return
    const listener = (e: Event) => {
      unlockAudio() // More aggressive unlock on every remote key for Tizen
      if (!allowWhenModal && document.querySelector('.modal-overlay')) return
      const d = (e as CustomEvent<{ command: string; type: string }>).detail
      if (d?.command) handlerRef.current(d.command as RemoteCommand, d.type ?? 'keydown')
    }
    window.addEventListener('tv-remote-command', listener)
    return () => window.removeEventListener('tv-remote-command', listener)
  }, [active, allowWhenModal])
}

// Seleciona apenas elementos explicitamente marcados como focusable=true
const FOCUSABLE = '[data-focusable="true"]:not([disabled]):not([aria-hidden="true"])'

export function moveFocus(dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): boolean {
  const cur = document.activeElement as HTMLElement | null
  // Se um modal está aberto, trava o foco dentro dele — senão a navegação "escapa"
  // para elementos atrás do overlay (invisíveis e quebrando a interação / "travando").
  const modal = document.querySelector<HTMLElement>('.modal-overlay')
  const scope = modal ?? cur?.closest<HTMLElement>('.app-shell-sidebar') ?? document
  const all = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })

  if (all.length === 0) return false

  if (!cur || !all.includes(cur)) {
    const first = all[0]
    if (first) focusElement(first)
    return true
  }

  if (dir === 'UP' || dir === 'DOWN') {
    const adjacentRowTarget = findAdjacentMediaRowTarget(cur, scope, dir)
    if (adjacentRowTarget) {
      focusElement(adjacentRowTarget)
      return true
    }
  }

  const cr = cur.getBoundingClientRect()
  const cx = cr.left + cr.width / 2
  const cy = cr.top + cr.height / 2

  let best: HTMLElement | null = null
  let bestScore = Infinity

  for (const el of all) {
    if (el === cur) continue
    const r = el.getBoundingClientRect()
    const ex = r.left + r.width / 2
    const ey = r.top + r.height / 2
    const dx = ex - cx
    const dy = ey - cy

    // LEFT/RIGHT: só aceita elementos cujas bordas verticais se sobreponham
    if (dir === 'LEFT' || dir === 'RIGHT') {
      if (r.bottom <= cr.top || r.top >= cr.bottom) continue
    }

    const inDir = dir === 'UP' ? dy < -5 : dir === 'DOWN' ? dy > 5 : dir === 'LEFT' ? dx < -5 : dx > 5

    if (!inDir) continue

    const primary = Math.abs(dir === 'UP' || dir === 'DOWN' ? dy : dx)
    const secondary = Math.abs(dir === 'UP' || dir === 'DOWN' ? dx : dy)
    const score = primary + secondary * 0.4

    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }

  if (best) {
    // Se o elemento destino for da barra de navegação superior, foca no item correspondente à página ativa!
    if ((best.classList.contains('arelon-topnav-item') || best.closest('.arelon-topbar')) && !cur?.closest('.arelon-topbar')) {
      const activeItem = document.querySelector<HTMLElement>('.arelon-topnav-item--active[data-focusable="true"]')
      if (activeItem) {
        best = activeItem
      }
    }
    // Scroll primeiro para trazer o elemento ao viewport, depois aplica foco.
    // Em NW.js/Chromium, .focus() em elemento fora do viewport falha silenciosamente;
    // scrollIntoView() com scroll-behavior:auto é síncrono e garante visibilidade.
    focusElement(best)
    return true
  }

  // Notifica borda de navegação (ex: AppShell abre sidebar ao chegar na esquerda)
  window.dispatchEvent(new CustomEvent('tv-navigation-edge', { detail: { direction: dir } }))
  return false
}

function findAdjacentMediaRowTarget(cur: HTMLElement, scope: Document | HTMLElement, dir: 'UP' | 'DOWN'): HTMLElement | null {
  const currentRow = cur.closest<HTMLElement>('.media-row')
  if (!currentRow) return null

  const rows = Array.from(scope.querySelectorAll<HTMLElement>('.media-row')).filter((row) => {
    const r = row.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && row.querySelector(FOCUSABLE)
  })
  const currentIndex = rows.indexOf(currentRow)
  if (currentIndex === -1) return null

  const step = dir === 'DOWN' ? 1 : -1
  const currentRect = cur.getBoundingClientRect()
  const currentCenterX = currentRect.left + currentRect.width / 2

  for (let index = currentIndex + step; index >= 0 && index < rows.length; index += step) {
    const row = rows[index]
    if (!row) continue

    const candidates = Array.from(row.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    if (candidates.length === 0) continue

    return candidates.reduce((best, el) => {
      const bestRect = best.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const bestCenterX = bestRect.left + bestRect.width / 2
      const elCenterX = elRect.left + elRect.width / 2
      return Math.abs(elCenterX - currentCenterX) < Math.abs(bestCenterX - currentCenterX) ? el : best
    })
  }

  return null
}

function focusElement(el: HTMLElement) {
  nudgeIntoView(el)
  el.focus()
  requestAnimationFrame(() => nudgeIntoView(el))
  unlockAudio()
}

function nudgeIntoView(el: HTMLElement) {
  try {
    const layout = el.closest<HTMLElement>('.app-layout')
    const verticalScrollScope = el.closest<HTMLElement>('.live-channel-scroll') ?? layout
    const row = el.closest<HTMLElement>('.media-row')

    // Elementos da barra superior, heróis e atalhos mantêm a tela alinhada ao topo.
    // Cards de mídia são centralizados manualmente; scrollIntoView é inconsistente
    // em alguns WebViews Tizen quando o container real é .app-layout.
    const isUpperElement =
      el.closest('.arelon-topbar') ||
      el.closest('.arelon-sport-shortcuts') ||
      el.classList.contains('hero-btn') ||
      el.classList.contains('arelon-primary-cta')

    if (isUpperElement && verticalScrollScope) {
      setScrollTop(verticalScrollScope, 0)
      if (layout && layout !== verticalScrollScope) {
        setScrollTop(layout, 0)
      }
      if (row) {
        nudgeInsideMediaRow(el, row)
      }
    } else if (row) {
      if (verticalScrollScope) {
        if (verticalScrollScope.classList.contains('live-channel-scroll')) {
          alignRowToTop(el, verticalScrollScope)
        } else {
          centerElementVertically(el, verticalScrollScope)
        }
      } else {
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
      }
      nudgeInsideMediaRow(el, row)
    } else if (verticalScrollScope) {
      if (verticalScrollScope.classList.contains('live-channel-scroll')) {
        alignRowToTop(el, verticalScrollScope)
      } else {
        centerElementVertically(el, verticalScrollScope)
      }
    } else {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
  } catch {
    el.scrollIntoView(false)
  }
}

function alignRowToTop(el: HTMLElement, container: HTMLElement) {
  const row = el.closest<HTMLElement>('.media-row-container') ?? el.closest<HTMLElement>('.media-row') ?? el
  const rowRect = row.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const offset = rowRect.top - containerRect.top
  setScrollTop(container, container.scrollTop + offset)
}

function centerElementVertically(el: HTMLElement, container: HTMLElement) {
  const elRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const elCenter = elRect.top + elRect.height / 2
  const containerCenter = containerRect.top + container.clientHeight / 2
  setScrollTop(container, container.scrollTop + elCenter - containerCenter)
}

function setScrollTop(el: HTMLElement, top: number) {
  const max = Math.max(0, el.scrollHeight - el.clientHeight)
  const next = Math.max(0, Math.min(Math.round(top), max))
  try {
    el.scrollTo({ top: next, behavior: 'auto' })
  } catch {
    el.scrollTop = next
  }
  el.scrollTop = next
}

function nudgeInsideMediaRow(el: HTMLElement, row: HTMLElement) {
  const elRect = el.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  const elCenter = elRect.left + elRect.width / 2
  const rowCenter = rowRect.left + rowRect.width / 2
  const delta = elCenter - rowCenter

  if (delta !== 0) {
    const max = Math.max(0, row.scrollWidth - row.clientWidth)
    const next = Math.max(0, Math.min(Math.round(row.scrollLeft + delta), max))
    try {
      row.scrollTo({ left: next, behavior: 'auto' })
    } catch {
      row.scrollLeft = next
    }
    row.scrollLeft = next
  }
}

export function activateFocusedElement(container?: HTMLElement | null): boolean {
  const active = document.activeElement as HTMLElement | null
  const root = container ?? document
  const target = active && root.contains(active) && active.matches(FOCUSABLE) ? active : root.querySelector<HTMLElement>(FOCUSABLE)

  if (!target) return false
  unlockAudio()
  target.click()
  return true
}

export function focusFirst(container?: HTMLElement | null) {
  const root = container ?? document
  const el = root.querySelector<HTMLElement>('[data-focusable="true"]:not([disabled])')
  if (el) {
    // Mesma ordem: scroll → foco, pela mesma razão do moveFocus acima.
    focusElement(el)

    // Garantir que ao iniciar a página (com focusFirst), o layout esteja perfeitamente alinhado ao topo
    const layout = el.closest<HTMLElement>('.app-layout')
    if (layout) {
      layout.scrollTo({ top: 0, behavior: 'auto' })
    }
  }
}
