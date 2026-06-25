import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore, shouldShowChannel } from '../store'
import { moveFocus, focusFirst, useRemote } from '../hooks/useRemote'
import { useMainReturnPoint } from '../hooks/useMainReturnPoint'
import { getSportsCalendar, type SportsCalendarEvent } from '../api/arelonProxy'
import { getChannelDisplayName } from '../lib/logoResolver'
import { setTransitioningToFullscreenUrl } from '../lib/playback'
import { unlockAudio } from '../lib/tvSound'
import type { Channel } from '../store'
import '../components/WorldCupScreen.css'

// ─── Copa do Mundo FIFA 2026 — Dados do Calendário ─────────────────────────
// O torneio acontece nos EUA, México e Canadá de 11 de junho a 19 de julho de 2026.
// 48 seleções divididas em 12 grupos (A–L) de 4 times cada.

interface WorldCupMatch {
  id: string
  date: string        // YYYY-MM-DD
  time: string        // HH:mm (horário de Brasília)
  teamA: string
  teamB: string
  flagA: string       // emoji bandeira
  flagB: string
  group: string       // ex: "Grupo A"
  phase: string       // 'groups' | 'round16' | 'quarter' | 'semi' | 'third' | 'final'
  phaseLabel: string
  venue: string
  city: string
  broadcasts: string[] // canais que transmitem
}

// Mapeamento de canais de transmissão da Copa no Brasil
const WORLD_CUP_BROADCASTERS: Record<string, string[]> = {
  'Globo': ['globo'],
  'SporTV': ['sportv'],
  'SporTV 2': ['sportv 2', 'sportv2'],
  'SporTV 3': ['sportv 3', 'sportv3'],
  'CazéTV': ['cazetv', 'cazé'],
  'Globoplay': ['globoplay'],
  'FIFA+': ['fifa'],
  'Band': ['band'],
  'BandSports': ['bandsports', 'band sports'],
}

// Calendário da fase de grupos — primeiros jogos (amostra representativa)
const WORLD_CUP_MATCHES: WorldCupMatch[] = [
  // ─── Fase de Grupos — Rodada 1 ───
  // 11 de Junho (Jogo de Abertura)
  { id: 'wc01', date: '2026-06-11', time: '17:00', teamA: 'México', teamB: 'A definir', flagA: '🇲🇽', flagB: '🏳️', group: 'Grupo A', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'Estadio Azteca', city: 'Cidade do México', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },

  // 12 de Junho
  { id: 'wc02', date: '2026-06-12', time: '13:00', teamA: 'EUA', teamB: 'A definir', flagA: '🇺🇸', flagB: '🏳️', group: 'Grupo B', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'SoFi Stadium', city: 'Los Angeles', broadcasts: ['Globo', 'SporTV'] },
  { id: 'wc03', date: '2026-06-12', time: '16:00', teamA: 'Argentina', teamB: 'A definir', flagA: '🇦🇷', flagB: '🏳️', group: 'Grupo C', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'Hard Rock Stadium', city: 'Miami', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },
  { id: 'wc04', date: '2026-06-12', time: '19:00', teamA: 'Canadá', teamB: 'A definir', flagA: '🇨🇦', flagB: '🏳️', group: 'Grupo D', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'BC Place', city: 'Vancouver', broadcasts: ['SporTV'] },

  // 13 de Junho
  { id: 'wc05', date: '2026-06-13', time: '13:00', teamA: 'Brasil', teamB: 'A definir', flagA: '🇧🇷', flagB: '🏳️', group: 'Grupo E', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'AT&T Stadium', city: 'Dallas', broadcasts: ['Globo', 'SporTV', 'CazéTV', 'Globoplay'] },
  { id: 'wc06', date: '2026-06-13', time: '16:00', teamA: 'Alemanha', teamB: 'A definir', flagA: '🇩🇪', flagB: '🏳️', group: 'Grupo F', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'Lincoln Financial Field', city: 'Filadélfia', broadcasts: ['SporTV', 'CazéTV'] },
  { id: 'wc07', date: '2026-06-13', time: '19:00', teamA: 'França', teamB: 'A definir', flagA: '🇫🇷', flagB: '🏳️', group: 'Grupo G', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'MetLife Stadium', city: 'Nova York', broadcasts: ['Globo', 'SporTV'] },

  // 14 de Junho
  { id: 'wc08', date: '2026-06-14', time: '13:00', teamA: 'Espanha', teamB: 'A definir', flagA: '🇪🇸', flagB: '🏳️', group: 'Grupo H', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'Mercedes-Benz Stadium', city: 'Atlanta', broadcasts: ['SporTV'] },
  { id: 'wc09', date: '2026-06-14', time: '16:00', teamA: 'Portugal', teamB: 'A definir', flagA: '🇵🇹', flagB: '🏳️', group: 'Grupo I', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'Lumen Field', city: 'Seattle', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },
  { id: 'wc10', date: '2026-06-14', time: '19:00', teamA: 'Inglaterra', teamB: 'A definir', flagA: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', flagB: '🏳️', group: 'Grupo J', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'Gillette Stadium', city: 'Boston', broadcasts: ['SporTV'] },

  // 15 de Junho
  { id: 'wc11', date: '2026-06-15', time: '13:00', teamA: 'Itália', teamB: 'A definir', flagA: '🇮🇹', flagB: '🏳️', group: 'Grupo K', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'NRG Stadium', city: 'Houston', broadcasts: ['SporTV', 'CazéTV'] },
  { id: 'wc12', date: '2026-06-15', time: '16:00', teamA: 'Países Baixos', teamB: 'A definir', flagA: '🇳🇱', flagB: '🏳️', group: 'Grupo L', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'Arrowhead Stadium', city: 'Kansas City', broadcasts: ['SporTV'] },

  // Rodada 2 — Brasil
  { id: 'wc13', date: '2026-06-17', time: '16:00', teamA: 'Brasil', teamB: 'A definir', flagA: '🇧🇷', flagB: '🏳️', group: 'Grupo E', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'AT&T Stadium', city: 'Dallas', broadcasts: ['Globo', 'SporTV', 'CazéTV', 'Globoplay'] },

  // Rodada 3 — Brasil
  { id: 'wc14', date: '2026-06-21', time: '16:00', teamA: 'Brasil', teamB: 'A definir', flagA: '🇧🇷', flagB: '🏳️', group: 'Grupo E', phase: 'groups', phaseLabel: 'Fase de Grupos', venue: 'AT&T Stadium', city: 'Dallas', broadcasts: ['Globo', 'SporTV', 'CazéTV', 'Globoplay'] },

  // ─── Oitavas de Final ───
  { id: 'wc-r16-01', date: '2026-06-28', time: '13:00', teamA: '1º Grupo A', teamB: '2º Grupo B', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 49', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },
  { id: 'wc-r16-02', date: '2026-06-28', time: '16:00', teamA: '1º Grupo C', teamB: '2º Grupo D', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 50', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV'] },
  { id: 'wc-r16-03', date: '2026-06-29', time: '13:00', teamA: '1º Grupo E', teamB: '2º Grupo F', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 51', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },
  { id: 'wc-r16-04', date: '2026-06-29', time: '16:00', teamA: '1º Grupo G', teamB: '2º Grupo H', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 52', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['SporTV', 'CazéTV'] },
  { id: 'wc-r16-05', date: '2026-06-30', time: '13:00', teamA: '1º Grupo B', teamB: '2º Grupo A', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 53', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV'] },
  { id: 'wc-r16-06', date: '2026-06-30', time: '16:00', teamA: '1º Grupo D', teamB: '2º Grupo C', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 54', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['SporTV', 'CazéTV'] },
  { id: 'wc-r16-07', date: '2026-07-01', time: '13:00', teamA: '1º Grupo F', teamB: '2º Grupo E', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 55', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },
  { id: 'wc-r16-08', date: '2026-07-01', time: '16:00', teamA: '1º Grupo H', teamB: '2º Grupo G', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 56', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['SporTV'] },

  // 8 jogos adicionais de oitavas (para os 16 jogos no total)
  { id: 'wc-r16-09', date: '2026-07-02', time: '13:00', teamA: '1º Grupo I', teamB: '2º Grupo J', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 57', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV'] },
  { id: 'wc-r16-10', date: '2026-07-02', time: '16:00', teamA: '1º Grupo K', teamB: '2º Grupo L', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 58', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['SporTV', 'CazéTV'] },
  { id: 'wc-r16-11', date: '2026-07-03', time: '13:00', teamA: '1º Grupo J', teamB: '2º Grupo I', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 59', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV'] },
  { id: 'wc-r16-12', date: '2026-07-03', time: '16:00', teamA: '1º Grupo L', teamB: '2º Grupo K', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 60', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['SporTV'] },
  { id: 'wc-r16-13', date: '2026-07-04', time: '13:00', teamA: '3º Melhor A/B/C', teamB: '1º/2º TBD', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 61', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['SporTV', 'CazéTV'] },
  { id: 'wc-r16-14', date: '2026-07-04', time: '16:00', teamA: '3º Melhor D/E/F', teamB: '1º/2º TBD', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 62', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV'] },
  { id: 'wc-r16-15', date: '2026-07-05', time: '13:00', teamA: '3º Melhor G/H/I', teamB: '1º/2º TBD', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 63', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['SporTV'] },
  { id: 'wc-r16-16', date: '2026-07-05', time: '16:00', teamA: '3º Melhor J/K/L', teamB: '1º/2º TBD', flagA: '🏳️', flagB: '🏳️', group: 'Jogo 64', phase: 'round16', phaseLabel: 'Oitavas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },

  // ─── Quartas de Final ───
  { id: 'wc-qf-01', date: '2026-07-09', time: '13:00', teamA: 'Vencedor Jogo 49', teamB: 'Vencedor Jogo 50', flagA: '🏳️', flagB: '🏳️', group: 'Quartas 1', phase: 'quarter', phaseLabel: 'Quartas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },
  { id: 'wc-qf-02', date: '2026-07-09', time: '17:00', teamA: 'Vencedor Jogo 53', teamB: 'Vencedor Jogo 54', flagA: '🏳️', flagB: '🏳️', group: 'Quartas 2', phase: 'quarter', phaseLabel: 'Quartas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },
  { id: 'wc-qf-03', date: '2026-07-10', time: '13:00', teamA: 'Vencedor Jogo 51', teamB: 'Vencedor Jogo 52', flagA: '🏳️', flagB: '🏳️', group: 'Quartas 3', phase: 'quarter', phaseLabel: 'Quartas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV'] },
  { id: 'wc-qf-04', date: '2026-07-10', time: '17:00', teamA: 'Vencedor Jogo 55', teamB: 'Vencedor Jogo 56', flagA: '🏳️', flagB: '🏳️', group: 'Quartas 4', phase: 'quarter', phaseLabel: 'Quartas de Final', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },

  // ─── Semifinais ───
  { id: 'wc-sf-01', date: '2026-07-14', time: '17:00', teamA: 'Vencedor QF1', teamB: 'Vencedor QF2', flagA: '🏳️', flagB: '🏳️', group: 'Semifinal 1', phase: 'semi', phaseLabel: 'Semifinal', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV', 'CazéTV', 'Globoplay'] },
  { id: 'wc-sf-02', date: '2026-07-15', time: '17:00', teamA: 'Vencedor QF3', teamB: 'Vencedor QF4', flagA: '🏳️', flagB: '🏳️', group: 'Semifinal 2', phase: 'semi', phaseLabel: 'Semifinal', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV', 'CazéTV', 'Globoplay'] },

  // ─── Disputa de 3º lugar ───
  { id: 'wc-3rd', date: '2026-07-18', time: '17:00', teamA: 'Perdedor SF1', teamB: 'Perdedor SF2', flagA: '🏳️', flagB: '🏳️', group: 'Disputa 3º Lugar', phase: 'third', phaseLabel: 'Disputa 3º Lugar', venue: 'A definir', city: 'A definir', broadcasts: ['Globo', 'SporTV', 'CazéTV'] },

  // ─── Final ───
  { id: 'wc-final', date: '2026-07-19', time: '17:00', teamA: 'Vencedor SF1', teamB: 'Vencedor SF2', flagA: '🏳️', flagB: '🏳️', group: 'Grande Final', phase: 'final', phaseLabel: 'Final', venue: 'MetLife Stadium', city: 'Nova York', broadcasts: ['Globo', 'SporTV', 'CazéTV', 'Globoplay', 'FIFA+'] },
]

const PHASE_FILTERS = [
  { id: 'all', label: 'Todos os Jogos' },
  { id: 'groups', label: 'Fase de Grupos' },
  { id: 'round16', label: 'Oitavas de Final' },
  { id: 'quarter', label: 'Quartas de Final' },
  { id: 'semi', label: 'Semifinais' },
  { id: 'final', label: 'Final' },
]

function formatDateLabel(dateStr: string): { label: string; weekday: string; isToday: boolean; isTomorrow: boolean } {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)

  const isToday = d.toDateString() === today.toDateString()
  const isTomorrow = d.toDateString() === tomorrow.toDateString()

  const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' })

  return { label, weekday, isToday, isTomorrow }
}

function getCountdown(targetDate: string): { days: number; hours: number; minutes: number } | null {
  const target = new Date(targetDate + 'T17:00:00-03:00')
  const now = new Date()
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) return null

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return { days, hours, minutes }
}

export function WorldCupScreen() {
  const server = useStore((s) => s.server)!
  const liveChannels = useStore((s) => s.liveChannels)
  const selectedState = useStore((s) => s.selectedState)
  const setCurrentMedia = useStore((s) => s.setCurrentMedia)
  const setScreen = useStore((s) => s.setScreen)
  const pageRef = useRef<HTMLDivElement>(null)
  const rememberReturnPoint = useMainReturnPoint('worldcup', pageRef)
  const [activePhase, setActivePhase] = useState('all')
  const [sportsCalendarEvents, setSportsCalendarEvents] = useState<SportsCalendarEvent[]>([])
  const [countdown, setCountdown] = useState(getCountdown('2026-06-11'))

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(getCountdown('2026-06-11'))
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  // Fetch sports calendar for enriched live data
  useEffect(() => {
    let cancelled = false
    getSportsCalendar({ days: 60, limit: 100 })
      .then((result) => {
        if (!cancelled) setSportsCalendarEvents(result.items)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useRemote((cmd, type) => {
    if (type !== 'keydown' && type !== 'tizenhwkey') return
    if (cmd === 'BACK') {
      unlockAudio()
      const cur = document.activeElement as HTMLElement | null
      if (cur?.closest('.arelon-topbar')) {
        setScreen('home')
      } else {
        const layout = pageRef.current?.closest<HTMLElement>('.app-layout')
        layout?.scrollTo({ top: 0, behavior: 'auto' })
        requestAnimationFrame(() => {
          const nav = document.querySelector<HTMLElement>('.arelon-topnav-item--active[data-focusable="true"]')
          nav?.focus()
        })
      }
    } else if (cmd === 'UP') moveFocus('UP')
    else if (cmd === 'DOWN') moveFocus('DOWN')
    else if (cmd === 'LEFT') moveFocus('LEFT')
    else if (cmd === 'RIGHT') moveFocus('RIGHT')
    else if (cmd === 'ENTER') (document.activeElement as HTMLElement)?.click()
  })

  // Filter channels visible in the user's state
  const filteredChannels = useMemo(
    () => liveChannels.filter((c) => shouldShowChannel(c.name, selectedState)),
    [liveChannels, selectedState],
  )

  // Encontrar canal de TV correspondente ao nome do broadcast
  const findBroadcastChannel = useCallback((broadcastName: string): Channel | undefined => {
    const keywords = WORLD_CUP_BROADCASTERS[broadcastName]
    if (!keywords) return undefined

    return filteredChannels.find((ch) => {
      const chLower = ch.name.toLowerCase()
      return keywords.some((kw) => chLower.includes(kw))
    })
  }, [filteredChannels])

  function playChannel(ch: Channel) {
    rememberReturnPoint()
    setTransitioningToFullscreenUrl(ch.streamUrl)
    setCurrentMedia({
      id: ch.id,
      title: getChannelDisplayName(ch.name),
      url: ch.streamUrl,
      type: 'live',
      poster: ch.logo,
      isLive: true,
      assignedServer: server.activeServer,
      streams: ch.streams,
    })
  }

  function handleBroadcastClick(broadcastName: string) {
    const channel = findBroadcastChannel(broadcastName)
    if (channel) {
      playChannel(channel)
    }
  }

  // Enrich matches with live data from sports calendar API
  const enrichedMatches = useMemo(() => {
    return WORLD_CUP_MATCHES.map((match) => {
      // Try to find a matching event from the live sports calendar
      const calendarEvent = sportsCalendarEvents.find((event) => {
        const eventDate = new Date(event.startTime)
        const matchDate = new Date(`${match.date}T${match.time}:00-03:00`)
        const timeDiff = Math.abs(eventDate.getTime() - matchDate.getTime())
        // Match if within 2 hours and names overlap
        if (timeDiff > 2 * 60 * 60 * 1000) return false
        const eventName = event.name.toLowerCase()
        return eventName.includes(match.teamA.toLowerCase()) || eventName.includes(match.teamB.toLowerCase())
      })

      return {
        ...match,
        liveStatus: calendarEvent?.status ?? 'scheduled' as const,
        liveStatusLabel: calendarEvent?.statusLabel,
        liveBroadcasts: calendarEvent?.broadcasts ?? match.broadcasts,
      }
    })
  }, [sportsCalendarEvents])

  // Filter by phase
  const filteredMatches = activePhase === 'all'
    ? enrichedMatches
    : enrichedMatches.filter((m) => m.phase === activePhase || (activePhase === 'final' && (m.phase === 'final' || m.phase === 'third')))

  // Group by date
  const matchesByDate = useMemo(() => {
    const map = new Map<string, typeof filteredMatches>()
    for (const match of filteredMatches) {
      const existing = map.get(match.date) ?? []
      existing.push(match)
      map.set(match.date, existing)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredMatches])

  // Collect unique broadcast channels that appear in the copa
  const broadcastChannels = useMemo(() => {
    const names = new Set<string>()
    for (const match of WORLD_CUP_MATCHES) {
      for (const b of match.broadcasts) names.add(b)
    }
    return Array.from(names)
      .map((name) => ({ name, channel: findBroadcastChannel(name) }))
      .filter((item) => item.channel)
  }, [findBroadcastChannel])

  // Mount focus
  useEffect(() => {
    const timer = setTimeout(() => {
      focusFirst(pageRef.current)
    }, 150)
    return () => clearTimeout(timer)
  }, [])

  // Trophy SVG
  const trophySvg = (
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M20 8h24v4a12 12 0 0 1-24 0V8z" fill="#d4af37" />
      <path d="M22 8V6h20v2H22z" fill="#f0d060" />
      <path d="M32 24v8" stroke="#d4af37" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 32h16v4H24z" fill="#d4af37" rx="2" />
      <path d="M20 36h24v4H20z" fill="#f0d060" rx="2" />
      <path d="M18 40h28v4a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2v-4z" fill="#d4af37" />
      <path d="M44 8c4 0 8 2 8 8s-4 8-8 8" stroke="#f0d060" strokeWidth="2.5" fill="none" />
      <path d="M20 8c-4 0-8 2-8 8s4 8 8 8" stroke="#f0d060" strokeWidth="2.5" fill="none" />
      <circle cx="32" cy="16" r="4" fill="#fff" opacity="0.2" />
    </svg>
  )

  return (
    <div className="home-page worldcup-page" ref={pageRef}>
      <div className="home-content">
        {/* Hero Banner */}
        <div className="worldcup-hero">
          <div className="worldcup-hero-trophy">
            {trophySvg}
          </div>
          <div className="worldcup-hero-info">
            <h1 className="worldcup-hero-title">
              Copa do Mundo <span>FIFA 2026</span>
            </h1>
            <p className="worldcup-hero-subtitle">
              EUA • México • Canadá — 11 de junho a 19 de julho
            </p>
            <div className="worldcup-hero-meta">
              <div className="worldcup-hero-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" /></svg>
                48 Seleções
              </div>
              <div className="worldcup-hero-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                104 Jogos
              </div>
              <div className="worldcup-hero-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="2" /><polyline points="17 2 12 7 7 2" /></svg>
                16 Estádios
              </div>
              {countdown && (
                <div className="worldcup-countdown">
                  <div className="worldcup-countdown-block">
                    <span className="worldcup-countdown-value">{countdown.days}</span>
                    <span className="worldcup-countdown-label">dias</span>
                  </div>
                  <span className="worldcup-countdown-sep">:</span>
                  <div className="worldcup-countdown-block">
                    <span className="worldcup-countdown-value">{String(countdown.hours).padStart(2, '0')}</span>
                    <span className="worldcup-countdown-label">horas</span>
                  </div>
                  <span className="worldcup-countdown-sep">:</span>
                  <div className="worldcup-countdown-block">
                    <span className="worldcup-countdown-value">{String(countdown.minutes).padStart(2, '0')}</span>
                    <span className="worldcup-countdown-label">min</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="worldcup-content">
          {/* Phase filter tabs */}
          <div className="worldcup-phase-tabs arelon-sport-shortcuts">
            {PHASE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                className={`worldcup-phase-tab ${activePhase === filter.id ? 'worldcup-phase-tab--active' : ''}`}
                data-focusable="true"
                onClick={() => setActivePhase(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Matches grouped by date */}
          {matchesByDate.length === 0 ? (
            <div className="worldcup-empty">
              <svg className="worldcup-empty-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="32" cy="32" r="28" />
                <path d="M32 20v14l10 6" />
              </svg>
              <span className="worldcup-empty-text">Nenhum jogo encontrado nesta fase.</span>
            </div>
          ) : (
            matchesByDate.map(([date, matches]) => {
              const dateInfo = formatDateLabel(date)
              return (
                <div key={date} className="worldcup-date-group">
                  <div className="worldcup-date-header">
                    <span className="worldcup-date-label">{dateInfo.label}</span>
                    <span className="worldcup-date-weekday">{dateInfo.weekday}</span>
                    {dateInfo.isToday && <span className="worldcup-date-today">Hoje</span>}
                    {dateInfo.isTomorrow && <span className="worldcup-date-today">Amanhã</span>}
                  </div>

                  <div className="worldcup-matches-row media-row">
                    {matches.map((match) => {
                      const isLive = match.liveStatus === 'live'
                      return (
                        <button
                          key={match.id}
                          className="worldcup-match-card"
                          data-focusable="true"
                          onClick={() => {
                            // Try to open the first available broadcasting channel
                            const broadcastName = match.liveBroadcasts[0]
                            if (broadcastName) handleBroadcastClick(broadcastName)
                          }}
                        >
                          <div className={`worldcup-match-card__stripe ${isLive ? 'worldcup-match-card__stripe--live' : ''}`} />
                          {isLive && (
                            <div className="worldcup-live-indicator">
                              <span className="worldcup-live-dot" />
                              AO VIVO
                            </div>
                          )}
                          <div className="worldcup-match-card__body">
                            <div className="worldcup-match-card__header">
                              <span className="worldcup-match-card__group">{match.group} • {match.phaseLabel}</span>
                              <span className={`worldcup-match-card__time ${isLive ? 'worldcup-match-card__time--live' : ''}`}>
                                {match.time}h
                              </span>
                            </div>

                            <div className="worldcup-match-card__teams">
                              <div className="worldcup-match-card__team">
                                <span className="worldcup-match-card__flag" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', background: 'none', border: 'none' }}>
                                  {match.flagA}
                                </span>
                                <span className="worldcup-match-card__team-name">{match.teamA}</span>
                              </div>
                              <span className="worldcup-match-card__vs">VS</span>
                              <div className="worldcup-match-card__team">
                                <span className="worldcup-match-card__flag" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', background: 'none', border: 'none' }}>
                                  {match.flagB}
                                </span>
                                <span className="worldcup-match-card__team-name">{match.teamB}</span>
                              </div>
                            </div>

                            {match.venue !== 'A definir' && (
                              <div className="worldcup-match-card__venue">
                                📍 {match.venue} — {match.city}
                              </div>
                            )}

                            <div className="worldcup-match-card__broadcasts">
                              <span className="worldcup-match-card__broadcasts-label">Transmissão:</span>
                              {match.liveBroadcasts.map((b) => {
                                const channel = findBroadcastChannel(b)
                                return (
                                  <span
                                    key={b}
                                    className="worldcup-broadcast-chip"
                                    style={channel ? { cursor: 'pointer' } : { opacity: 0.5 }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (channel) {
                                        handleBroadcastClick(b)
                                      }
                                    }}
                                  >
                                    {channel && (
                                      <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                                        <polygon points="5,3 13,8 5,13" />
                                      </svg>
                                    )}
                                    {b}
                                  </span>
                                )
                              })}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}

          {/* Available broadcast channels */}
          {broadcastChannels.length > 0 && (
            <div className="worldcup-channels-section">
              <h2 className="worldcup-channels-title">Canais com transmissão da Copa</h2>
              <div className="worldcup-matches-row media-row">
                {broadcastChannels.map(({ name, channel }) => {
                  if (!channel) return null
                  return (
                    <button
                      key={name}
                      className="worldcup-match-card"
                      style={{ width: 260 }}
                      data-focusable="true"
                      onClick={() => playChannel(channel)}
                    >
                      <div className="worldcup-match-card__stripe" />
                      <div className="worldcup-match-card__body" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 20px' }}>
                        <div style={{ fontSize: '42px', marginBottom: '4px' }}>📺</div>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', fontFamily: "'Outfit', 'Inter', sans-serif" }}>
                          {name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
                          Assistir agora
                        </div>
                        <div style={{ marginTop: '8px' }}>
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="#ff00ff">
                            <polygon points="8,5 19,12 8,19" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
