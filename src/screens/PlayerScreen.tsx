import Hls from 'hls.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Channel } from '../store'
import { moveFocus, useRemote } from '../hooks/useRemote'
import { unlockAudio } from '../lib/tvSound'

import { getLivePlaybackCandidates, isHlsStreamUrl, isTizenTVWebView, getSharedVideoElement, setSharedVideoMainUrl, setTransitioningToFullscreenUrl, setSharedHlsInstance } from '../lib/playback'

function fmt(s: number, negative = false): string {
  if (!isFinite(s) || s < 0) return negative ? '-0:00' : '0:00'
  const hrs = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = Math.floor(s % 60).toString().padStart(2, '0')
  
  const prefix = negative ? '-' : ''
  if (hrs > 0) {
    return `${prefix}${hrs}:${mins.toString().padStart(2, '0')}:${secs}`
  }
  return `${prefix}${mins}:${secs}`
}

export function PlayerScreen() {
  const media = useStore((s) => s.currentMedia)!
  // Robusto: trata como AO VIVO se isLive OU type==='live' (type é sempre setado nos canais)
  const isLiveContent = media.isLive || media.type === 'live'
  const setCurrentMedia = useStore((s) => s.setCurrentMedia)
  const playerReturnDetail = useStore((s) => s.playerReturnDetail)
  const setPlayerReturnDetail = useStore((s) => s.setPlayerReturnDetail)
  const updateContinueWatching = useStore((s) => s.updateContinueWatching)
  const multiviewChannels = useStore((s) => s.multiviewChannels)
  const setMultiViewChannel = useStore((s) => s.setMultiViewChannel)
  const server = useStore((s) => s.server)
  const liveChannels = useStore((s) => s.liveChannels)
  const liveCategories = useStore((s) => s.liveCategories)

  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const btnQualityRef = useRef<HTMLButtonElement>(null)
  const btnChannelRef = useRef<HTMLButtonElement>(null)
  const lastProgressSaveRef = useRef(0)
  const seekedToStartPositionRef = useRef(false)

  const [showControls, setShowControls] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')
  const [buffering, setBuffering] = useState(true)
  const [infoMsg, setInfoMsg] = useState('')

  const [selectedQuality, setSelectedQuality] = useState('Auto')
  const [showQualityMenu, setShowQualityMenu] = useState(false)

  // Channel switcher for live TV (simple name list, 5 at a time in compact dropdown)
  const [showChannelList, setShowChannelList] = useState(false)

  const close = useCallback(() => {
    const vid = videoRef.current
    if (vid) {
      updateContinueWatching(media, vid.currentTime, vid.duration)
      vid.pause()
      vid.src = ''
      vid.load()
    }
    hlsRef.current?.destroy()
    hlsRef.current = null

    // Fecha o player
    setCurrentMedia(null)

    // Limpa o detalhe de retorno (não precisamos restaurar aqui,
    // pois o selectedDetailMedia já deve continuar setado da tela anterior)
    if (playerReturnDetail) {
      setPlayerReturnDetail(null)
    }
  }, [media, playerReturnDetail, setCurrentMedia, setPlayerReturnDetail, updateContinueWatching])

  const showCtrl = useCallback(() => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    
    // Foca automaticamente no botão adequado caso nenhum botão do player esteja focado
    setTimeout(() => {
      const activeEl = document.activeElement as HTMLElement
      const isPlayerButtonFocused = 
        activeEl?.className?.includes('apple-btn') || 
        activeEl?.className?.includes('player-btn-action') ||
        activeEl?.className?.includes('apple-quality-item') ||
        activeEl?.className?.includes('apple-channel-item') ||
        activeEl?.id === 'player-seekbar'
      if (!isPlayerButtonFocused) {
        if (isLiveContent) {
          document.getElementById('player-btn-mv')?.focus()
        } else {
          document.getElementById('player-btn-play')?.focus()
        }
      }
    }, 50)

    hideTimer.current = setTimeout(() => {
      setShowControls((prev) => {
        if (!prev) return false
        const active = document.activeElement as HTMLElement
        const isDropdownFocused = active?.className?.includes('apple-quality-item') || active?.className?.includes('apple-channel-item')
        const isSeekbarFocused = active?.id === 'player-seekbar'
        if (isDropdownFocused || isSeekbarFocused) return true
        return false
      })
      // Fecha listas quando os controles somem
      if (showChannelList) setShowChannelList(false)
      if (showQualityMenu) setShowQualityMenu(false)
    }, 3500)
  }, [isLiveContent])

  const addToMultiView = useCallback(() => {
    const firstEmptyIndex = multiviewChannels.findIndex((ch) => ch === null)
    const channelObj = {
      id: media.id,
      name: media.title,
      logo: media.poster || '',
      categoryId: '',
      streamUrl: media.url,
      streams: media.streams
    }
    const mvObj = {
      channel: channelObj,
      assignedServer: media.assignedServer || server?.activeServer || ''
    }

    if (firstEmptyIndex !== -1) {
      setMultiViewChannel(firstEmptyIndex, mvObj)
      setInfoMsg(`Canal adicionado ao Multi-View (Slot ${firstEmptyIndex + 1})`)
    } else {
      setMultiViewChannel(0, mvObj)
      setInfoMsg('Multi-View cheio. Canal adicionado ao Slot 1.')
    }
    setTimeout(() => setInfoMsg(''), 3000)
  }, [media, multiviewChannels, setMultiViewChannel, server])

  const togglePlay = useCallback(() => {
    const vid = videoRef.current
    if (!vid) return
    if (vid.paused) {
      vid.play().catch(() => undefined)
    } else {
      vid.pause()
    }
  }, [])

  const rewind = useCallback((amount = 10) => {
    const vid = videoRef.current
    if (vid) {
      vid.currentTime = Math.max(vid.currentTime - amount, 0)
    }
  }, [])

  const forward = useCallback((amount = 10) => {
    const vid = videoRef.current
    if (vid) {
      vid.currentTime = Math.min(vid.currentTime + amount, vid.duration || Infinity)
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const vid = getSharedVideoElement()
    vid.style.objectFit = 'fill'
    container.appendChild(vid)
    videoRef.current = vid

    setError('')
    setBuffering(true)
    lastProgressSaveRef.current = 0
    seekedToStartPositionRef.current = false

    // Watchdog por candidato: na TV Samsung alguns provedores anunciam HLS, mas
    // o player nativo só abre o transporte TS direto. Tenta o próximo formato
    // antes de mostrar erro ao usuário.
    const tizenPlayback = isTizenTVWebView()
    let playbackCandidates: string[] = []
    let currentCandidateIndex = -1
    let watchdog: ReturnType<typeof setTimeout> | null = null
    
    const isAlreadyPlaying = window.__SHARED_VIDEO_MAIN_URL__ === media.url
    setTransitioningToFullscreenUrl(null) // Limpa o estado de transição ao abrir
    let resolved = isAlreadyPlaying // Se já estiver rodando, já está resolvido!

    if (isAlreadyPlaying && window.__SHARED_HLS_INSTANCE__) {
      hlsRef.current = window.__SHARED_HLS_INSTANCE__
    }

    const clearWatchdog = () => {
      if (watchdog) clearTimeout(watchdog)
      watchdog = null
    }
    const markResolved = () => {
      resolved = true
      clearWatchdog()
    }
    const showFinalPlaybackError = (message: string) => {
      markResolved()
      setBuffering(false)
      setError(message)
    }

    function saveProgress(force = false) {
      if (isLiveContent) return

      const now = Date.now()
      if (!force && now - lastProgressSaveRef.current < 5000) return

      lastProgressSaveRef.current = now
      updateContinueWatching(media, vid.currentTime, vid.duration)
    }

    // Usando vid em vez do seletor direto
    function seekToStartPosition() {
      const startPosition = media.startPosition ?? 0
      if (seekedToStartPositionRef.current || isLiveContent || startPosition <= 0) return
      if (!Number.isFinite(vid.duration) || vid.duration <= 0) return

      vid.currentTime = Math.min(startPosition, Math.max(vid.duration - 5, 0))
      setCurrentTime(vid.currentTime)
      seekedToStartPositionRef.current = true
    }

    function tryNextCandidate(): boolean {
      const nextIndex = currentCandidateIndex + 1
      if (nextIndex >= playbackCandidates.length) return false

      startCandidate(nextIndex)
      return true
    }

    function armWatchdog() {
      clearWatchdog()
      watchdog = setTimeout(() => {
        if (resolved) return
        if (!tryNextCandidate()) {
          showFinalPlaybackError('Não foi possível iniciar a reprodução. O servidor pode estar indisponível ou o formato não é suportado neste dispositivo.')
        }
      }, 25000) // Aumentado para 25s em todos os dispositivos para dar tempo de carregar streams de IPTV lentos
    }

    function clearCurrentPipeline() {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      setSharedHlsInstance(null)

      vid.pause()
      vid.removeAttribute('src')
      vid.load()
    }

    function attachStream(streamUrl: string) {
      clearCurrentPipeline()

      const canNativeHls = vid.canPlayType('application/vnd.apple.mpegurl') !== ''
      const preferNativeHls = isTizenTVWebView() || canNativeHls // Força HLS nativo no Tizen TV (Hls.js é incompatível/lento no Tizen)
      const isHls = isHlsStreamUrl(streamUrl)

      if (isHls && (preferNativeHls || (!Hls.isSupported() && canNativeHls))) {
        vid.src = streamUrl
        vid.load()
        vid.play().catch(() => undefined)
      } else if (isHls && Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          enableWorker: false,
        })
        hlsRef.current = hls
        setSharedHlsInstance(hls)
        hls.loadSource(streamUrl)
        hls.attachMedia(vid)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          vid.play().catch(() => undefined)
        })
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            if (!tryNextCandidate()) {
              showFinalPlaybackError('Erro ao carregar stream. Verifique a conexão.')
            }
          }
        })
      } else {
        vid.src = streamUrl
        vid.load()
        vid.play().catch(() => undefined)
      }
    }

    function startCandidate(index: number) {
      const streamUrl = playbackCandidates[index]
      if (!streamUrl) return

      resolved = false
      currentCandidateIndex = index
      setError('')
      setBuffering(true)
      armWatchdog()
      attachStream(streamUrl)
    }

    let activeUrl = media.url

    // Carrega stream da qualidade selecionada
    if (selectedQuality !== 'Auto' && media.streams && media.streams[selectedQuality]) {
      activeUrl = media.streams[selectedQuality]!
    }

    if (!tizenPlayback && selectedQuality === 'Auto' && isLiveContent && media.streams && Object.keys(media.streams).length > 1) {
      // Gerar playlist M3U8 Master (ABR) com as diferentes qualidades
      let m3u8 = "#EXTM3U\n"
      for (const [qual, streamUrl] of Object.entries(media.streams)) {
        if (qual === '4K') m3u8 += "#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=3840x2160\n" + streamUrl + "\n"
        else if (qual === 'FHD') m3u8 += "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\n" + streamUrl + "\n"
        else if (qual === 'HD') m3u8 += "#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720\n" + streamUrl + "\n"
        else m3u8 += "#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480\n" + streamUrl + "\n"
      }
      const blob = new Blob([m3u8], { type: 'application/x-mpegURL' })
      const blobUrl = URL.createObjectURL(blob)
      blobUrlRef.current = blobUrl
      playbackCandidates = [blobUrl]
    } else if (isLiveContent) {
      playbackCandidates = getLivePlaybackCandidates(activeUrl, tizenPlayback)
    } else {
      playbackCandidates = [activeUrl]
    }

    const onPlaying = () => { markResolved(); setError(''); setBuffering(false); setIsPaused(false) }
    const onPause = () => { setIsPaused(true) }
    const onPlay = () => { setIsPaused(false) }
    const onWaiting = () => setBuffering(true)
    const onTime = () => {
      setCurrentTime(vid.currentTime)
      saveProgress()
    }
    const onDuration = () => {
      setDuration(vid.duration)
      seekToStartPosition()
    }
    const onLoadedMetadata = () => {
      setDuration(vid.duration)
      seekToStartPosition()
    }
    const onError = () => {
      // Erro de mídia no caminho nativo (no caminho hls.js o erro fatal vem por
      // Hls.Events.ERROR). Ignora abortos de carga, ex.: ao limpar a fonte no fechamento.
      if (vid.error && vid.error.code === vid.error.MEDIA_ERR_ABORTED) return
      if (!tryNextCandidate()) {
        showFinalPlaybackError('Erro ao reproduzir o vídeo. O servidor pode estar fora do ar ou o formato não é suportado neste dispositivo.')
      }
    }

    vid.addEventListener('playing', onPlaying)
    vid.addEventListener('pause', onPause)
    vid.addEventListener('play', onPlay)
    vid.addEventListener('waiting', onWaiting)
    vid.addEventListener('timeupdate', onTime)
    vid.addEventListener('durationchange', onDuration)
    vid.addEventListener('loadedmetadata', onLoadedMetadata)
    vid.addEventListener('error', onError)

    if (isAlreadyPlaying) {
      setBuffering(false)
      setError('')
      setIsPaused(vid.paused)
      setDuration(vid.duration)
      setCurrentTime(vid.currentTime)
    } else {
      setSharedVideoMainUrl(media.url)
      startCandidate(0)
    }
    showCtrl()

    return () => {
      saveProgress(true)
      clearWatchdog()
      if (hideTimer.current) clearTimeout(hideTimer.current)
      
      // Limpa as variáveis globais ao sair do player
      setSharedVideoMainUrl(null)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      setSharedHlsInstance(null)

      vid.pause()
      vid.removeAttribute('src')
      vid.load()

      if (container.contains(vid)) {
        container.removeChild(vid)
      }
      videoRef.current = null

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      vid.removeEventListener('playing', onPlaying)
      vid.removeEventListener('pause', onPause)
      vid.removeEventListener('play', onPlay)
      vid.removeEventListener('waiting', onWaiting)
      vid.removeEventListener('timeupdate', onTime)
      vid.removeEventListener('durationchange', onDuration)
      vid.removeEventListener('loadedmetadata', onLoadedMetadata)
      vid.removeEventListener('error', onError)
    }
  }, [isLiveContent, media, selectedQuality, showCtrl, updateContinueWatching])

  // Autofoco e gerenciamento do dropdown de qualidade
  useEffect(() => {
    if (showQualityMenu) {
      setTimeout(() => {
        const dropdown = document.getElementById('player-quality-dropdown')
        const activeItem = dropdown?.querySelector('.apple-quality-item--active') as HTMLElement
        const firstItem = dropdown?.querySelector('.apple-quality-item') as HTMLElement
        if (activeItem) {
          activeItem.focus()
        } else if (firstItem) {
          firstItem.focus()
        }
      }, 50)
    }
  }, [showQualityMenu])

  function selectQuality(qual: string) {
    setSelectedQuality(qual)
    setShowQualityMenu(false)
    setTimeout(() => {
      btnQualityRef.current?.focus()
    }, 50)
  }

  // Autofocus for channel list (similar to quality menu)
  useEffect(() => {
    if (showChannelList) {
      setTimeout(() => {
        const list = document.getElementById('player-channel-list')
        const firstItem = list?.querySelector('.apple-channel-item') as HTMLElement
        if (firstItem) firstItem.focus()
      }, 60)
    }
  }, [showChannelList])

  function switchToChannel(ch: Channel) {
    setShowChannelList(false)
    setSharedVideoMainUrl(null) // força recarregamento
    setCurrentMedia({
      id: ch.id,
      title: ch.name,
      url: ch.streamUrl,
      type: 'live',
      poster: ch.logo,
      isLive: true,
      assignedServer: server?.activeServer || '',
      streams: ch.streams,
    })
    // Return focus to the channel button after switching
    setTimeout(() => {
      btnChannelRef.current?.focus()
    }, 80)
  }

  useRemote((cmd, type) => {
    if (type !== 'keydown' && type !== 'tizenhwkey') return
    const vid = videoRef.current
    if (!vid) return

    if (cmd === 'BACK') {
      if (showChannelList) {
        setShowChannelList(false)
        setTimeout(() => btnChannelRef.current?.focus(), 30)
        showCtrl()
        return
      }
      if (showQualityMenu) {
        setShowQualityMenu(false)
        setTimeout(() => {
          btnQualityRef.current?.focus()
        }, 50)
      } else if (showControls) {
        setShowControls(false)
      } else {
        unlockAudio()
        close()
      }
      return
    }

    if (showChannelList) {
      if (cmd === 'UP' || cmd === 'DOWN' || cmd === 'LEFT' || cmd === 'RIGHT') {
        moveFocus(cmd)
        return
      }
      if (cmd === 'ENTER') {
        (document.activeElement as HTMLElement)?.click()
        return
      }
      return
    }

    if (!showControls) {
      if (cmd === 'ENTER' || cmd === 'MEDIA_PLAY_PAUSE') {
        // Ao vivo não pausa — OK apenas revela os controles. VOD: pausa/retoma.
        if (!isLiveContent) togglePlay()
        showCtrl()
      } else if (cmd === 'LEFT' || cmd === 'MEDIA_REWIND') {
        if (!isLiveContent) {
          rewind()
          showCtrl()
          setTimeout(() => document.getElementById('player-seekbar')?.focus(), 100)
        }
      } else if (cmd === 'RIGHT' || cmd === 'MEDIA_FAST_FORWARD') {
        if (!isLiveContent) {
          forward()
          showCtrl()
          setTimeout(() => document.getElementById('player-seekbar')?.focus(), 100)
        }
      } else if (cmd === 'DOWN') {
        if (isLiveContent) {
          // Para live: abre a lista compacta de canais (ao lado do botão de qualidade)
          setShowChannelList(true)
          setShowControls(true)
          return
        }
        // Ao apertar para baixo, revela os controles e foca diretamente na barra de progresso (a "bola")
        showCtrl()
        setTimeout(() => {
          document.getElementById('player-seekbar')?.focus()
        }, 60)
      } else {
        showCtrl()
      }
      return
    }

    // Se os controles estiverem visíveis...
    showCtrl() // Reseta o timer de ocultação

    // Navegação na seekbar focada — usa saltos maiores para avançar/retroceder mais rápido
    const isSeekbarFocused = document.activeElement?.id === 'player-seekbar'
    if (isSeekbarFocused) {
      if (cmd === 'LEFT') {
        rewind(30) // salto maior quando na barra de progresso
        return
      }
      if (cmd === 'RIGHT') {
        forward(30) // salto maior quando na barra de progresso
        return
      }
      if (cmd === 'ENTER') {
        togglePlay()
        return
      }
    }

    if (cmd === 'DOWN') {
      if (isLiveContent) {
        setShowChannelList(true)
        setShowControls(true)
        return
      } else {
        // Quando controles estão visíveis, DOWN foca a barra de progresso
        const seekbar = document.getElementById('player-seekbar')
        if (seekbar && document.activeElement !== seekbar) {
          seekbar.focus()
          return
        }
      }
    }

    if (cmd === 'UP' || cmd === 'DOWN' || cmd === 'LEFT' || cmd === 'RIGHT') {
      moveFocus(cmd)
    } else if (cmd === 'ENTER') {
      const activeEl = document.activeElement as HTMLElement
      activeEl?.click()
    }

    // Atalhos do controle remoto físico/teclado de mídia nativo
    if (cmd === 'MEDIA_PLAY_PAUSE' && !isLiveContent) togglePlay()
    if (cmd === 'MEDIA_FAST_FORWARD' && !isLiveContent) forward()
    if (cmd === 'MEDIA_REWIND' && !isLiveContent) rewind()
    if (cmd === 'MEDIA_STOP') close()
  })

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const isSeries = media.type === 'episode'
  const playerMeta = isLiveContent ? 'AO VIVO' : isSeries ? 'Série' : 'Filme'
  const canSkipIntro = isSeries && currentTime < 150
  const canNextEpisode = isSeries && duration > 0 && currentTime > duration - 120

  function skipIntro() {
    if (videoRef.current) videoRef.current.currentTime += 85
  }

  function nextEpisode() {
    setInfoMsg('Próximo episódio disponível em breve.')
    setTimeout(() => setInfoMsg(''), 3000)
  }

  function continueWatching() {
    if (videoRef.current?.paused) togglePlay()
    showCtrl()
  }

  function showFeatureMessage(label: string) {
    setInfoMsg(`${label} indisponível neste conteúdo.`)
    setTimeout(() => setInfoMsg(''), 3000)
  }

  const currentChannel = liveChannels.find((ch) => ch.id === media.id)
  const categoryId = currentChannel?.categoryId
  // Canais da mesma categoria do canal atual (para o seletor compacto)
  const categoryChannels = isLiveContent
    ? categoryId
      ? liveChannels.filter((ch) => ch.categoryId === categoryId)
      : liveChannels
    : []
  const currentCategoryName = liveCategories.find((cat) => cat.id === categoryId)?.name || 'Canais'

  return (
    <div className="player" onClick={showCtrl}>
      <div
        ref={containerRef}
        className="player-video"
      />

      {infoMsg ? (
        <div style={{ position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.85)', color: '#ffffff', padding: '12px 24px', borderRadius: '12px', fontSize: '18px', zIndex: 10, pointerEvents: 'none', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(20px)' }}>
          {infoMsg}
        </div>
      ) : null}

      {buffering && !error ? (
        <div className="player-spinner">
          <div className="spinner" />
          <div className="player-loading-copy">Carregando...</div>
        </div>
      ) : null}

      {error ? (
        <div className="player-error">
          <p>{error}</p>
          <button className="btn-primary" onClick={close}>Voltar</button>
        </div>
      ) : null}

      <div className={`apple-player-controls ${showControls ? 'apple-player-controls--visible' : ''}`}>
        {showQualityMenu && media.streams && (
          <div className="apple-quality-dropdown" id="player-quality-dropdown">
            <div className="apple-quality-title">RESOLUÇÃO</div>
            <button
              className={`apple-quality-item ${selectedQuality === 'Auto' ? 'apple-quality-item--active' : ''}`}
              data-focusable={showControls ? "true" : "false"}
              onClick={() => selectQuality('Auto')}
            >
              <span>Automático (ABR)</span>
              {selectedQuality === 'Auto' && <span style={{ color: '#1de7ff' }}>✓</span>}
            </button>
            {Object.keys(media.streams).map((qual) => (
              <button
                key={qual}
                className={`apple-quality-item ${selectedQuality === qual ? 'apple-quality-item--active' : ''}`}
                data-focusable={showControls ? "true" : "false"}
                onClick={() => selectQuality(qual)}
              >
                <span>{qual}</span>
                {selectedQuality === qual && <span style={{ color: '#1de7ff' }}>✓</span>}
              </button>
            ))}
          </div>
        )}

        {/* Lista compacta de canais (5 por vez no visual, nomes simples) */}
        {showChannelList && isLiveContent && categoryChannels.length > 0 && (
          <div className="apple-quality-dropdown player-channel-dropdown" id="player-channel-list">
            <div className="apple-quality-title">CANAL ({currentCategoryName}) — {categoryChannels.length} disponíveis</div>
            {categoryChannels.map((ch) => {
              const isActive = ch.id === media.id
              return (
                <button
                  key={ch.id}
                  className={`apple-quality-item apple-channel-item ${isActive ? 'apple-quality-item--active' : ''}`}
                  data-focusable={showControls ? "true" : "false"}
                  onClick={() => switchToChannel(ch)}
                >
                  <span>{ch.name}</span>
                  {isActive && <span style={{ color: '#1de7ff' }}>●</span>}
                </button>
              )
            })}
          </div>
        )}

        <div className="apple-panel">
          <div className="apple-control-top">
            <div className="apple-control-copy">
              <span className="apple-control-kicker">{playerMeta}</span>
              <span className="player-title">{media.title}</span>
            </div>

            <div className="apple-buttons-row">
              {!isLiveContent && (
                <button
                  className="apple-btn"
                  title="Legendas"
                  data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                  onClick={() => showFeatureMessage('Legendas')}
                >
                  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 10h3"/><path d="M13 10h3"/><path d="M8 14h6"/></svg>
                </button>
              )}

              {!isLiveContent && (
                <button
                  className="apple-btn"
                  title="Áudio"
                  data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                  onClick={() => showFeatureMessage('Áudio')}
                >
                  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v.01"/><path d="M8 7v10"/><path d="M12 4v16"/><path d="M16 8v8"/><path d="M20 10v4"/></svg>
                </button>
              )}

              {media.streams && Object.keys(media.streams).length > 0 ? (
                <button
                  id="player-btn-quality"
                  ref={btnQualityRef}
                  className="apple-btn"
                  title={`Qualidade: ${selectedQuality}`}
                  data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                  onClick={() => {
                    if (showChannelList) setShowChannelList(false)
                    setShowQualityMenu(!showQualityMenu)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="6" width="9" height="7" rx="1"/><rect x="11" y="11" width="9" height="7" rx="1"/><path d="M8 15h3"/></svg>
                </button>
              ) : null}

              {/* Botão de troca de canal (só para Live) — abre lista compacta com nomes */}
              {isLiveContent && (
                <button
                  id="player-btn-channels"
                  ref={btnChannelRef}
                  className="apple-btn"
                  title="Trocar de Canal"
                  data-focusable={showControls && !showQualityMenu && !showChannelList ? "true" : "false"}
                  onClick={() => {
                    if (showQualityMenu) setShowQualityMenu(false)
                    setShowChannelList(!showChannelList)
                  }}
                >
                  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="2"/>
                    <line x1="7" y1="8" x2="17" y2="8"/>
                    <line x1="7" y1="12" x2="17" y2="12"/>
                    <line x1="7" y1="16" x2="13" y2="16"/>
                  </svg>
                </button>
              )}

              <button
                id="player-btn-back"
                className="apple-btn"
                title="Voltar"
                data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                onClick={close}
              >
                <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </div>

          {!isLiveContent && duration > 0 && (
            <>
              <div
                id="player-seekbar"
                className="apple-seek-container"
                data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                tabIndex={showControls && !showQualityMenu ? 0 : -1}
              >
                <div className="apple-bar">
                  <div className="apple-bar-fill" style={{ width: `${progress}%` }}>
                    <div className="apple-bar-handle" />
                  </div>
                </div>
              </div>

              <div className="apple-time-row">
                <div className="apple-time-current">
                  <span className="apple-time">{fmt(currentTime)}</span>
                  <button
                    id="player-btn-play"
                    className="apple-inline-play player-btn-action"
                    title={isPaused ? "Play" : "Pause"}
                    data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                    onClick={togglePlay}
                  >
                    {isPaused ? (
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    )}
                  </button>
                </div>
                <span className="apple-time">{fmt(duration - currentTime, true)}</span>
              </div>
            </>
          )}

          <div className="apple-pill-row">
            {isLiveContent ? (
              <button
                id="player-btn-mv"
                className="apple-control-pill player-btn-action"
                data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                onClick={addToMultiView}
              >
                Adicionar ao Multi-View
              </button>
            ) : (
              <>
                <button
                  className="apple-control-pill player-btn-action"
                  data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                  onClick={() => showFeatureMessage('Informações')}
                >
                  Informações
                </button>

                {canSkipIntro ? (
                  <button
                    id="player-btn-skip"
                    className="apple-control-pill player-btn-action"
                    data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                    onClick={skipIntro}
                  >
                    Pular Intro
                  </button>
                ) : (
                  <button
                    className="apple-control-pill player-btn-action"
                    data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                    onClick={() => showFeatureMessage('Em Foco')}
                  >
                    Em Foco
                  </button>
                )}

                {canNextEpisode ? (
                  <button
                    id="player-btn-next"
                    className="apple-control-pill player-btn-action"
                    data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                    onClick={nextEpisode}
                  >
                    Próximo Episódio
                  </button>
                ) : (
                  <button
                    className="apple-control-pill player-btn-action"
                    data-focusable={showControls && !showQualityMenu ? "true" : "false"}
                    onClick={continueWatching}
                  >
                    Continue Assistindo
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>


    </div>
  )
}
