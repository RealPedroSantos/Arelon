import { useCallback, useEffect, useMemo, useState } from 'react'
import { NEWSMETER_CONSENT_KEY } from '../lib/audienceTelemetry'
import './NewsMeterDashboard.css'

type TabKey =
  | 'overview'
  | 'live'
  | 'ranking'
  | 'channels'
  | 'programs'
  | 'migration'
  | 'retention'
  | 'technical'
  | 'history'
  | 'reports'
  | 'settings'

type RankingRow = {
  position: number
  channel_id: string
  canonical_key: string
  channel_name: string
  logo_url?: string | null
  program_id?: string | null
  program_title?: string | null
  active_viewers: number
  share: number
  internal_rating: number
  variation_5m: number
  average_watch_time: number
  stream_state: 'normal' | 'buffering_high' | 'unavailable' | 'unknown'
  epg_available: boolean
}

type LivePayload = {
  summary: {
    active_viewers_now: number
    total_news_viewers: number
    leader: string | null
    leader_share: number
    day_peak: number
    sessions_today: number
    generated_at: string
  }
  ranking: RankingRow[]
  trend: Array<{ minute_timestamp: string; channel_id: string; channel_name: string; active_viewers: number; share: number }>
  platforms: Array<{ label: string; value: number }>
  versions: Array<{ label: string; value: number }>
}

type HistoryRow = {
  minute_timestamp: string
  channel_id: string
  channel_name?: string
  active_viewers: number
  unique_viewers: number
  valid_watch_seconds: number
  sessions_started: number
  sessions_ended: number
  channel_entries: number
  channel_exits: number
  average_watch_time: number
  buffering_seconds: number
  playback_errors: number
  share: number
  internal_rating: number
  peak_concurrent: number
}

type TransitionRow = {
  from_channel_id: string
  from_channel_name: string
  to_channel_id: string
  to_channel_name: string
  transition_count: number
}

type TechnicalRow = {
  channel_id: string
  channel_name: string
  attempts: number
  starts: number
  startup_failures: number
  first_frame_ms: number
  buffering_count: number
  buffering_seconds: number
  error_rate: number
  stream_drops: number
  sessions_ended_by_error: number
  health_index: number
  status: string
}

type ChannelMapping = {
  id: string
  canonical_key: string
  name: string
  country: string
  language: string
  category: string
  logo_url?: string | null
  stream_id?: string | null
  epg_channel_id?: string | null
  source_provider?: string | null
  is_active: boolean
  streams?: Array<{
    id: string
    external_stream_id: string
    source_provider?: string | null
    stream_url?: string | null
    is_authorized: boolean
    is_active: boolean
  }>
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Visão geral' },
  { key: 'live', label: 'Audiência ao vivo' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'channels', label: 'Canais' },
  { key: 'programs', label: 'Programas' },
  { key: 'migration', label: 'Migração' },
  { key: 'retention', label: 'Retenção' },
  { key: 'technical', label: 'Qualidade técnica' },
  { key: 'history', label: 'Histórico' },
  { key: 'reports', label: 'Relatórios' },
  { key: 'settings', label: 'Configurações' },
]

const ranges = [
  { value: '15m', label: 'Últimos 15 minutos' },
  { value: '1h', label: 'Última hora' },
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
]

function number(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value || 0)
}

function percent(value: number): string {
  return `${number(value || 0, 2)}%`
}

function duration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds || 0))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remaining = safe % 60
  return hours > 0
    ? `${hours}h ${minutes.toString().padStart(2, '0')}m`
    : `${minutes}m ${remaining.toString().padStart(2, '0')}s`
}

function statusLabel(row: RankingRow): string {
  if (row.stream_state === 'unavailable') return 'Stream indisponível'
  if (row.stream_state === 'buffering_high') return 'Buffering elevado'
  if (!row.epg_available) return 'EPG indisponível'
  return 'Stream normal'
}

function trendLabel(value: number): string {
  if (value > 1) return 'Subindo'
  if (value < -1) return 'Caindo'
  return 'Estável'
}

function LineChart({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <div className="nm-empty">Sem dados suficientes para o gráfico.</div>
  const width = 760
  const height = 220
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(1, max - min)
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - min) / span) * (height - 28) - 14
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div className="nm-chart" aria-label={label}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="4" />
      </svg>
      <div className="nm-chart__scale"><span>{number(max)}</span><span>{number(min)}</span></div>
    </div>
  )
}

function Bars({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  if (rows.length === 0) return <div className="nm-empty">Nenhum dado disponível.</div>
  return (
    <div className="nm-bars">
      {rows.slice(0, 10).map((row) => (
        <div className="nm-bar" key={row.label}>
          <span>{row.label}</span>
          <div><i style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} /></div>
          <strong>{number(row.value)}</strong>
        </div>
      ))}
    </div>
  )
}

function Empty({ children = 'Nenhum dado real disponível para este período.' }: { children?: string }) {
  return <div className="nm-empty">{children}</div>
}

export function NewsMeterDashboard({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [range, setRange] = useState('1h')
  const [token, setToken] = useState(() => sessionStorage.getItem('newsmeter-admin-token') || '')
  const [tokenDraft, setTokenDraft] = useState(token)
  const [live, setLive] = useState<LivePayload | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [transitions, setTransitions] = useState<TransitionRow[]>([])
  const [technical, setTechnical] = useState<TechnicalRow[]>([])
  const [channels, setChannels] = useState<ChannelMapping[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const apiFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      cache: 'no-store',
    })
    if (response.status === 401 || response.status === 403) throw new Error('Token administrativo inválido ou não configurado.')
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(payload.error || `Falha HTTP ${response.status}`)
    }
    return response
  }, [token])

  const loadLive = useCallback(async (silent = false) => {
    if (!token) return
    if (!silent) setLoading(true)
    try {
      const response = await apiFetch('/api/audience/live')
      const payload = await response.json() as LivePayload
      setLive(payload)
      setLastUpdated(new Date())
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a audiência ao vivo.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [apiFetch, token])

  const loadAnalyticalData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [historyResponse, transitionsResponse, technicalResponse, channelsResponse] = await Promise.all([
        apiFetch(`/api/audience/history?range=${encodeURIComponent(range)}`),
        apiFetch(`/api/audience/transitions?range=${encodeURIComponent(range)}`),
        apiFetch(`/api/audience/technical-health?range=${encodeURIComponent(range)}`),
        apiFetch('/api/admin/channels'),
      ])
      const [historyPayload, transitionsPayload, technicalPayload, channelsPayload] = await Promise.all([
        historyResponse.json(),
        transitionsResponse.json(),
        technicalResponse.json(),
        channelsResponse.json(),
      ]) as [
        { data: HistoryRow[] },
        { data: TransitionRow[] },
        { data: TechnicalRow[] },
        { data: ChannelMapping[] },
      ]
      setHistory(historyPayload.data || [])
      setTransitions(transitionsPayload.data || [])
      setTechnical(technicalPayload.data || [])
      setChannels(channelsPayload.data || [])
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar dados analíticos.')
    } finally {
      setLoading(false)
    }
  }, [apiFetch, range, token])

  useEffect(() => {
    if (!token) return
    void loadLive()
    void loadAnalyticalData()
    const interval = window.setInterval(() => void loadLive(true), 5_000)
    return () => window.clearInterval(interval)
  }, [loadAnalyticalData, loadLive, token])

  const summary = live?.summary || {
    active_viewers_now: 0,
    total_news_viewers: 0,
    leader: null,
    leader_share: 0,
    day_peak: 0,
    sessions_today: 0,
    generated_at: '',
  }

  const audienceSeries = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const row of history) grouped.set(row.minute_timestamp, (grouped.get(row.minute_timestamp) || 0) + row.active_viewers)
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
  }, [history])

  const shareBars = useMemo(() => (live?.ranking || []).map((row) => ({ label: row.channel_name, value: row.share })), [live])
  const entryExitBars = useMemo(() => history.slice(-12).map((row) => ({
    label: new Date(row.minute_timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    value: row.channel_entries - row.channel_exits,
  })), [history])

  const retention = useMemo(() => {
    const total = history.reduce((sum, row) => sum + row.sessions_started, 0)
    if (total === 0) return []
    return [60, 300, 900, 1800, 3600].map((threshold) => {
      const eligible = history.reduce((sum, row) => sum + (row.average_watch_time >= threshold ? row.sessions_started : 0), 0)
      return { label: threshold < 3600 ? `${threshold / 60} min` : '60 min', value: (eligible / total) * 100 }
    })
  }, [history])

  const downloadExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    try {
      const response = await apiFetch(`/api/audience/export?format=${format}&range=${encodeURIComponent(range)}`)
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') || ''
      const name = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `newsmeter-${range}.${format}`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao exportar relatório.')
    }
  }

  const validateMapping = async (channelId: string) => {
    try {
      const response = await apiFetch(`/api/admin/channels/${channelId}/validate-mapping`, { method: 'POST' })
      const payload = await response.json() as { valid: boolean; issues: string[] }
      setError(payload.valid ? 'Mapeamento validado: canal, stream e EPG estão consistentes.' : payload.issues.join(' '))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha na validação do mapeamento.')
    }
  }

  const runSimulation = async () => {
    try {
      await apiFetch('/api/audience/simulate', { method: 'POST', body: JSON.stringify({ viewers: 40, duration_minutes: 10 }) })
      setError('Simulação de desenvolvimento criada como sessão de teste.')
      await loadLive()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível executar a simulação.')
    }
  }

  if (!token) {
    return (
      <main className="newsmeter nm-auth">
        <section className="nm-auth__card">
          <div className="nm-eyebrow">NewsMeter Brasil</div>
          <h1>Painel interno de audiência</h1>
          <p>Informe o token administrativo configurado em <code>NEWSMETER_ADMIN_TOKEN</code>. O token fica somente nesta sessão do navegador.</p>
          <input type="password" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="Token administrativo" autoFocus />
          <div className="nm-auth__actions">
            <button onClick={onClose}>Voltar</button>
            <button className="primary" onClick={() => { const clean = tokenDraft.trim(); sessionStorage.setItem('newsmeter-admin-token', clean); setToken(clean) }}>Entrar</button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="newsmeter">
      <aside className="nm-sidebar">
        <div className="nm-brand"><span>NM</span><div><strong>NewsMeter</strong><small>Brasil · uso interno</small></div></div>
        <nav>{tabs.map((item) => <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>)}</nav>
        <button className="nm-exit" onClick={onClose}>Voltar ao Admin</button>
      </aside>

      <section className="nm-content">
        <header className="nm-topbar">
          <div><div className="nm-eyebrow">Medição exclusiva do aplicativo</div><h1>{tabs.find((item) => item.key === tab)?.label}</h1></div>
          <div className="nm-topbar__actions">
            <select value={range} onChange={(event) => setRange(event.target.value)}>{ranges.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <button onClick={() => { void loadLive(); void loadAnalyticalData() }}>Atualizar</button>
          </div>
        </header>

        <div className="nm-disclaimer">Os dados representam exclusivamente a utilização medida dentro deste aplicativo e não correspondem à audiência total da televisão brasileira.</div>
        {error && <div className="nm-message" role="status">{error}</div>}
        {loading && <div className="nm-loading">Carregando dados reais…</div>}

        {(tab === 'overview' || tab === 'live') && <>
          <section className="nm-kpis">
            <article><span>Espectadores ativos agora</span><strong>{number(summary.active_viewers_now)}</strong></article>
            <article><span>Total em canais de notícias</span><strong>{number(summary.total_news_viewers)}</strong></article>
            <article><span>Canal líder</span><strong className="text">{summary.leader || 'Sem audiência'}</strong></article>
            <article><span>Share do líder</span><strong>{percent(summary.leader_share)}</strong></article>
            <article><span>Pico do dia</span><strong>{number(summary.day_peak)}</strong></article>
            <article><span>Sessões do dia</span><strong>{number(summary.sessions_today)}</strong></article>
          </section>
          <section className="nm-grid nm-grid--two">
            <article className="nm-panel"><div className="nm-panel__title"><h2>Audiência simultânea por minuto</h2><small>{lastUpdated ? `Atualizado ${lastUpdated.toLocaleTimeString('pt-BR')}` : 'Aguardando dados'}</small></div><LineChart values={audienceSeries} label="Audiência simultânea por minuto" /></article>
            <article className="nm-panel"><div className="nm-panel__title"><h2>Share por canal</h2></div><Bars rows={shareBars} /></article>
          </section>
        </>}

        {(tab === 'live' || tab === 'ranking' || tab === 'overview') && <article className="nm-panel nm-ranking-panel">
          <div className="nm-panel__title"><h2>Ranking em tempo real</h2><small>Atualização automática a cada 5 segundos</small></div>
          {(live?.ranking || []).length === 0 ? <Empty /> : <div className="nm-table-wrap"><table>
            <thead><tr><th>#</th><th>Canal</th><th>Programa atual</th><th>Ativos</th><th>Share</th><th>Índice interno</th><th>5 min</th><th>Tempo médio</th><th>Estado</th></tr></thead>
            <tbody>{live!.ranking.map((row) => <tr key={row.channel_id}>
              <td>{row.position}</td>
              <td><div className="nm-channel"><img src={row.logo_url || '/assets/arelon/logo-arelon-padrao.png'} alt="" /><div><strong>{row.channel_name}</strong><small>{row.canonical_key}</small></div></div></td>
              <td>{row.program_title || 'EPG indisponível'}</td><td className="numeric">{number(row.active_viewers)}</td><td className="numeric">{percent(row.share)}</td><td className="numeric">{percent(row.internal_rating)}</td>
              <td><span className={`nm-trend ${row.variation_5m > 1 ? 'up' : row.variation_5m < -1 ? 'down' : ''}`}>{trendLabel(row.variation_5m)} {row.variation_5m ? percent(Math.abs(row.variation_5m)) : ''}</span></td>
              <td>{duration(row.average_watch_time)}</td><td><span className={`nm-status ${row.stream_state}`}>{statusLabel(row)}</span></td>
            </tr>)}</tbody>
          </table></div>}
        </article>}

        {tab === 'channels' && <article className="nm-panel">
          <div className="nm-panel__title"><div><h2>Mapeamento canônico</h2><small>Canal interno → stream → fonte → EPG → país → idioma</small></div></div>
          {channels.length === 0 ? <Empty /> : <div className="nm-table-wrap"><table>
            <thead><tr><th>Canal interno</th><th>Chave canônica</th><th>Stream</th><th>Fonte</th><th>EPG</th><th>País</th><th>Idioma</th><th>Estado</th><th /></tr></thead>
            <tbody>{channels.map((channel) => <tr key={channel.id}>
              <td>{channel.name}</td><td><code>{channel.canonical_key}</code></td><td>{channel.stream_id || channel.streams?.[0]?.external_stream_id || 'Não mapeado'}</td>
              <td>{channel.source_provider || channel.streams?.[0]?.source_provider || 'Não informada'}</td><td>{channel.epg_channel_id || 'Não mapeado'}</td><td>{channel.country}</td><td>{channel.language}</td>
              <td><span className={`nm-status ${channel.is_active ? 'normal' : 'unavailable'}`}>{channel.is_active ? 'Ativo' : 'Inativo'}</span></td><td><button onClick={() => void validateMapping(channel.id)}>Validar</button></td>
            </tr>)}</tbody>
          </table></div>}
        </article>}

        {tab === 'programs' && <article className="nm-panel"><div className="nm-panel__title"><h2>Programas mais assistidos</h2></div>{history.length === 0 ? <Empty>O EPG será associado por channel_id e intervalo de horário quando houver dados válidos.</Empty> : <p className="nm-copy">A API mantém <code>program_id</code> nulo quando o EPG não está disponível e permite reprocessamento posterior sem associar programas pelo título.</p>}</article>}

        {tab === 'migration' && <section className="nm-grid nm-grid--two">
          <article className="nm-panel"><div className="nm-panel__title"><h2>Matriz de troca de canais</h2></div>{transitions.length === 0 ? <Empty /> : <div className="nm-table-wrap"><table><thead><tr><th>Origem</th><th>Destino</th><th>Trocas</th></tr></thead><tbody>{transitions.map((row) => <tr key={`${row.from_channel_id}-${row.to_channel_id}`}><td>{row.from_channel_name}</td><td>{row.to_channel_name}</td><td className="numeric">{number(row.transition_count)}</td></tr>)}</tbody></table></div>}</article>
          <article className="nm-panel"><div className="nm-panel__title"><h2>Ganho líquido</h2></div><Bars rows={entryExitBars} /></article>
        </section>}

        {tab === 'retention' && <section className="nm-grid nm-grid--two"><article className="nm-panel"><div className="nm-panel__title"><h2>Retenção por duração</h2></div><Bars rows={retention} /></article><article className="nm-panel"><div className="nm-panel__title"><h2>Regras</h2></div><p className="nm-copy">São calculadas permanências após 1, 5, 15, 30 e 60 minutos. Sessões inferiores a 60 segundos compõem a taxa de abandono; trocas diretas em até cinco minutos compõem a taxa de troca.</p></article></section>}

        {tab === 'technical' && <article className="nm-panel"><div className="nm-panel__title"><h2>Saúde técnica dos streams</h2><small>Índice configurável de 0 a 100</small></div>{technical.length === 0 ? <Empty /> : <div className="nm-table-wrap"><table><thead><tr><th>Canal</th><th>Tentativas</th><th>Iniciadas</th><th>Falhas iniciais</th><th>1º frame</th><th>Bufferings</th><th>Erros</th><th>Quedas</th><th>Saúde</th></tr></thead><tbody>{technical.map((row) => <tr key={row.channel_id}><td>{row.channel_name}</td><td>{number(row.attempts)}</td><td>{number(row.starts)}</td><td>{number(row.startup_failures)}</td><td>{number(row.first_frame_ms)} ms</td><td>{number(row.buffering_count)} · {duration(row.buffering_seconds)}</td><td>{percent(row.error_rate)}</td><td>{number(row.stream_drops)}</td><td><strong>{number(row.health_index, 1)}</strong></td></tr>)}</tbody></table></div>}</article>}

        {tab === 'history' && <section className="nm-grid nm-grid--two"><article className="nm-panel"><div className="nm-panel__title"><h2>Evolução da audiência</h2></div><LineChart values={audienceSeries} label="Evolução da audiência" /></article><article className="nm-panel"><div className="nm-panel__title"><h2>Audiência por plataforma</h2></div><Bars rows={live?.platforms || []} /></article><article className="nm-panel"><div className="nm-panel__title"><h2>Versão do aplicativo</h2></div><Bars rows={live?.versions || []} /></article><article className="nm-panel"><div className="nm-panel__title"><h2>Entradas e saídas</h2></div><Bars rows={entryExitBars} /></article></section>}

        {tab === 'reports' && <article className="nm-panel"><div className="nm-panel__title"><h2>Exportação de relatórios</h2><small>Ranking, share, retenção, migração e saúde técnica</small></div><div className="nm-report-actions"><button onClick={() => void downloadExport('csv')}>Exportar CSV</button><button onClick={() => void downloadExport('xlsx')}>Exportar XLSX</button><button onClick={() => void downloadExport('pdf')}>Exportar PDF</button></div></article>}

        {tab === 'settings' && <section className="nm-grid nm-grid--two">
          <article className="nm-panel"><div className="nm-panel__title"><h2>Privacidade</h2></div><p className="nm-copy">Nenhum nome, e-mail ou telefone é coletado. O identificador do dispositivo é anonimizado no servidor por HMAC e pode ser excluído administrativamente.</p><button onClick={() => { localStorage.setItem(NEWSMETER_CONSENT_KEY, 'declined'); setError('Telemetria não essencial desativada neste dispositivo.') }}>Desativar telemetria neste dispositivo</button></article>
          <article className="nm-panel"><div className="nm-panel__title"><h2>Retenção padrão</h2></div><p className="nm-copy">Eventos brutos: 30 dias. Sessões detalhadas: 90 dias. Agregados anônimos: período configurável no banco.</p>{import.meta.env.DEV && <button onClick={() => void runSimulation()}>Executar simulador de desenvolvimento</button>}</article>
          <article className="nm-panel"><div className="nm-panel__title"><h2>Sessão administrativa</h2></div><button onClick={() => { sessionStorage.removeItem('newsmeter-admin-token'); setToken(''); setTokenDraft('') }}>Remover token desta sessão</button></article>
        </section>}
      </section>
    </main>
  )
}
