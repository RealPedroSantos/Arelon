import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useStore, type MainReturnPoint, type Screen } from '../store'
import { focusFirst } from './useRemote'

const FOCUSABLE_SELECTOR = '[data-focusable="true"]:not([disabled]):not([aria-hidden="true"])'

type MainReturnPointOptions = {
  initialFocusSelector?: string
  initialFocusAttempts?: number
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
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

function setScrollLeft(el: HTMLElement, left: number) {
  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  const next = Math.max(0, Math.min(Math.round(left), max))
  try {
    el.scrollTo({ left: next, behavior: 'auto' })
  } catch {
    el.scrollLeft = next
  }
  el.scrollLeft = next
}

export function captureMainReturnPoint(screen: Screen, root: HTMLElement | null): MainReturnPoint | null {
  if (!root) return null

  const focusables = getFocusableElements(root)
  const active = document.activeElement as HTMLElement | null
  const target = active && root.contains(active) && active.matches(FOCUSABLE_SELECTOR) ? active : null
  const layout = root.closest<HTMLElement>('.app-layout')
  const innerScroll = target?.closest<HTMLElement>('.live-channel-scroll')
  const row = target?.closest<HTMLElement>('.media-row')
  const focusIndex = target ? focusables.indexOf(target) : -1

  return {
    screen,
    focusKey: target?.dataset.returnFocusKey,
    mediaId: target?.dataset.mediaId,
    focusIndex: focusIndex >= 0 ? focusIndex : undefined,
    layoutScrollTop: layout?.scrollTop,
    innerScrollTop: innerScroll?.scrollTop,
    rowScrollLeft: row?.scrollLeft,
    createdAt: Date.now(),
  }
}

function findReturnTarget(point: MainReturnPoint, root: HTMLElement): HTMLElement | null {
  const focusables = getFocusableElements(root)

  if (point.focusKey) {
    const byKey = focusables.find((el) => el.dataset.returnFocusKey === point.focusKey)
    if (byKey) return byKey
  }

  if (point.mediaId) {
    const byMediaId = focusables.find((el) => el.dataset.mediaId === point.mediaId)
    if (byMediaId) return byMediaId
  }

  if (typeof point.focusIndex === 'number') {
    return focusables[point.focusIndex] ?? null
  }

  return null
}

function restoreMainReturnPoint(point: MainReturnPoint, root: HTMLElement | null): boolean {
  if (!root) return false

  const target = findReturnTarget(point, root)
  if (!target) return false

  const layout = root.closest<HTMLElement>('.app-layout')
  const innerScroll = target.closest<HTMLElement>('.live-channel-scroll')
  const row = target.closest<HTMLElement>('.media-row')

  if (layout && typeof point.layoutScrollTop === 'number') setScrollTop(layout, point.layoutScrollTop)
  if (innerScroll && typeof point.innerScrollTop === 'number') setScrollTop(innerScroll, point.innerScrollTop)
  if (row && typeof point.rowScrollLeft === 'number') setScrollLeft(row, point.rowScrollLeft)

  try {
    target.focus({ preventScroll: true })
  } catch {
    target.focus()
  }

  requestAnimationFrame(() => {
    if (layout && typeof point.layoutScrollTop === 'number') setScrollTop(layout, point.layoutScrollTop)
    if (innerScroll && typeof point.innerScrollTop === 'number') setScrollTop(innerScroll, point.innerScrollTop)
    if (row && typeof point.rowScrollLeft === 'number') setScrollLeft(row, point.rowScrollLeft)
  })

  return true
}

export function useMainReturnPoint(
  screen: Screen,
  pageRef: RefObject<HTMLElement | null>,
  delay = 150,
  options: MainReturnPointOptions = {},
) {
  const mainReturnPoint = useStore((s) => s.mainReturnPoint)
  const setMainReturnPoint = useStore((s) => s.setMainReturnPoint)
  const handledInitialFocusRef = useRef(false)
  const initialFocusSelector = options.initialFocusSelector
  const initialFocusAttempts = options.initialFocusAttempts ?? 20

  useEffect(() => {
    handledInitialFocusRef.current = false
  }, [screen])

  useEffect(() => {
    if (handledInitialFocusRef.current) return

    const point = mainReturnPoint?.screen === screen ? mainReturnPoint : null
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const finish = (clearPoint: boolean) => {
      handledInitialFocusRef.current = true
      if (clearPoint) setMainReturnPoint(null)
    }

    const run = () => {
      if (cancelled) return

      if (point) {
        if (restoreMainReturnPoint(point, pageRef.current)) {
          finish(true)
          return
        }

        if (attempts < 20) {
          attempts += 1
          timer = setTimeout(run, 100)
          return
        }
      }

      if (initialFocusSelector) {
        const preferredTarget = pageRef.current?.querySelector<HTMLElement>(initialFocusSelector)
        if (preferredTarget) {
          focusFirst(preferredTarget)
          finish(!!point)
          return
        }

        if (attempts < initialFocusAttempts) {
          attempts += 1
          timer = setTimeout(run, 100)
          return
        }
      }

      focusFirst(pageRef.current)
      finish(!!point)
    }

    timer = setTimeout(run, delay)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [delay, initialFocusAttempts, initialFocusSelector, mainReturnPoint, pageRef, screen, setMainReturnPoint])

  return useCallback(() => {
    setMainReturnPoint(captureMainReturnPoint(screen, pageRef.current))
  }, [pageRef, screen, setMainReturnPoint])
}
