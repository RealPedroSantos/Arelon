import { useEffect, useState } from 'react'
import { setNormalVolume, setClickVolume, normalVolume, clickVolume, unlockAudio, playUIMoveSound, playUIClickSound } from '../lib/tvSound'

interface VolumeControlWidgetProps {
  onClose?: () => void
}

export function VolumeControlWidget({ onClose }: VolumeControlWidgetProps) {
  const [normalVol, setNormalVol] = useState(normalVolume)
  const [clickVol, setClickVol] = useState(clickVolume)

  // Garante que o áudio está destravado quando abre o widget
  useEffect(() => {
    unlockAudio()
  }, [])

  const updateNormal = (newVal: number) => {
    const val = Math.max(0, Math.round(newVal * 10) / 10)
    setNormalVol(val)
    setNormalVolume(val)
    // Toca preview para ouvir o volume em tempo real
    setTimeout(() => playUIMoveSound(), 30)
  }

  const updateClick = (newVal: number) => {
    const val = Math.max(0, Math.round(newVal * 10) / 10)
    setClickVol(val)
    setClickVolume(val)
    // Toca preview para ouvir o volume em tempo real
    setTimeout(() => playUIClickSound(), 30)
  }

  const reset = () => {
    updateNormal(0.3)
    updateClick(4.1)
  }

  return (
    <div
      className="volume-widget"
      style={{
        background: 'rgba(20, 22, 30, 0.95)',
        border: '2px solid #ffffff',
        borderRadius: 16,
        padding: '24px 32px',
        color: 'white',
        minWidth: 520,
      }}
      data-focusable="true"
    >
      <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 20, textAlign: 'center' }}>
        CONTROLE DE VOLUME DO SOM
      </div>

      {/* Sons Normais */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, color: '#1de7ff', marginBottom: 6 }}>
          1. Sons Normais (movimento, teclas, limpar, sair...)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            className="volume-btn"
            data-focusable="true"
            onClick={() => updateNormal(normalVol - 0.1)}
            style={{ fontSize: 32, padding: '8px 24px' }}
          >
            −
          </button>
          <div style={{ fontSize: 42, fontWeight: 900, minWidth: 120, textAlign: 'center' }}>
            {normalVol.toFixed(1)}
          </div>
          <button
            className="volume-btn"
            data-focusable="true"
            onClick={() => updateNormal(normalVol + 0.1)}
            style={{ fontSize: 32, padding: '8px 24px' }}
          >
            +
          </button>
        </div>
      </div>

      {/* Som de Clique / OK */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, color: '#1de7ff', marginBottom: 6 }}>
          2. Som de Clique / OK / Enter (seleção de elementos)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            className="volume-btn"
            data-focusable="true"
            onClick={() => updateClick(clickVol - 0.1)}
            style={{ fontSize: 32, padding: '8px 24px' }}
          >
            −
          </button>
          <div style={{ fontSize: 42, fontWeight: 900, minWidth: 120, textAlign: 'center' }}>
            {clickVol.toFixed(1)}
          </div>
          <button
            className="volume-btn"
            data-focusable="true"
            onClick={() => updateClick(clickVol + 0.1)}
            style={{ fontSize: 32, padding: '8px 24px' }}
          >
            +
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
        <button
          className="volume-btn"
          data-focusable="true"
          onClick={reset}
          style={{ padding: '10px 28px', fontSize: 20 }}
        >
          Resetar
        </button>
        {onClose && (
          <button
            className="volume-btn"
            data-focusable="true"
            onClick={onClose}
            style={{ padding: '10px 28px', fontSize: 20 }}
          >
            Fechar
          </button>
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 14, color: '#888', textAlign: 'center' }}>
        Use as setas + OK para ajustar. Os valores são aplicados em tempo real.
      </div>
    </div>
  )
}
