export type ModelEventType =
  | 'playback_started' | 'heartbeat' | 'playback_paused' | 'playback_resumed'
  | 'playback_buffering' | 'playback_recovered' | 'playback_stopped'
  | 'playback_failed' | 'app_closed' | 'channel_changed'

export type ModelEvent = {
  eventId: string
  type: ModelEventType
  sessionId: string
  deviceId: string
  streamId: string
  timestamp: number
  bufferingDuration?: number
}

export type ModelProgram = { id: string; channelId: string; start: number; end: number }
export type ModelMapping = { streamId: string; channelId: string; country: string; language: string }
export type ModelSession = {
  id: string
  deviceId: string
  channelId: string
  streamId: string
  programId: string | null
  startedAt: number
  endedAt: number | null
  lastHeartbeatAt: number
  pauseStartedAt: number | null
  bufferingStartedAt: number | null
  pauseSeconds: number
  bufferingSeconds: number
  validWatchSeconds: number
  endReason: string | null
  isTest: boolean
}

export type AudienceModel = {
  sessions: Map<string, ModelSession>
  processedEventIds: Set<string>
  mappings: ModelMapping[]
  programs: ModelProgram[]
  excludedDevices: Set<string>
  transitions: Array<{ fromChannelId: string; toChannelId: string; deviceId: string; timestamp: number }>
  channelChanges: Map<string, number>
}

export function createAudienceModel(input: Partial<Pick<AudienceModel, 'mappings' | 'programs'>> = {}): AudienceModel {
  return {
    sessions: new Map(),
    processedEventIds: new Set(),
    mappings: input.mappings || [],
    programs: input.programs || [],
    excludedDevices: new Set(),
    transitions: [],
    channelChanges: new Map(),
  }
}

function resolveChannel(model: AudienceModel, streamId: string): string | null {
  return model.mappings.find((mapping) => mapping.streamId === streamId)?.channelId || null
}

function resolveProgram(model: AudienceModel, channelId: string, timestamp: number): string | null {
  return model.programs.find((program) => program.channelId === channelId && program.start <= timestamp && timestamp < program.end)?.id || null
}

function updateValidWatch(session: ModelSession, timestamp: number): void {
  const gross = Math.max(0, (timestamp - session.startedAt) / 1000)
  session.validWatchSeconds = Math.max(0, Math.floor(gross - session.pauseSeconds - session.bufferingSeconds))
  session.lastHeartbeatAt = Math.max(session.lastHeartbeatAt, timestamp)
}

export function applyModelEvent(model: AudienceModel, event: ModelEvent): 'accepted' | 'duplicate' | 'unmapped' {
  if (model.processedEventIds.has(event.eventId)) return 'duplicate'
  model.processedEventIds.add(event.eventId)
  const channelId = resolveChannel(model, event.streamId)
  if (!channelId) return 'unmapped'
  const isTest = model.excludedDevices.has(event.deviceId)

  if (event.type === 'channel_changed') {
    model.channelChanges.set(event.deviceId, event.timestamp)
    return 'accepted'
  }

  if (event.type === 'playback_started') {
    for (const session of model.sessions.values()) {
      if (session.deviceId === event.deviceId && session.endedAt === null && session.id !== event.sessionId) {
        session.endedAt = event.timestamp
        session.endReason = 'overlap_replaced'
      }
    }
    const previous = [...model.sessions.values()]
      .filter((session) => session.deviceId === event.deviceId && session.endedAt !== null && session.channelId !== channelId)
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))[0]
    const changedAt = model.channelChanges.get(event.deviceId)
    if (previous?.endedAt && changedAt && event.timestamp - previous.endedAt <= 300_000 && event.timestamp - changedAt <= 300_000) {
      model.transitions.push({ fromChannelId: previous.channelId, toChannelId: channelId, deviceId: event.deviceId, timestamp: event.timestamp })
    }
    model.sessions.set(event.sessionId, {
      id: event.sessionId,
      deviceId: event.deviceId,
      channelId,
      streamId: event.streamId,
      programId: resolveProgram(model, channelId, event.timestamp),
      startedAt: event.timestamp,
      endedAt: null,
      lastHeartbeatAt: event.timestamp,
      pauseStartedAt: null,
      bufferingStartedAt: null,
      pauseSeconds: 0,
      bufferingSeconds: 0,
      validWatchSeconds: 0,
      endReason: null,
      isTest,
    })
    return 'accepted'
  }

  const session = model.sessions.get(event.sessionId)
  if (!session || session.endedAt !== null) return 'accepted'
  if (event.type === 'heartbeat') updateValidWatch(session, event.timestamp)
  if (event.type === 'playback_paused') session.pauseStartedAt ??= event.timestamp
  if (event.type === 'playback_resumed' && session.pauseStartedAt !== null) {
    session.pauseSeconds += Math.max(0, (event.timestamp - session.pauseStartedAt) / 1000)
    session.pauseStartedAt = null
  }
  if (event.type === 'playback_buffering') session.bufferingStartedAt ??= event.timestamp
  if (event.type === 'playback_recovered') {
    session.bufferingSeconds += event.bufferingDuration ?? (session.bufferingStartedAt === null ? 0 : Math.max(0, (event.timestamp - session.bufferingStartedAt) / 1000))
    session.bufferingStartedAt = null
  }
  if (['playback_stopped', 'playback_failed', 'app_closed'].includes(event.type)) {
    updateValidWatch(session, event.timestamp)
    session.endedAt = event.timestamp
    session.endReason = event.type
  }
  return 'accepted'
}

export function expireModelSessions(model: AudienceModel, now: number): number {
  let expired = 0
  for (const session of model.sessions.values()) {
    if (session.endedAt === null && now - session.lastHeartbeatAt >= 45_000) {
      updateValidWatch(session, session.lastHeartbeatAt + 45_000)
      session.endedAt = session.lastHeartbeatAt + 45_000
      session.endReason = 'heartbeat_timeout'
      expired += 1
    }
  }
  return expired
}

export function activeViewers(model: AudienceModel, channelId: string, now: number): number {
  return new Set([...model.sessions.values()]
    .filter((session) => session.channelId === channelId && !session.isTest && session.startedAt <= now - 30_000 && session.endedAt === null && now - session.lastHeartbeatAt < 45_000)
    .map((session) => session.deviceId)).size
}

export function validateModelMappings(mappings: ModelMapping[]): string[] {
  const issues: string[] = []
  const streams = new Set<string>()
  for (const mapping of mappings) {
    if (streams.has(mapping.streamId)) issues.push(`Stream duplicado: ${mapping.streamId}`)
    streams.add(mapping.streamId)
    if (!mapping.channelId) issues.push(`Canal ausente para ${mapping.streamId}`)
  }
  return issues
}
