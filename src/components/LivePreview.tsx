import Hls from 'hls.js'
import { useEffect, useRef, useState } from 'react'
import { getLivePlaybackCandidates, isHlsStreamUrl, isTizenTVWebView, getSharedVideoElement } from '../lib/playback'

interface LivePreviewProps {
  /** URL do stream do canal (já com servidor embutido) */
  streamUrl: string
  channelName: string
  logo?: string
  /** Chamado ao "ativar" (2º clique / OK) — abre em tela cheia */
  onActivate: () => void
}

/**
 * Preview ao vivo (com áudio ao focar/clicar) exibido no hero da LiveScreen. É um botão focável:
 * apertar OK/clicar chama onActivate (tela cheia). Toca via HLS nativo na TV
 * (Tizen) ou hls.js no navegador. Destrói o stream ao desmontar/trocar de canal.
 * Utiliza o elemento de vídeo compartilhado globalmente para transição instantânea de canal.
 */
export function LivePreview({ streamUrl, channelName, onActivate }: LivePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !streamUrl) return

    const vid = getSharedVideoElement()
    vid.muted = false // Reproduz o áudio do canal no preview!
    vid.style.objectFit = 'cover'
    container.appendChild(vid)

    // Salva a URL principal e instância Hls no elemento compartilhado
    window.__SHARED_VIDEO_MAIN_URL__ = streamUrl

    const candidates = getLivePlaybackCandidates(streamUrl, isTizenTVWebView())
    let candidateIndex = -1

    function clearPipeline() {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      window.__SHARED_HLS_INSTANCE__ = null
      vid.pause()
      vid.removeAttribute('src')
      vid.load()
    }

    function tryNextCandidate() {
      const nextIndex = candidateIndex + 1
      const nextUrl = candidates[nextIndex]
      if (!nextUrl) return

      candidateIndex = nextIndex
      clearPipeline()

      const canNativeHls = vid.canPlayType('application/vnd.apple.mpegurl') !== ''
      const preferNative = isTizenTVWebView() || canNativeHls // Força HLS nativo no Tizen TV
      const isHls = isHlsStreamUrl(nextUrl)

      if (isHls && (preferNative || (!Hls.isSupported() && canNativeHls))) {
        vid.src = nextUrl
        vid.load()
        vid.play().catch(() => undefined)
      } else if (isHls && Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 10, maxMaxBufferLength: 20, enableWorker: false })
        hlsRef.current = hls
        window.__SHARED_HLS_INSTANCE__ = hls // Salva a referência global
        hls.loadSource(nextUrl)
        hls.attachMedia(vid)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void vid.play().catch(() => undefined)
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) tryNextCandidate()
        })
      } else {
        vid.src = nextUrl
        vid.load()
        vid.play().catch(() => undefined)
      }
    }

    const onError = () => {
      if (vid.error && vid.error.code === vid.error.MEDIA_ERR_ABORTED) return
      tryNextCandidate()
    }

    vid.addEventListener('error', onError)
    tryNextCandidate()

    return () => {
      // Se estivermos transicionando para tela cheia deste mesmo canal, NÃO destrói o pipeline nem pausa o vídeo!
      const isTransitioning = window.__SHARED_VIDEO_MAIN_URL__ === window.__TRANSITIONING_TO_FULLSCREEN_URL__
      
      vid.removeEventListener('error', onError)
      
      if (!isTransitioning) {
        if (hlsRef.current) {
          hlsRef.current.destroy()
          hlsRef.current = null
        }
        window.__SHARED_HLS_INSTANCE__ = null
        window.__SHARED_VIDEO_MAIN_URL__ = null
        vid.pause()
        vid.removeAttribute('src')
        vid.load()
      } else {
        // Ao transicionar, removemos o elemento de vídeo deste container para que possa ser adotado pelo player
        if (container.contains(vid)) {
          container.removeChild(vid)
        }
      }
    }
  }, [streamUrl])

  return (
    <button
      className="live-preview-box"
      data-focusable="true"
      onClick={onActivate}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onMouseEnter={() => setFocused(true)}
      onMouseLeave={() => setFocused(false)}
      aria-label={`Assistir ${channelName} em tela cheia`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        padding: 0,
        /* border controlled by .live-preview-box in CSS for consistency */
        borderRadius: 24,
        overflow: 'hidden',
        background: '#000000 center/contain no-repeat url(/assets/arelon/Icone_SF_Arelon.png)',
        cursor: 'pointer',
        boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
        transform: focused ? 'scale(1.02)' : 'none',
        transition: 'transform 0.15s ease-out, box-shadow 0.15s ease-out',
        outline: 'none',
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </button>
  )
}
