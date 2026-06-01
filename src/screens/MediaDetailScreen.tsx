import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Episode } from '../store'
import { moveFocus, useRemote } from '../hooks/useRemote'
import { unlockAudio } from '../lib/tvSound'
import { getVodInfo, getSeriesInfo, getSeriesEpisodes, episodeUrl } from '../api/xtream'
import { MediaCard } from '../components/MediaCard'
import { MediaRow } from '../components/MediaRow'

export function MediaDetailScreen() {
  const selectedDetailMedia = useStore((s) => s.selectedDetailMedia)
  const setSelectedDetailMedia = useStore((s) => s.setSelectedDetailMedia)
  const setCurrentMedia = useStore((s) => s.setCurrentMedia)
  const setPlayerReturnDetail = useStore((s) => s.setPlayerReturnDetail)
  const server = useStore((s) => s.server)
  const pageRef = useRef<HTMLDivElement>(null)

  // Controle explícito de qual botão de ação está focado (0=Reproduzir, 1=+, 2=Voltar)
  const [focusedBtn, setFocusedBtn] = useState<0 | 1 | 2>(0)
  const btnPlayRef = useRef<HTMLButtonElement>(null)
  const btnAddRef = useRef<HTMLButtonElement>(null)
  const btnBackRef = useRef<HTMLButtonElement>(null)

  const isSeries = selectedDetailMedia?.type === 'episode'

  // Episódios de séries — agora sempre carregados e exibidos inline (sem painel separado)
  const [episodes, setEpisodes] = useState<Record<string, Episode[]>>({})
  const [seasons, setSeasons] = useState<string[]>([])
  const [loadingEpisodes, setLoadingEpisodes] = useState(false)

  const [details, setDetails] = useState<{
    plot?: string
    year?: string
    rating?: string
    director?: string
    cast?: string
    duration?: string
  } | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Background & Trailer support for pre-player screen
  const [backgroundImage, setBackgroundImage] = useState<string>('') // will always be a string after fetch
  const [trailerSource, setTrailerSource] = useState<string | null>(null) // direct video url or youtube id
  const [isTrailerYoutube, setIsTrailerYoutube] = useState(false)

  // Helper to extract YouTube video ID from various formats
  function extractYoutubeId(input: string): string | null {
    if (!input) return null
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input
    const match = input.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/)
    return (match && match[1]) ? match[1] : null
  }

  // Foco inicial: sempre no botão "Reproduzir" ao abrir o detalhe
  useEffect(() => {
    setFocusedBtn(0)
    // Reset trailer/background when opening a new detail
    setBackgroundImage('')
    setTrailerSource(null)
    setIsTrailerYoutube(false)

    const t = setTimeout(() => btnPlayRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [selectedDetailMedia])

  // Aplica foco real via ref sempre que focusedBtn muda (apenas no detalhe)
  useEffect(() => {
    if (focusedBtn === 0) btnPlayRef.current?.focus()
    else if (focusedBtn === 1) btnAddRef.current?.focus()
    else btnBackRef.current?.focus()
  }, [focusedBtn])

  // Busca metadados reais de forma assíncrona
  useEffect(() => {
    if (!selectedDetailMedia || !server) return

    setLoadingDetails(true)
    setDetails(null)

    const fetchDetails = async () => {
      try {
        let newDetails: any = null
        let bgImage = selectedDetailMedia.poster || ''
        let trailer: string | null = null
        let isYT = false

        if (selectedDetailMedia.type === 'movie') {
          const res = await getVodInfo(server.activeServer, server.username, server.password, selectedDetailMedia.id)

          if (res?.info) {
            newDetails = {
              plot: res.info.plot || selectedDetailMedia.plot || '',
              year: res.info.year || res.info.releasedate?.split('-')[0] || selectedDetailMedia.year || '',
              rating: res.info.rating || selectedDetailMedia.rating || '',
              director: res.info.director || '',
              cast: res.info.cast || '',
              duration: res.info.duration || (res.info.duration_secs ? `${Math.round(res.info.duration_secs / 60)}m` : '') || selectedDetailMedia.duration || ''
            }

            // Prefer wide backdrop over poster
            const backdrops = res.info.backdrop_path
            if (Array.isArray(backdrops) && backdrops.length > 0) {
              bgImage = backdrops[0] || bgImage
            } else if (typeof backdrops === 'string' && backdrops) {
              bgImage = backdrops
            } else if (res.info.movie_image) {
              bgImage = res.info.movie_image || bgImage
            }

            // Trailer detection
            const t = res.info.trailer || res.info.youtube_trailer
            if (t) {
              if (t.includes('youtube') || t.includes('youtu.be') || t.length === 11) {
                // YouTube ID or URL
                const ytId = extractYoutubeId(t)
                if (ytId) {
                  trailer = ytId
                  isYT = true
                }
              } else if (t.startsWith('http')) {
                trailer = t // direct video url
              }
            }
          }
        } else {
          // Series
          const res = await getSeriesInfo(server.activeServer, server.username, server.password, selectedDetailMedia.id)

          if (res?.info) {
            newDetails = {
              plot: res.info.plot || selectedDetailMedia.plot || '',
              year: res.info.year || res.info.releaseDate?.split('-')[0] || selectedDetailMedia.year || '',
              rating: res.info.rating || selectedDetailMedia.rating || '',
              director: res.info.director || '',
              cast: res.info.cast || '',
              duration: ''
            }

            const backdrops = res.info.backdrop_path
            if (Array.isArray(backdrops) && backdrops.length > 0) {
              bgImage = backdrops[0] || bgImage
            } else if (typeof backdrops === 'string' && backdrops) {
              bgImage = backdrops
            } else if (res.info.movie_image || res.info.cover) {
              bgImage = res.info.movie_image || res.info.cover || bgImage
            }

            const t = res.info.trailer || res.info.youtube_trailer
            if (t) {
              if (t.includes('youtube') || t.includes('youtu.be') || t.length === 11) {
                const ytId = extractYoutubeId(t)
                if (ytId) {
                  trailer = ytId
                  isYT = true
                }
              } else if (t.startsWith('http')) {
                trailer = t
              }
            }
          }
        }

        if (newDetails) {
          setDetails(newDetails)
        }

        setBackgroundImage(bgImage || selectedDetailMedia.poster || '')
        setTrailerSource(trailer)
        setIsTrailerYoutube(isYT)
      } catch (err) {
        console.error('Erro ao buscar detalhes da mídia:', err)
        setDetails({
          plot: selectedDetailMedia.plot || 'Descrição não disponível.',
          year: selectedDetailMedia.year || '',
          rating: selectedDetailMedia.rating || '',
          director: 'Não informado',
          cast: 'Não informado',
          duration: selectedDetailMedia.duration || ''
        })
        setBackgroundImage(selectedDetailMedia.poster || '')
        setTrailerSource(null)
        setIsTrailerYoutube(false)
      } finally {
        setLoadingDetails(false)
      }
    }

    void fetchDetails()
  }, [selectedDetailMedia, server])

  // Carrega a lista de episódios (somente séries). Sem isso a série abria o player
  // com URL vazia e ficava em "Carregando..." para sempre.
  useEffect(() => {
    if (!selectedDetailMedia || !server || selectedDetailMedia.type !== 'episode') {
      setEpisodes({})
      setSeasons([])
      return
    }

    let cancelled = false
    setLoadingEpisodes(true)
    getSeriesEpisodes(server.activeServer, server.username, server.password, selectedDetailMedia.id)
      .then((eps) => {
        if (cancelled) return
        const ks = Object.keys(eps).sort((a, b) => Number(a) - Number(b))
        setEpisodes(eps)
        setSeasons(ks)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Erro ao buscar episódios:', err)
        setEpisodes({})
        setSeasons([])
      })
      .finally(() => {
        if (!cancelled) setLoadingEpisodes(false)
      })

    return () => { cancelled = true }
  }, [selectedDetailMedia, server])



  function playEpisode(ep: Episode) {
    if (!server || !selectedDetailMedia) return

    // Salva o detalhe atual para que o BACK do player volte para cá
    setPlayerReturnDetail(selectedDetailMedia)

    setCurrentMedia({
      id: ep.id,
      title: `${selectedDetailMedia.title} · T${ep.season}E${ep.episodeNum}`,
      url: episodeUrl(server.activeServer, server.username, server.password, ep.id, ep.ext),
      type: 'episode',
      poster: selectedDetailMedia.poster,
    })
  }

  function handlePlay() {
    if (!selectedDetailMedia) return

    // Salva o detalhe atual para que o BACK do player volte para cá
    setPlayerReturnDetail(selectedDetailMedia)

    // Para séries: reproduz o primeiro episódio da primeira temporada disponível
    if (selectedDetailMedia.type === 'episode' && seasons.length > 0) {
      const firstSeason = seasons[0]!
      const list = episodes[firstSeason] ?? []
      if (list.length > 0 && list[0]) {
        playEpisode(list[0])
        return
      }
    }

    // Filme ou série sem episódios: reproduz direto
    setCurrentMedia(selectedDetailMedia)
  }

  useRemote((cmd, type) => {
    if (type !== 'keydown' && type !== 'tizenhwkey') return

    if (cmd === 'BACK') {
      unlockAudio()
      setSelectedDetailMedia(null)
      return
    }

    // Navegação explícita entre os três botões de ação (quando não estamos dentro da lista de episódios)
    const isOnPlay = document.activeElement === btnPlayRef.current
    const isOnAdd  = document.activeElement === btnAddRef.current
    const isOnBack = document.activeElement === btnBackRef.current

    if (isOnPlay && cmd === 'RIGHT') { setFocusedBtn(1); return }
    if (isOnAdd  && cmd === 'LEFT')  { setFocusedBtn(0); return }
    if (isOnAdd  && cmd === 'RIGHT') { setFocusedBtn(2); return }
    if (isOnBack && cmd === 'LEFT')  { setFocusedBtn(1); return }

    // Para todas as outras direções, usa o algoritmo de foco espacial (incluindo os cards de episódio)
    if (cmd === 'UP') moveFocus('UP')
    else if (cmd === 'DOWN') moveFocus('DOWN')
    else if (cmd === 'LEFT') moveFocus('LEFT')
    else if (cmd === 'RIGHT') moveFocus('RIGHT')
    else if (cmd === 'ENTER') {
      ;(document.activeElement as HTMLElement)?.click()
    }
  })

  if (!selectedDetailMedia) return null

  // Carrega valores finais reais ou fallbacks
  const plotText = loadingDetails ? 'Carregando detalhes...' : (details?.plot || selectedDetailMedia.plot || 'Nenhuma descrição disponível.')
  const yearText = details?.year || selectedDetailMedia.year || '2026'
  const ratingText = details?.rating || selectedDetailMedia.rating || 'L'
  const durationText = details?.duration || selectedDetailMedia.duration || ''
  const directorText = details?.director || 'Não informado'
  const castText = details?.cast || 'Não informado'

  return (
    <div className="media-detail-screen" ref={pageRef}>
      {/* Background: either a good wide image from IPTV or a playing trailer */}
      <div
        className="detail-background"
        style={{ backgroundImage: trailerSource ? 'none' : `url(${backgroundImage})` }}
      />

      {/* Trailer background video (only for direct MP4/HLS trailers) */}
      {trailerSource && !isTrailerYoutube && (
        <video
          className="detail-trailer-bg"
          src={trailerSource}
          autoPlay
          loop
          muted={false}
          playsInline
          onLoadedMetadata={(e) => {
            // Set low volume after load
            const v = e.currentTarget
            v.volume = 0.18
          }}
        />
      )}

      {/* YouTube trailer attempt (best effort - volume control is limited on some TVs) */}
      {trailerSource && isTrailerYoutube && (
        <iframe
          className="detail-trailer-bg detail-trailer-youtube"
          src={`https://www.youtube.com/embed/${trailerSource}?autoplay=1&mute=0&controls=0&loop=1&playlist=${trailerSource}&modestbranding=1&rel=0`}
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      )}
      <div className="detail-gradient-overlay" />

      {/* Scrollable content area — backgrounds stay fixed */}
      <div className="detail-scroll-area">
        <div className="detail-content">
        <h1 className="detail-title">{selectedDetailMedia.title}</h1>

        <div className="detail-metadata">
          <span className="meta-badge">{yearText}</span>
          <span className="meta-badge">{ratingText}</span>
          {durationText && <span className="meta-badge">{durationText}</span>}
          <span className="meta-badge meta-4k">4K</span>
          <span className="meta-badge meta-dolby">Dolby Vision</span>
          <span className="meta-badge meta-atmos">Dolby Atmos</span>
        </div>

        <p className="detail-description">
          {plotText}
        </p>

        <div className="detail-actions">
          <button
            ref={btnPlayRef}
            className="detail-btn detail-btn-primary"
            data-focusable="true"
            tabIndex={focusedBtn === 0 ? 0 : -1}
            onClick={handlePlay}
          >
            {isSeries ? 'Ver Episódios' : 'Reproduzir'}
          </button>
          <button
            ref={btnAddRef}
            className="detail-btn detail-btn-secondary"
            data-focusable="true"
            tabIndex={focusedBtn === 1 ? 0 : -1}
          >
            + Minha Lista
          </button>
          <button
            ref={btnBackRef}
            className="detail-btn detail-btn-secondary"
            data-focusable="true"
            tabIndex={focusedBtn === 2 ? 0 : -1}
            onClick={() => setSelectedDetailMedia(null)}
          >
            Voltar
          </button>
        </div>

        <div className="detail-credits">
          <p><strong>Estrelando:</strong> {castText}</p>
          <p><strong>Direção:</strong> {directorText}</p>
        </div>

        {/* Seção de episódios para séries — usa o MESMO padrão de MediaRow da tela inicial e tela de esportes.
            Isso garante:
            - Espaçamento idêntico (gap 26px + room para foco)
            - Animação de foco idêntica
            - Navegação UP/DOWN entre temporadas usando o sistema otimizado de filas (findAdjacentMediaRowTarget + alignRowToTop)
            - Economia de processamento: a tela principal fica mais estável, só a "faixa" da temporada é trazida para a área visível
        */}
        {isSeries && seasons.length > 0 && (
          <div className="live-channel-scroll detail-episodes-scroll">
            {loadingEpisodes ? (
              <div className="detail-episodes-loading">Carregando episódios...</div>
            ) : (
              seasons.map((seasonNum) => {
                const list = episodes[seasonNum] ?? []
                if (list.length === 0) return null

                return (
                  <MediaRow key={seasonNum} title={`Temporada ${seasonNum}`}>
                    {list.map((ep) => (
                      <MediaCard
                        key={ep.id}
                        id={ep.id}
                        title={ep.title || `Episódio ${ep.episodeNum}`}
                        imageUrl={ep.image || ''}
                        aspectRatio="landscape"
                        data-focusable="true"
                        onClick={() => playEpisode(ep)}
                      />
                    ))}
                  </MediaRow>
                )
              })
            )}
          </div>
        )}

        </div>
      </div>
    </div>
  )
}
