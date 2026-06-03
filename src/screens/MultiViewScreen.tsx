import Hls from 'hls.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { MultiViewChannel, Channel } from '../store'
import { focusFirst, moveFocus, useRemote } from '../hooks/useRemote'
import { acquireServer, pickServer, rebuildUrl } from '../lib/pool'
import { getLivePlaybackCandidates, isHlsStreamUrl, isTizenTVWebView } from '../lib/playback'
import { Keyboard } from '../components/Keyboard'
import { getLiveChannelsPage } from '../api/xtream'

const MULTIVIEW_IGNORE_KEYWORDS = ['cliente', 'aviso', 'teste', 'suporte']
const MULTIVIEW_CHANNEL_LIMIT = 50

function mergeChannelLists(existing: Channel[], next: Channel[]): Channel[] {
  const byId = new Map(existing.map((channel) => [channel.id, channel]))
  for (const channel of next) byId.set(channel.id, channel)
  return Array.from(byId.values())
}

interface TileProps {
  mv: MultiViewChannel
  position: number
  isAudioActive: boolean
  onFocusAudio: () => void
  onExpand: () => void
  onRemove: () => void
  creds: { username: string; password: string }
  focusable?: boolean
}

function Tile({ mv, position, isAudioActive, onFocusAudio, onExpand, onRemove, creds, focusable = true }: TileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [error, setError] = useState(false)

  const url = useMemo(
    () => rebuildUrl(mv.channel.streamUrl, mv.assignedServer, creds.username, creds.password),
    [mv.channel.streamUrl, mv.assignedServer, creds.username, creds.password],
  )

  const isAudioActiveRef = useRef(isAudioActive)
  useEffect(() => {
    isAudioActiveRef.current = isAudioActive
  }, [isAudioActive])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const videoEl = video

    const release = acquireServer(mv.assignedServer)

    // Apply strict initial audio state
    videoEl.muted = !isAudioActiveRef.current
    videoEl.volume = isAudioActiveRef.current ? 1 : 0

    const candidates = getLivePlaybackCandidates(url, isTizenTVWebView())
    let candidateIndex = -1

    function clearPipeline() {
      hlsRef.current?.destroy()
      hlsRef.current = null
      videoEl.pause()
      videoEl.removeAttribute('src')
      videoEl.load()
    }

    function tryNextCandidate() {
      const nextIndex = candidateIndex + 1
      const nextUrl = candidates[nextIndex]
      if (!nextUrl) {
        setError(true)
        return
      }

      candidateIndex = nextIndex
      setError(false)
      clearPipeline()
      videoEl.muted = !isAudioActiveRef.current
      videoEl.volume = isAudioActiveRef.current ? 1 : 0

      const canNativeHls = videoEl.canPlayType('application/vnd.apple.mpegurl') !== ''
      const preferNativeHls = isTizenTVWebView() && canNativeHls
      const isHls = isHlsStreamUrl(nextUrl)

      if (isHls && Hls.isSupported() && !preferNativeHls) {
        const hls = new Hls({ maxBufferLength: 20, enableWorker: false })
        hlsRef.current = hls
        hls.loadSource(nextUrl)
        hls.attachMedia(videoEl)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (videoRef.current) {
            videoRef.current.muted = !isAudioActiveRef.current
            videoRef.current.volume = isAudioActiveRef.current ? 1 : 0
            videoRef.current.play().catch(() => undefined)
          }
        })
        hls.on(Hls.Events.ERROR, (_e, d) => {
          if (d.fatal) tryNextCandidate()
        })
      } else {
        videoEl.src = nextUrl
        videoEl.load()
        videoEl.play().catch(() => undefined)
      }
    }

    const onError = () => {
      if (videoEl.error && videoEl.error.code === videoEl.error.MEDIA_ERR_ABORTED) return
      tryNextCandidate()
    }

    videoEl.addEventListener('error', onError)
    tryNextCandidate()

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      videoEl.removeEventListener('error', onError)
      videoEl.src = ''
      release()
    }
  }, [url, mv.assignedServer])

  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    vid.muted = !isAudioActive
    vid.volume = isAudioActive ? 1 : 0
  }, [isAudioActive])

  return (
    <div className={`mv-tile ${isAudioActive ? 'mv-tile--audio' : ''}`} data-slot-position={position - 1}>
      <video ref={videoRef} className="mv-video" playsInline muted={!isAudioActive} />

      {error && (
        <div className="mv-error">
          <span>Erro no stream</span>
        </div>
      )}

      <div className="mv-tile-overlay">
        <div className="mv-tile-top">
          <span className="mv-tile-num">#{position}</span>
          <span className="mv-tile-name">{mv.channel.name}</span>
          {isAudioActive && <span className="mv-tile-audio">🔊</span>}
        </div>
        <div className="mv-tile-server">{mv.assignedServer.replace(/^https?:\/\//, '')}</div>
        <div className="mv-tile-actions">
          <button className="mv-btn" data-focusable={focusable ? "true" : "false"} onClick={onFocusAudio}>
            {isAudioActive ? 'Áudio ativo' : 'Ativar áudio'}
          </button>
          <button className="mv-btn" data-focusable={focusable ? "true" : "false"} onClick={onExpand}>
            Expandir
          </button>
          <button className="mv-btn mv-btn--remove" data-focusable={focusable ? "true" : "false"} onClick={onRemove}>
            Remover
          </button>
        </div>
      </div>
    </div>
  )
}

export function MultiViewScreen() {
  const server = useStore((s) => s.server)!
  const multiviewChannels = useStore((s) => s.multiviewChannels)
  const setMultiViewChannel = useStore((s) => s.setMultiViewChannel)
  const clearMultiView = useStore((s) => s.clearMultiView)
  const setCurrentMedia = useStore((s) => s.setCurrentMedia)
  const setScreen = useStore((s) => s.setScreen)
  const liveChannels = useStore((s) => s.liveChannels)
  const liveCategories = useStore((s) => s.liveCategories)
  const appendLiveChannels = useStore((s) => s.appendLiveChannels)

  const [audioChannelIndex, setAudioChannelIndex] = useState<number | null>(null)

  // Modal / Selection states
  const [showOverlay, setShowOverlay] = useState(false)
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [overlayChannels, setOverlayChannels] = useState<Channel[]>([])
  const [overlayPage, setOverlayPage] = useState(1)
  const [overlayHasMore, setOverlayHasMore] = useState(false)
  const [overlayLoading, setOverlayLoading] = useState(false)

  const overlayRef = useRef<HTMLDivElement>(null)

  const creds = { username: server.username, password: server.password }

  // Set default audio to the first occupied slot
  useEffect(() => {
    if (audioChannelIndex === null || multiviewChannels[audioChannelIndex] === null) {
      const firstActive = multiviewChannels.findIndex((m) => m !== null)
      if (firstActive !== -1) {
        setAudioChannelIndex(firstActive)
      } else {
        setAudioChannelIndex(null)
      }
    }
  }, [multiviewChannels, audioChannelIndex])

  const openSelection = (index: number) => {
    setActiveSlotIndex(index)
    setSearchQuery('')
    setSelectedCategoryId('all')
    setShowKeyboard(false)
    setOverlayChannels([])
    setOverlayPage(1)
    setOverlayHasMore(false)
    setShowOverlay(true)
    setTimeout(() => {
      focusFirst(overlayRef.current)
    }, 100)
  }

  const loadOverlayChannels = useCallback(async (page = 1) => {
    setOverlayLoading(true)

    try {
      const result = await getLiveChannelsPage(server.activeServer, server.username, server.password, {
        categoryId: selectedCategoryId === 'all' ? undefined : selectedCategoryId,
        search: searchQuery.trim() || undefined,
        page,
        limit: MULTIVIEW_CHANNEL_LIMIT,
      })

      appendLiveChannels(result.items)
      setOverlayChannels((current) => page > 1 ? mergeChannelLists(current, result.items) : result.items)
      setOverlayPage(result.page)
      setOverlayHasMore(result.hasMore)
    } catch (error) {
      console.error('[Arelon] erro ao carregar canais do Multi-View', error)
      if (page === 1) {
        setOverlayChannels(liveChannels.slice(0, MULTIVIEW_CHANNEL_LIMIT))
        setOverlayHasMore(false)
      }
    } finally {
      setOverlayLoading(false)
    }
  }, [appendLiveChannels, liveChannels, searchQuery, selectedCategoryId, server])

  useEffect(() => {
    if (!showOverlay) return

    const timer = window.setTimeout(() => {
      void loadOverlayChannels(1)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [loadOverlayChannels, showOverlay])

  const closeSelection = () => {
    setShowOverlay(false)
    const slotIdx = activeSlotIndex
    setActiveSlotIndex(null)
    setShowKeyboard(false)

    // Restore focus to the slot that was clicked
    setTimeout(() => {
      if (slotIdx !== null) {
        const slotEl = document.getElementById(`slot-${slotIdx}`)
        if (slotEl) {
          slotEl.focus()
        } else {
          // Occupied - find first action button
          const tileEl = document.querySelector(`.mv-tile[data-slot-position="${slotIdx}"]`)
          const btn = tileEl?.querySelector<HTMLElement>('[data-focusable="true"]')
          btn?.focus()
        }
      }
    }, 100)
  }

  const handleSelectChannel = (channel: Channel) => {
    if (activeSlotIndex === null) return

    // Pick a server that is NOT currently used by any other active slot to prevent collisions
    const activeServers = multiviewChannels
      .filter((m, idx) => m !== null && idx !== activeSlotIndex)
      .map((m) => m!.assignedServer)

    const assignedServer = pickServer(activeServers)

    setMultiViewChannel(activeSlotIndex, {
      channel,
      assignedServer,
    })

    // Set as active audio if it's the only channel playing
    const activeCount = multiviewChannels.filter(m => m !== null).length
    if (activeCount === 0) {
      setAudioChannelIndex(activeSlotIndex)
    }

    closeSelection()
  }

  useRemote((cmd, type) => {
    if (type !== 'keydown' && type !== 'tizenhwkey') return
    if (cmd === 'BACK') {
      if (showKeyboard) {
        setShowKeyboard(false)
        setTimeout(() => {
          const searchBtn = document.querySelector<HTMLElement>('.mv-overlay-search-display')
          searchBtn?.focus()
        }, 100)
      } else if (showOverlay) {
        closeSelection()
      } else {
        clearMultiView()
        setScreen('live')
      }
      return
    }

    if (!showKeyboard) {
      if (cmd === 'UP') moveFocus('UP')
      else if (cmd === 'DOWN') moveFocus('DOWN')
      else if (cmd === 'LEFT') moveFocus('LEFT')
      else if (cmd === 'RIGHT') moveFocus('RIGHT')
      else if (cmd === 'ENTER') {
        const activeEl = document.activeElement as HTMLElement
        activeEl?.click()
      }
    }
  })

  const filteredCategories = useMemo(() => {
    return liveCategories.filter((cat) => {
      const lowerName = cat.name.toLowerCase()
      return !MULTIVIEW_IGNORE_KEYWORDS.some((kw) => lowerName.includes(kw))
    })
  }, [liveCategories])

  const filteredChannels = overlayChannels

  return (
    <div className="mv-page">
      <div className="mv-header">
        <span className="mv-title">Multi-View — 4 Canais Simultâneos</span>
        <button
          className="mv-close"
          data-focusable={!showOverlay ? "true" : "false"}
          onClick={() => { clearMultiView(); setScreen('live') }}
        >
          ✕ Fechar
        </button>
      </div>

      <div className="mv-grid mv-grid--4">
        {multiviewChannels.map((mv, i) => {
          if (mv) {
            return (
              <Tile
                key={`tile-${i}-${mv.channel.id}`}
                mv={mv}
                position={i + 1}
                isAudioActive={audioChannelIndex === i}
                creds={creds}
                focusable={!showOverlay}
                onFocusAudio={() => setAudioChannelIndex(i)}
                onExpand={() => {
                  setCurrentMedia({
                    id: mv.channel.id,
                    title: mv.channel.name,
                    url: rebuildUrl(mv.channel.streamUrl, mv.assignedServer, server.username, server.password),
                    type: 'live',
                    poster: mv.channel.logo,
                    isLive: true,
                    assignedServer: mv.assignedServer,
                  })
                }}
                onRemove={() => {
                  setMultiViewChannel(i, null)
                  if (audioChannelIndex === i) {
                    setAudioChannelIndex(null)
                  }
                }}
              />
            )
          } else {
            return (
              <button
                key={`empty-${i}`}
                id={`slot-${i}`}
                className="mv-tile mv-tile--empty"
                data-focusable={!showOverlay ? "true" : "false"}
                onClick={() => openSelection(i)}
              >
                <div className="mv-empty-plus-circle">+</div>
                <div className="mv-empty-label">Slot {i + 1} — Selecionar Canal</div>
              </button>
            )
          }
        })}
      </div>

      {/* Painel Lateral Overlay Slide-over */}
      <div
        ref={overlayRef}
        className={`mv-overlay-panel ${showOverlay ? 'mv-overlay-panel--open' : ''}`}
      >
        <div className="mv-overlay-header">
          <span className="mv-overlay-title">Selecionar para Slot {activeSlotIndex !== null ? activeSlotIndex + 1 : ''}</span>
          <button
            className="mv-overlay-close-btn"
            data-focusable={showOverlay && !showKeyboard ? "true" : "false"}
            onClick={closeSelection}
          >
            ✕ Voltar
          </button>
        </div>

        <div className="mv-overlay-search-container">
          <button
            className="mv-overlay-search-display"
            data-focusable={showOverlay && !showKeyboard ? "true" : "false"}
            onClick={() => setShowKeyboard(true)}
          >
            {searchQuery || ''}
          </button>
        </div>

        <div className="mv-overlay-body">
          {/* Categorias (Esquerda) */}
          <div className="mv-overlay-cats">
            <button
              className={`mv-overlay-cat-btn ${selectedCategoryId === 'all' ? 'mv-overlay-cat-btn--active' : ''}`}
              data-focusable={showOverlay && !showKeyboard ? "true" : "false"}
              onClick={() => setSelectedCategoryId('all')}
            >
              Todos os Canais
            </button>
            {filteredCategories.map((cat) => (
              <button
                key={cat.id}
                className={`mv-overlay-cat-btn ${selectedCategoryId === cat.id ? 'mv-overlay-cat-btn--active' : ''}`}
                data-focusable={showOverlay && !showKeyboard ? "true" : "false"}
                onClick={() => setSelectedCategoryId(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Canais (Direita) */}
          <div className="mv-overlay-chs">
            {overlayLoading && filteredChannels.length === 0 ? (
              <div style={{ padding: '20px', color: '#888', textAlign: 'center', fontSize: '14px' }}>
                Carregando canais...
              </div>
            ) : filteredChannels.length === 0 ? (
              <div style={{ padding: '20px', color: '#888', textAlign: 'center', fontSize: '14px' }}>
                Nenhum canal encontrado
              </div>
            ) : (
              <>
                {filteredChannels.map((ch) => (
                  <button
                    key={ch.id}
                    className="mv-overlay-ch-item"
                    data-focusable={showOverlay && !showKeyboard ? "true" : "false"}
                    onClick={() => handleSelectChannel(ch)}
                  >
                    <div className="mv-overlay-ch-logo-container">
                      {ch.logo ? (
                        <img src={ch.logo} alt="" className="mv-overlay-ch-logo" onError={(e) => { (e.target as HTMLElement).style.display = 'none' }} />
                      ) : (
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1de7ff' }}>TV</span>
                      )}
                    </div>
                    <span className="mv-overlay-ch-name">{ch.name}</span>
                  </button>
                ))}
                {overlayHasMore && (
                  <button
                    className="mv-overlay-ch-item"
                    data-focusable={showOverlay && !showKeyboard ? "true" : "false"}
                    onClick={() => {
                      if (!overlayLoading) void loadOverlayChannels(overlayPage + 1)
                    }}
                  >
                    <div className="mv-overlay-ch-logo-container">
                      <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#1de7ff' }}>+</span>
                    </div>
                    <span className="mv-overlay-ch-name">{overlayLoading ? 'Carregando...' : 'Carregar mais canais'}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

      </div>

      {/* Teclado Virtual (Slide-up bottom) */}
      {showKeyboard && (
        <div className="mv-overlay-keyboard-container">
          <Keyboard
            label="Buscar Canal"
            value={searchQuery}
            onChange={setSearchQuery}
            onDone={() => {
              setShowKeyboard(false)
              setTimeout(() => {
                const searchBtn = document.querySelector<HTMLElement>('.mv-overlay-search-display')
                searchBtn?.focus()
              }, 100)
            }}
          />
        </div>
      )}
    </div>
  )
}
