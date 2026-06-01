import { useEffect, useRef, useState } from 'react'
import { useStore, shouldShowChannel } from '../store'
import { focusFirst, moveFocus, useRemote } from '../hooks/useRemote'
import { MediaRow } from '../components/MediaRow'
import { MediaCard } from '../components/MediaCard'
import { LivePreview } from '../components/LivePreview'
import type { EpgProgram } from '../api/xtream'
import { MatchMediaRow } from '../components/MatchMediaRow'
import type { MatchCardItem } from '../components/MatchMediaRow'
import { setTransitioningToFullscreenUrl } from '../lib/playback'
import { getShortEpg } from '../api/xtream'
import type { Channel } from '../store'

const MOCK_MATCHES: Record<string, MatchCardItem[]> = {
  futebol: [
    {
      id: 'f1',
      category: 'futebol',
      categoryLabel: 'Futebol',
      teamA: {
        name: 'Flamengo',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/4/43/Flamengo_braz_logo.svg',
      },
      teamB: {
        name: 'Palmeiras',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/1/10/Palmeiras_logo.svg',
      },
      time: '21:30',
      channel: {
        name: 'Premiere',
        url: '/player/premiere',
      },
    },
    {
      id: 'f2',
      category: 'futebol',
      categoryLabel: 'Futebol',
      teamA: {
        name: 'Botafogo',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/Escudo_Botafogo.png',
      },
      teamB: {
        name: 'Fluminense',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/a/ad/Fluminense_FC_escudo.png',
      },
      time: '18:00',
      channel: {
        name: 'SporTV',
        url: '/player/sportv',
      },
    },
    {
      id: 'f3',
      category: 'futebol',
      categoryLabel: 'Futebol',
      teamA: {
        name: 'Corinthians',
        logo: 'https://upload.wikimedia.org/wikipedia/en/5/5a/Sport_Club_Corinthians_Paulista_crest.svg',
      },
      teamB: {
        name: 'São Paulo',
        logo: 'https://upload.wikimedia.org/wikipedia/en/0/0f/Sao_Paulo_FC_crest.svg',
      },
      time: '16:00',
      channel: {
        name: 'Globo',
        url: '/player/globo',
      },
    },
  ],
  lutas: [
    {
      id: 'l1',
      category: 'lutas',
      categoryLabel: 'Lutas & UFC',
      teamA: {
        name: 'Alex Poatan',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/UFC_logo.svg',
      },
      teamB: {
        name: 'Israel Adesanya',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/UFC_logo.svg',
      },
      time: '23:00',
      channel: {
        name: 'Combate',
        url: '/player/combate',
      },
    },
    {
      id: 'l2',
      category: 'lutas',
      categoryLabel: 'Lutas & UFC',
      teamA: {
        name: 'Charles do Bronx',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/UFC_logo.svg',
      },
      teamB: {
        name: 'Islam Makhachev',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/UFC_logo.svg',
      },
      time: '22:00',
      channel: {
        name: 'Combate',
        url: '/player/combate',
      },
    },
  ],
  velocidade: [
    {
      id: 'v1',
      category: 'velocidade',
      categoryLabel: 'Velocidade',
      teamA: {
        name: 'GP de Mônaco',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/3/33/F1_logo.svg',
      },
      teamB: {
        name: 'Corrida Principal',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/3/33/F1_logo.svg',
      },
      time: '09:00',
      channel: {
        name: 'Band',
        url: '/player/band',
      },
    },
    {
      id: 'v2',
      category: 'velocidade',
      categoryLabel: 'Velocidade',
      teamA: {
        name: 'Indy 500',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/5/52/IndyCar_Series_logo.svg',
      },
      teamB: {
        name: 'Indianapolis',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/5/52/IndyCar_Series_logo.svg',
      },
      time: '13:00',
      channel: {
        name: 'BandSports',
        url: '/player/bandsports',
      },
    },
  ],
  americanos: [
    {
      id: 'a1',
      category: 'americanos',
      categoryLabel: 'E. Americanos',
      teamA: {
        name: 'LA Lakers',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3c/Los_Angeles_Lakers_logo.svg',
      },
      teamB: {
        name: 'Boston Celtics',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Boston_Celtics.svg',
      },
      time: '21:00',
      channel: {
        name: 'ESPN',
        url: '/player/espn',
      },
    },
    {
      id: 'a2',
      category: 'americanos',
      categoryLabel: 'E. Americanos',
      teamA: {
        name: 'Kansas City Chiefs',
        logo: 'https://upload.wikimedia.org/wikipedia/en/e/e1/Kansas_City_Chiefs_logo.svg',
      },
      teamB: {
        name: 'San Francisco 49ers',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/San_Francisco_49ers_logo.svg',
      },
      time: '20:30',
      channel: {
        name: 'ESPN',
        url: '/player/espn2',
      },
    },
  ],
  geral: [
    {
      id: 'g1',
      category: 'geral',
      categoryLabel: 'Canais Gerais',
      teamA: {
        name: 'Brasil',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Flag_of_Brazil.svg',
      },
      teamB: {
        name: 'Itália',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/0/03/Flag_of_Italy.svg',
      },
      time: '10:00',
      channel: {
        name: 'SporTV',
        url: '/player/sportv2',
      },
    },
  ],
}

export function LiveScreen({ filter = 'all' }: { filter?: 'tv' | 'esporte' | 'all' }) {
  const rawLiveChannels = useStore((s) => s.liveChannels)
  const liveCategories = useStore((s) => s.liveCategories)
  const selectedState = useStore((s) => s.selectedState)
  const liveChannels = rawLiveChannels.filter((c) => shouldShowChannel(c.name, selectedState))

  const setCurrentMedia = useStore((s) => s.setCurrentMedia)
  const setScreen = useStore((s) => s.setScreen)
  const server = useStore((s) => s.server)!
  const pageRef = useRef<HTMLDivElement>(null)
  const [previewChannel, setPreviewChannel] = useState<Channel | null>(null)
  const [epgPrograms, setEpgPrograms] = useState<EpgProgram[]>([])
  const [activeSportTab, setActiveSportTab] = useState('all')

  // Formata horário EPG (ex: "2025-06-02 14:30:00" → "14:30")
  function formatEpgTime(dateTime?: string): string {
    if (!dateTime) return '--:--'
    try {
      // Aceita "2025-06-02 14:30:00" ou ISO
      const normalized = dateTime.replace(' ', 'T')
      const d = new Date(normalized)
      if (isNaN(d.getTime())) return dateTime.slice(11, 16)
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return dateTime.slice(11, 16) || '--:--'
    }
  }

  useEffect(() => {
    const t = setTimeout(() => focusFirst(pageRef.current), 150)
    return () => clearTimeout(t)
  }, [])

  // EPG (programa atual + próximo) do canal em preview no hero
  useEffect(() => {
    if (!previewChannel) {
      setEpgPrograms([])
      return
    }
    let cancelled = false
    setEpgPrograms([])
    getShortEpg(server.activeServer, server.username, server.password, previewChannel.id, 2)
      .then((progs) => {
        if (!cancelled) setEpgPrograms(progs)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [previewChannel, server])

  function focusTopNavigation() {
    const layout = pageRef.current?.closest<HTMLElement>('.app-layout')
    layout?.scrollTo({ top: 0, behavior: 'auto' })

    requestAnimationFrame(() => {
      const activeMenuItem = document.querySelector<HTMLElement>('.arelon-topnav-item--active[data-focusable="true"]')
      activeMenuItem?.focus()
    })
  }

  useRemote((cmd, type) => {
    if (type !== 'keydown' && type !== 'tizenhwkey') return
    if (cmd === 'BACK') {
      unlockAudio()
      const cur = document.activeElement as HTMLElement | null
      if (cur?.closest('.arelon-topbar')) {
        setScreen('home')
      } else {
        focusTopNavigation()
      }
    } else if (cmd === 'UP') moveFocus('UP')
    else if (cmd === 'DOWN') moveFocus('DOWN')
    else if (cmd === 'LEFT') moveFocus('LEFT')
    else if (cmd === 'RIGHT') moveFocus('RIGHT')
    else if (cmd === 'ENTER') (document.activeElement as HTMLElement)?.click()
  })

  function playChannel(ch: Channel) {
    setTransitioningToFullscreenUrl(ch.streamUrl)
    setCurrentMedia({
      id: ch.id,
      title: ch.name,
      url: ch.streamUrl,
      type: 'live',
      poster: ch.logo,
      isLive: true,
      assignedServer: server.activeServer,
      streams: ch.streams,
    })
  }

  // 1º clique: mostra o canal no preview do hero. Clicar de novo no mesmo canal (ou OK no preview): tela cheia.
  function handleChannelClick(ch: Channel) {
    if (previewChannel?.id === ch.id) {
      playChannel(ch)
    } else {
      setPreviewChannel(ch)
    }
  }

  const isSports = filter === 'esporte'

  const ignoreKeywords = ['cliente', 'aviso', 'teste', 'suporte']

  // Verifica se um determinado canal ou sua categoria pertencem estritamente à seção de Esportes
  function checkIsSport(channelName: string, categoryName: string): boolean {
    const ch = channelName.toLowerCase()
    const cat = categoryName.toLowerCase()

    // 1. Palavras-chave estritamente de esportes
    const strictSports = [
      'esporte',
      'sport',
      'futebol',
      'premiere',
      'combate',
      'nba',
      'ufc',
      'espn',
      'dazn',
      'conmebol',
      'copa',
      'racing',
      'f1',
      'formula 1',
      'formula one',
      'arena',
      'golf',
      'tennis',
      'tenis',
      'wwe',
      'nfl',
      'olimpiada',
      'olympic',
      'atletismo',
      'skate',
      'surf',
      'rugby',
      'volleyball',
      'volei',
      'basquete',
      'liga',
      'champions',
      'libertadores',
      'brasileirao',
      'velocidade',
    ]

    // Se o nome do canal ou da categoria tem um termo estrito de esporte
    if (strictSports.some((kw) => cat.includes(kw) || ch.includes(kw))) {
      return true
    }

    // 2. Canais esportivos específicos de redes que possuem canais gerais (como Band e Fox)
    const specificSportsChannels = ['fox sports', 'fox sport', 'band sports', 'band sport', 'bandesportes']
    if (specificSportsChannels.some((kw) => ch.includes(kw))) {
      return true
    }

    return false
  }

  // Lógica específica para Esportes
  const classifiedSports = (() => {
    if (!isSports) return null

    const futebol: Channel[] = []
    const lutas: Channel[] = []
    const velocidade: Channel[] = []
    const americanos: Channel[] = []
    const geral: Channel[] = []

    liveChannels.forEach((c) => {
      const catName = liveCategories.find((cat) => cat.id === c.categoryId)?.name ?? ''
      if (!checkIsSport(c.name, catName)) return

      const ch = c.name.toLowerCase()
      const cat = catName.toLowerCase()

      if (
        [
          'futebol',
          'premiere',
          'conmebol',
          'copa',
          'libertadores',
          'champions',
          'brasileirao',
          'liga',
          'fla',
          'corinthians',
          'palmeiras',
        ].some((kw) => ch.includes(kw) || cat.includes(kw))
      ) {
        futebol.push(c)
      } else if (['combate', 'ufc', 'wwe', 'mma', 'boxe', 'luta', 'fight', 'knockout'].some((kw) => ch.includes(kw) || cat.includes(kw))) {
        lutas.push(c)
      } else if (
        ['f1', 'formula 1', 'formula one', 'racing', 'velocidade', 'nascar', 'moto gp', 'motogp', 'auto'].some(
          (kw) => ch.includes(kw) || cat.includes(kw),
        )
      ) {
        velocidade.push(c)
      } else if (['nba', 'nfl', 'basquete', 'golf', 'tennis', 'tenis', 'super bowl'].some((kw) => ch.includes(kw) || cat.includes(kw))) {
        americanos.push(c)
      } else {
        geral.push(c)
      }
    })

    return { futebol, lutas, velocidade, americanos, geral }
  })()

  // SVGs de Ícones esportivos embutidos
  const soccerIcon = (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" className="sport-shortcut-icon">
      <circle cx="12" cy="12" r="10" />
      <path d="m12 7-1.5 2h3zM8 12.5l2-1.5v3zM16 12.5l-2-1.5v3zM10.5 17.5l1.5-2 1.5 2zM12 2v5M2 12h6M16 12h6M12 22v-4.5" />
    </svg>
  )

  const fightIcon = (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="sport-shortcut-icon"
    >
      <path d="M18 10h-4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2z" />
      <path d="M12 14H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h6" />
      <path d="M12 10V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4" />
    </svg>
  )

  const racingIcon = (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="sport-shortcut-icon"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )

  const basketballIcon = (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" className="sport-shortcut-icon">
      <circle cx="12" cy="12" r="10" />
      <path d="M6.2 6.2c3 3 3 8.6 0 11.6M17.8 6.2c-3 3-3 8.6 0 11.6M12 2v20M2 12h20" />
    </svg>
  )

  const trophyIcon = (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="sport-shortcut-icon"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
      <path d="M12 2a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" />
    </svg>
  )

  const gridIcon = (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" className="sport-shortcut-icon">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  )

  const shortcuts = [
    {
      id: 'all',
      label: 'Ver Todos',
      icon: gridIcon,
      hasData: true,
    },
    {
      id: 'futebol',
      label: 'Futebol',
      icon: soccerIcon,
      hasData: classifiedSports ? classifiedSports.futebol.length > 0 : false,
    },
    {
      id: 'lutas',
      label: 'Lutas & UFC',
      icon: fightIcon,
      hasData: classifiedSports ? classifiedSports.lutas.length > 0 : false,
    },
    {
      id: 'velocidade',
      label: 'Velocidade',
      icon: racingIcon,
      hasData: classifiedSports ? classifiedSports.velocidade.length > 0 : false,
    },
    {
      id: 'americanos',
      label: 'E. Americanos',
      icon: basketballIcon,
      hasData: classifiedSports ? classifiedSports.americanos.length > 0 : false,
    },
    {
      id: 'geral',
      label: 'Canais Gerais',
      icon: trophyIcon,
      hasData: classifiedSports ? classifiedSports.geral.length > 0 : false,
    },
  ].filter((s) => s.hasData)

  function handleShortcutClick(id: string) {
    setActiveSportTab(id)
  }

  function handleOpenMatchChannel(item: MatchCardItem) {
    const nameLower = item.channel.name.toLowerCase()
    const realChannel = liveChannels.find((c) => c.name.toLowerCase().includes(nameLower))

    if (realChannel) {
      playChannel(realChannel)
    } else {
      console.warn(`Canal ${item.channel.name} não encontrado. Redirecionando para ${item.channel.url}`)
      window.location.assign(item.channel.url)
    }
  }

  // Filtragem das categorias padrão
  const filteredCategories = liveCategories.filter((cat) => {
    const lowerName = cat.name.toLowerCase()
    if (ignoreKeywords.some((kw) => lowerName.includes(kw))) return false
    if (filter === 'all') return true

    // Para a tela de esportes, a categoria deve ser mantida se contiver pelo menos um canal de esporte.
    const hasSportChannel = liveChannels.some((c) => c.categoryId === cat.id && checkIsSport(c.name, cat.name))

    if (filter === 'esporte') {
      return hasSportChannel
    }

    // Para a tela de TV normal (filter === 'tv'), a categoria deve ser mantida se contiver pelo menos um canal que NÃO seja de esporte.
    const hasNonSportChannel = liveChannels.some((c) => c.categoryId === cat.id && !checkIsSport(c.name, cat.name))
    return hasNonSportChannel
  })

  // Ordena as categorias de TV ao vivo de acordo com a prioridade solicitada:
  // Notícias, Canais nacionais abertos, Canais de curiosidade, Documentários, Filmes e depois etc.
  function getCategoryPriority(name: string): number {
    const n = name.toLowerCase()

    // 1. Notícias
    if (['noticia', 'news', 'jornal', 'cnn', 'globonews', 'record news', 'band news', 'câmara', 'senado'].some((kw) => n.includes(kw))) {
      return 1
    }

    // 2. Canais Nacionais Abertos
    if (
      ['aberto', 'nacional', 'tv aberta', 'globo', 'sbt', 'record', 'band', 'redetv', 'rede tv', 'abertos'].some((kw) => n.includes(kw))
    ) {
      return 2
    }

    // 3. Curiosidade
    if (['curiosidade', 'fatos', 'curioso'].some((kw) => n.includes(kw))) {
      return 3
    }

    // 4. Documentários
    if (
      ['documentario', 'docum', 'doc', 'docs', 'discovery', 'history', 'nat geo', 'national geographic', 'planet'].some((kw) =>
        n.includes(kw),
      )
    ) {
      return 4
    }

    // 5. Filmes
    if (
      ['filme', 'movie', 'cinema', 'hbo', 'telecine', 'universal', 'warner', 'action', 'megapix', 'studio', 'paramount'].some((kw) =>
        n.includes(kw),
      )
    ) {
      return 5
    }

    // 6. Outros
    return 100
  }

  const sortedCategories = [...filteredCategories].sort((a, b) => {
    const prioA = getCategoryPriority(a.name)
    const prioB = getCategoryPriority(b.name)
    if (prioA !== prioB) return prioA - prioB
    return a.name.localeCompare(b.name)
  })

  return (
    <div className={`home-page live-page ${isSports ? 'sports-page' : ''}`} ref={pageRef}>
      <div className="home-content">
        <div
          className="home-hero-banner"
          style={{
            minHeight: '580px',
            background: '#000000',
            margin: '-32px -40px 40px -40px',
            display: 'flex',
            alignItems: 'center',
            gap: '56px',
            padding: '178px 60px 60px 60px',
          }}
        >
          <div style={{ width: 680, height: 383, flexShrink: 0 }}>
            {previewChannel ? (
              <LivePreview
                key={previewChannel.id}
                streamUrl={previewChannel.streamUrl}
                channelName={previewChannel.name}
                logo={previewChannel.logo}
                onActivate={() => playChannel(previewChannel)}
              />
            ) : (
              <div
                className="live-preview-box"
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 24,
                  background: '#000000 center/30% no-repeat url(/assets/arelon/Icone_SF_Arelon.png)',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
                }}
              />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: '48px', fontWeight: 900, marginBottom: '8px' }}>
              {previewChannel ? previewChannel.name : isSports ? 'Esportes Ao Vivo' : 'TV Ao Vivo'}
            </h1>

            {previewChannel && epgPrograms.length > 0 ? (
              <>
                {/* Programa atual */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff', lineHeight: 1.25 }}>
                    {epgPrograms[0]?.title || 'Programa ao vivo'}
                  </div>
                  <div style={{ fontSize: '17px', color: '#1de7ff', marginTop: '4px', fontWeight: 500 }}>
                    {formatEpgTime(epgPrograms[0]?.start)} — {formatEpgTime(epgPrograms[0]?.end)}
                  </div>
                </div>

                {/* A seguir */}
                {epgPrograms[1] && (
                  <div>
                    <div style={{ fontSize: '15px', color: '#888', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '2px' }}>
                      A SEGUIR
                    </div>
                    <div style={{ fontSize: '18px', color: '#ddd', lineHeight: 1.3 }}>
                      {formatEpgTime(epgPrograms[1]?.start)} — {epgPrograms[1]?.title}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: '22px', color: '#ccc', lineHeight: 1.4 }}>
                {previewChannel ? 'Ao vivo agora' : 'Saiba o que está sendo transmitido antes de decidir assistir.'}
              </p>
            )}
          </div>
        </div>

        <div className={`live-channel-region${isSports ? ' live-channel-region--sports' : ''}`}>
          {isSports && shortcuts.length > 0 && (
            <div className="arelon-sport-shortcuts" aria-label="Atalhos de esporte">
              {shortcuts.map((s) => (
                <button
                  key={s.id}
                  className={`sport-shortcut-btn ${activeSportTab === s.id ? 'sport-shortcut-btn--active' : ''}`}
                  data-focusable="true"
                  onClick={() => handleShortcutClick(s.id)}
                >
                  {s.icon}
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="live-channel-scroll">
            {isSports ? (
              <>
                {/* Fileira de Partidas Dinâmicas que se adapta à categoria selecionada */}
                <MatchMediaRow
                  title={`Jogos de Hoje - ${
                    activeSportTab === 'futebol' ? 'Futebol' :
                    activeSportTab === 'lutas' ? 'Lutas & UFC' :
                    activeSportTab === 'velocidade' ? 'Velocidade' :
                    activeSportTab === 'americanos' ? 'Esportes Americanos' :
                    activeSportTab === 'geral' ? 'Canais Gerais' :
                    'Todos os Esportes'
                  }`}
                  items={activeSportTab === 'all' ? Object.values(MOCK_MATCHES).flat() : (MOCK_MATCHES[activeSportTab] || [])}
                  onOpenChannel={handleOpenMatchChannel}
                />

                {classifiedSports && classifiedSports.futebol.length > 0 && (
                  <div id="row-futebol">
                    <MediaRow title="Futebol">
                      {classifiedSports.futebol.map((c) => (
                        <MediaCard
                          key={c.id}
                          id={c.id}
                          title={c.name}
                          imageUrl={c.logo || ''}
                          aspectRatio="landscape"
                          logoTile
                          logoCdn={c.logoCdn}
                          logoPlaylist={c.logoPlaylist}
                          logoPlaceholder={c.logoPlaceholder}
                          onClick={() => handleChannelClick(c)}
                        />
                      ))}
                    </MediaRow>
                  </div>
                )}

                {classifiedSports && classifiedSports.lutas.length > 0 && (
                  <div id="row-lutas">
                    <MediaRow title="Lutas & UFC">
                      {classifiedSports.lutas.map((c) => (
                        <MediaCard
                          key={c.id}
                          id={c.id}
                          title={c.name}
                          imageUrl={c.logo || ''}
                          aspectRatio="landscape"
                          logoTile
                          logoCdn={c.logoCdn}
                          logoPlaylist={c.logoPlaylist}
                          logoPlaceholder={c.logoPlaceholder}
                          onClick={() => handleChannelClick(c)}
                        />
                      ))}
                    </MediaRow>
                  </div>
                )}

                {classifiedSports && classifiedSports.velocidade.length > 0 && (
                  <div id="row-velocidade">
                    <MediaRow title="Velocidade & Motores">
                      {classifiedSports.velocidade.map((c) => (
                        <MediaCard
                          key={c.id}
                          id={c.id}
                          title={c.name}
                          imageUrl={c.logo || ''}
                          aspectRatio="landscape"
                          logoTile
                          logoCdn={c.logoCdn}
                          logoPlaylist={c.logoPlaylist}
                          logoPlaceholder={c.logoPlaceholder}
                          onClick={() => handleChannelClick(c)}
                        />
                      ))}
                    </MediaRow>
                  </div>
                )}

                {classifiedSports && classifiedSports.americanos.length > 0 && (
                  <div id="row-americanos">
                    <MediaRow title="Esportes Americanos">
                      {classifiedSports.americanos.map((c) => (
                        <MediaCard
                          key={c.id}
                          id={c.id}
                          title={c.name}
                          imageUrl={c.logo || ''}
                          aspectRatio="landscape"
                          logoTile
                          logoCdn={c.logoCdn}
                          logoPlaylist={c.logoPlaylist}
                          logoPlaceholder={c.logoPlaceholder}
                          onClick={() => handleChannelClick(c)}
                        />
                      ))}
                    </MediaRow>
                  </div>
                )}

                {classifiedSports && classifiedSports.geral.length > 0 && (
                  <div id="row-geral">
                    <MediaRow title="Canais de Esporte Gerais">
                      {classifiedSports.geral.map((c) => (
                        <MediaCard
                          key={c.id}
                          id={c.id}
                          title={c.name}
                          imageUrl={c.logo || ''}
                          aspectRatio="landscape"
                          logoTile
                          logoCdn={c.logoCdn}
                          logoPlaylist={c.logoPlaylist}
                          logoPlaceholder={c.logoPlaceholder}
                          onClick={() => handleChannelClick(c)}
                        />
                      ))}
                    </MediaRow>
                  </div>
                )}
              </>
            ) : (
              sortedCategories.map((cat) => {
                const catChannels = liveChannels
                  .filter((c) => c.categoryId === cat.id)
                  .filter((c) => {
                    if (filter === 'all') return true
                    const isChSport = checkIsSport(c.name, cat.name)
                    return !isChSport
                  })
                  .slice(0, 15)

                if (catChannels.length === 0) return null
                return (
                  <MediaRow key={cat.id} title={cat.name}>
                    {catChannels.map((c) => (
                      <MediaCard
                        key={c.id}
                        id={c.id}
                        title={c.name}
                        imageUrl={c.logo || ''}
                        aspectRatio="landscape"
                        logoTile
                        logoCdn={c.logoCdn}
                        logoPlaylist={c.logoPlaylist}
                        logoPlaceholder={c.logoPlaceholder}
                        onClick={() => handleChannelClick(c)}
                      />
                    ))}
                  </MediaRow>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
