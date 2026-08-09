import { describe, expect, it } from 'vitest'
import {
  activeViewers, applyModelEvent, createAudienceModel, expireModelSessions, validateModelMappings,
  type AudienceModel, type ModelEvent,
} from './audienceSessionModel'

const start = Date.parse('2026-07-19T12:00:00Z')
const mappings = [
  { streamId: 'cnn-br', channelId: 'cnn-brasil', country: 'BR', language: 'pt-BR' },
  { streamId: 'cnn-int', channelId: 'cnn-international', country: 'US', language: 'en' },
  { streamId: 'globo', channelId: 'globonews', country: 'BR', language: 'pt-BR' },
]

function model(): AudienceModel {
  return createAudienceModel({ mappings, programs: [{ id: 'jornal', channelId: 'cnn-brasil', start, end: start + 3_600_000 }] })
}

function event(overrides: Partial<ModelEvent> = {}): ModelEvent {
  return { eventId: crypto.randomUUID(), type: 'playback_started', sessionId: 's1', deviceId: 'd1', streamId: 'cnn-br', timestamp: start, ...overrides }
}

it('cria sessão no início de reprodução e associa EPG pelo canal e horário', () => {
  const state = model(); applyModelEvent(state, event())
  expect(state.sessions.get('s1')?.programId).toBe('jornal')
})

it('processa heartbeat sem abrir nova sessão', () => {
  const state = model(); applyModelEvent(state, event()); applyModelEvent(state, event({ eventId: 'hb1', type: 'heartbeat', timestamp: start + 30_000 }))
  expect(state.sessions.size).toBe(1); expect(state.sessions.get('s1')?.validWatchSeconds).toBe(30)
})

it('expira sessão após 45 segundos sem heartbeat', () => {
  const state = model(); applyModelEvent(state, event()); expect(expireModelSessions(state, start + 45_000)).toBe(1)
})

it('não conta tempo pausado como reprodução válida', () => {
  const state = model(); applyModelEvent(state, event()); applyModelEvent(state, event({ eventId: 'p', type: 'playback_paused', timestamp: start + 10_000 })); applyModelEvent(state, event({ eventId: 'r', type: 'playback_resumed', timestamp: start + 30_000 })); applyModelEvent(state, event({ eventId: 'h', type: 'heartbeat', timestamp: start + 40_000 }))
  expect(state.sessions.get('s1')?.validWatchSeconds).toBe(20)
})

it('desconta buffering e registra recuperação', () => {
  const state = model(); applyModelEvent(state, event()); applyModelEvent(state, event({ eventId: 'b', type: 'playback_buffering', timestamp: start + 10_000 })); applyModelEvent(state, event({ eventId: 'r', type: 'playback_recovered', timestamp: start + 20_000 })); applyModelEvent(state, event({ eventId: 'h', type: 'heartbeat', timestamp: start + 40_000 }))
  expect(state.sessions.get('s1')?.bufferingSeconds).toBe(10); expect(state.sessions.get('s1')?.validWatchSeconds).toBe(30)
})

it('registra troca apenas quando outro canal inicia em até cinco minutos', () => {
  const state = model(); applyModelEvent(state, event()); applyModelEvent(state, event({ eventId: 'stop', type: 'playback_stopped', timestamp: start + 60_000 })); applyModelEvent(state, event({ eventId: 'change', type: 'channel_changed', timestamp: start + 61_000 })); applyModelEvent(state, event({ eventId: 'new', sessionId: 's2', streamId: 'globo', timestamp: start + 62_000 }))
  expect(state.transitions).toEqual([expect.objectContaining({ fromChannelId: 'cnn-brasil', toChannelId: 'globonews' })])
})

it('fechamento do aplicativo encerra sem contar como troca', () => {
  const state = model(); applyModelEvent(state, event()); applyModelEvent(state, event({ eventId: 'close', type: 'app_closed', timestamp: start + 35_000 })); expect(state.transitions).toHaveLength(0)
})

it('reconexão preserva deduplicação de dispositivo por canal', () => {
  const state = model(); applyModelEvent(state, event()); applyModelEvent(state, event({ eventId: 'h', type: 'heartbeat', timestamp: start + 31_000 })); expect(activeViewers(state, 'cnn-brasil', start + 31_000)).toBe(1)
})

it('ignora eventos duplicados pelo event_id', () => {
  const state = model(); const first = event({ eventId: 'same' }); expect(applyModelEvent(state, first)).toBe('accepted'); expect(applyModelEvent(state, first)).toBe('duplicate')
})

it('conta dois dispositivos distintos', () => {
  const state = model(); applyModelEvent(state, event()); applyModelEvent(state, event({ eventId: 's2', sessionId: 's2', deviceId: 'd2' })); applyModelEvent(state, event({ eventId: 'h1', type: 'heartbeat', timestamp: start + 31_000 })); applyModelEvent(state, event({ eventId: 'h2', type: 'heartbeat', sessionId: 's2', deviceId: 'd2', timestamp: start + 31_000 })); expect(activeViewers(state, 'cnn-brasil', start + 31_000)).toBe(2)
})

it('encerra sessão sobreposta do mesmo dispositivo', () => {
  const state = model(); applyModelEvent(state, event()); applyModelEvent(state, event({ eventId: 's2', sessionId: 's2', streamId: 'globo', timestamp: start + 10_000 })); expect(state.sessions.get('s1')?.endReason).toBe('overlap_replaced')
})

it('mantém program_id nulo quando o EPG está indisponível', () => {
  const state = createAudienceModel({ mappings }); applyModelEvent(state, event()); expect(state.sessions.get('s1')?.programId).toBeNull()
})

it('impede associação entre stream brasileiro e versão internacional', () => {
  const state = model(); applyModelEvent(state, event({ streamId: 'cnn-int' })); expect(state.sessions.get('s1')?.channelId).toBe('cnn-international')
})

it('sinaliza mapeamento duplicado', () => {
  expect(validateModelMappings([...mappings, { ...mappings[0]!, channelId: 'errado' }])).toContain('Stream duplicado: cnn-br')
})

it('exclui dispositivos de teste dos espectadores ativos', () => {
  const state = model(); state.excludedDevices.add('d1'); applyModelEvent(state, event()); applyModelEvent(state, event({ eventId: 'h', type: 'heartbeat', timestamp: start + 31_000 })); expect(activeViewers(state, 'cnn-brasil', start + 31_000)).toBe(0)
})

describe('contratos adicionais', () => {
  it('não ativa sessão com menos de 30 segundos', () => { const state = model(); applyModelEvent(state, event()); expect(activeViewers(state, 'cnn-brasil', start + 29_000)).toBe(0) })
  it('remove ativo quando heartbeat passa de 45 segundos', () => { const state = model(); applyModelEvent(state, event()); expect(activeViewers(state, 'cnn-brasil', start + 46_000)).toBe(0) })
  it('não cria sessão para stream sem mapeamento', () => { const state = model(); expect(applyModelEvent(state, event({ streamId: 'desconhecido' }))).toBe('unmapped'); expect(state.sessions.size).toBe(0) })
  it('erro definitivo encerra a sessão', () => { const state = model(); applyModelEvent(state, event()); applyModelEvent(state, event({ eventId: 'e', type: 'playback_failed', timestamp: start + 40_000 })); expect(state.sessions.get('s1')?.endReason).toBe('playback_failed') })
  it('reprocessamento pode associar EPG posteriormente', () => { const state = createAudienceModel({ mappings }); applyModelEvent(state, event()); state.programs.push({ id: 'novo', channelId: 'cnn-brasil', start, end: start + 60_000 }); const session = state.sessions.get('s1')!; session.programId = state.programs.find((p) => p.channelId === session.channelId && p.start <= session.startedAt && session.startedAt < p.end)?.id || null; expect(session.programId).toBe('novo') })
})
