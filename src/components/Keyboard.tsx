import { useCallback, useEffect, useRef, useState } from 'react'
import { useRemote } from '../hooks/useRemote'
import { ensureAudioUnlocked, unlockAudio } from '../lib/tvSound'

type Mode = 'ABC' | 'abc' | '#+-'

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')
const NUMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', '_', '-', '@']
const SYMBOLS = ['!', '?', '#', '$', '%', '&', '*', '(', ')', '+', '=', '<', '>', '/', '|', '\\', '^', "'", '`', '"', ';', ':', ',', '~']

// Ghosts para centralizar a linha de números dentro dos 26 slots de letras
const LETTER_COUNT = LETTERS.length // 26
const NUM_GHOSTS_TOTAL = LETTER_COUNT - NUMS.length // 12
const NUM_GHOSTS_SIDE = Math.floor(NUM_GHOSTS_TOTAL / 2) // 6 de cada lado

interface KeyboardProps {
  label: string
  value: string
  masked?: boolean
  doneLabel?: string
  onChange: (v: string) => void
  onDone: () => void
  allowWhenModal?: boolean
}

function navInRow(container: HTMLElement, dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): void {
  const keys = Array.from(container.querySelectorAll<HTMLElement>('[data-key]')).filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })

  const cur = document.activeElement as HTMLElement | null
  const idx = cur ? keys.indexOf(cur) : -1
  if (idx === -1 || keys.length === 0) {
    keys[0]?.focus()
    unlockAudio()
    return
  }

  const cr = cur!.getBoundingClientRect()
  const cx = cr.left + cr.width / 2
  const cy = cr.top + cr.height / 2

  // Para LEFT/RIGHT, primeiro tenta achar a próxima tecla na mesma linha.
  // Se não encontrar (fim da linha), faz wrap para o outro lado.
  if (dir === 'LEFT' || dir === 'RIGHT') {
    // Coleta todas as teclas na mesma linha (sobreposição vertical)
    const sameRow = keys.filter((el) => {
      if (el === cur) return true
      const r = el.getBoundingClientRect()
      return r.bottom > cr.top && r.top < cr.bottom
    })

    if (sameRow.length > 1) {
      // Ordena da esquerda para a direita
      sameRow.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      const rowIdx = sameRow.indexOf(cur!)

      let next: HTMLElement | null
      if (dir === 'RIGHT') {
        // Se não é o último, vai para o próximo; senão, wrap para o primeiro
        next = (rowIdx < sameRow.length - 1 ? sameRow[rowIdx + 1] : sameRow[0]) ?? null
      } else {
        // Se não é o primeiro, vai para o anterior; senão, wrap para o último
        next = (rowIdx > 0 ? sameRow[rowIdx - 1] : sameRow[sameRow.length - 1]) ?? null
      }

      if (next && next !== cur) {
        next.focus()
        unlockAudio()
        return
      }
    }
  }

  // Para UP/DOWN (ou fallback): busca a tecla mais próxima na direção desejada
  let best: HTMLElement | null = null
  let bestScore = Infinity

  for (const el of keys) {
    if (el === cur) continue
    const r = el.getBoundingClientRect()
    const ex = r.left + r.width / 2
    const ey = r.top + r.height / 2
    const dx = ex - cx
    const dy = ey - cy

    const inDir = dir === 'UP' ? dy < -4 : dir === 'DOWN' ? dy > 4 : dir === 'LEFT' ? dx < -4 : dx > 4
    if (!inDir) continue

    const primary = Math.abs(dir === 'UP' || dir === 'DOWN' ? dy : dx)
    const secondary = Math.abs(dir === 'UP' || dir === 'DOWN' ? dx : dy)
    const score = primary + secondary * 0.3
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }

  if (best) {
    best.focus()
    unlockAudio()
  }
}

export function Keyboard({ value, onChange, onDone, doneLabel = 'Pronto', allowWhenModal = false }: KeyboardProps) {
  const [mode, setMode] = useState<Mode>('abc')
  const ref = useRef<HTMLDivElement>(null)

  const letters = mode === 'ABC' ? LETTERS.map((l) => l.toUpperCase()) : LETTERS
  const mainRow = mode === '#+-' ? SYMBOLS : letters

  const press = useCallback(
    (key: string) => {
      unlockAudio()

      if (key === '⌫') {
        onChange(value.slice(0, -1));
        return;
      }

      if (key.startsWith('__mode_')) {
        setMode(key.slice(7) as Mode);
        return;
      }

      if (key === '✓') {
        onDone();
        return;
      }

      if (key === '⎵') {
        onChange(value + ' ');
        return;
      }

      onChange(value + key);
    },
    [value, onChange, onDone],
  )

  useEffect(() => {
    // Start unlocking audio as soon as the keyboard appears
    unlockAudio()
    // Also preload the keyboard-specific sound
    // (the load happens automatically on module import)

    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-key]')?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  useRemote((cmd, type) => {
    if (type !== 'keydown' && type !== 'tizenhwkey') return
    if (!ref.current?.contains(document.activeElement)) return

    // Prime audio on every key inside the keyboard (very important for Tizen consistency)
    ensureAudioUnlocked()

    if (cmd === 'ENTER') {
      const key = (document.activeElement as HTMLElement)?.dataset.key
      if (key) {
        unlockAudio()
        press(key)
      }
      return
    }
    if (cmd === 'UP' || cmd === 'DOWN' || cmd === 'LEFT' || cmd === 'RIGHT') {
      const keyboard = ref.current
      if (keyboard) navInRow(keyboard, cmd)
    }
  }, true, { allowWhenModal })

  return (
    <div className="kb-wrap" ref={ref}>
      <div className="kb-rows">
        {/* Linha principal: SPACE + letras/símbolos + ⌫ */}
        <div className="kb-row">
          <button className="kb-key kb-key--space" data-key="⎵" onClick={() => press('⎵')}>
            SPACE
          </button>
          {mainRow.map((k) => (
            <button key={k} className={`kb-key${k.length > 1 ? ' kb-key--wide' : ''}`} data-key={k} onClick={() => press(k)}>
              {k}
            </button>
          ))}
          <button className="kb-key kb-key--backspace" data-key="⌫" onClick={() => press('⌫')}>
            ⌫
          </button>
        </div>

        {/* Linha de números — ghosts invisíveis garantem o mesmo espaçamento */}
        {mode !== '#+-' && (
          <div className="kb-row">
            {/* ghost do SPACE */}
            <div className="kb-key kb-key--space kb-ghost" aria-hidden="true" />
            {/* ghosts à esquerda para centrar */}
            {Array.from({ length: NUM_GHOSTS_SIDE }, (_, i) => (
              <div key={`l${i}`} className="kb-key kb-ghost" aria-hidden="true" />
            ))}
            {NUMS.map((k) => (
              <button key={k} className="kb-key" data-key={k} onClick={() => press(k)}>
                {k}
              </button>
            ))}
            {/* ghosts à direita para centrar */}
            {Array.from({ length: NUM_GHOSTS_SIDE }, (_, i) => (
              <div key={`r${i}`} className="kb-key kb-ghost" aria-hidden="true" />
            ))}
            {/* ghost do ⌫ */}
            <div className="kb-key kb-key--backspace kb-ghost" aria-hidden="true" />
          </div>
        )}

        {/* Tabs de modo + ação final */}
        <div className="kb-tabs">
          {(['ABC', 'abc', '#+-'] as Mode[]).map((m) => (
            <button key={m} className={`kb-tab${mode === m ? ' kb-tab--active' : ''}`} data-key={`__mode_${m}`} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
          <button className="kb-tab kb-tab--done" data-key="✓" onClick={() => press('✓')}>
            {doneLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
