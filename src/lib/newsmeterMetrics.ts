export type HealthInputs = {
  attempts: number
  starts: number
  startupFailures: number
  playbackErrors: number
  bufferingSeconds: number
  validWatchSeconds: number
  streamDrops: number
  firstFrameMs?: number
}

export function percentage(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, (part / total) * 100)
}

export function share(activeViewers: number, totalNewsViewers: number): number {
  return percentage(activeViewers, totalNewsViewers)
}

export function internalRating(activeViewers: number, eligibleActiveDevices: number): number {
  return percentage(activeViewers, eligibleActiveDevices)
}

export function averageMinuteAudience(totalValidWatchSeconds: number, durationOfPeriodSeconds: number): number {
  if (!Number.isFinite(totalValidWatchSeconds) || !Number.isFinite(durationOfPeriodSeconds) || durationOfPeriodSeconds <= 0) return 0
  return Math.max(0, totalValidWatchSeconds / durationOfPeriodSeconds)
}

export function averageWatchTime(totalValidWatchSeconds: number, validSessions: number): number {
  if (!Number.isFinite(totalValidWatchSeconds) || !Number.isFinite(validSessions) || validSessions <= 0) return 0
  return Math.max(0, totalValidWatchSeconds / validSessions)
}

export function retentionRate(sessionDurationsSeconds: number[], thresholdSeconds: number): number {
  if (sessionDurationsSeconds.length === 0) return 0
  const retained = sessionDurationsSeconds.filter((duration) => duration >= thresholdSeconds).length
  return percentage(retained, sessionDurationsSeconds.length)
}

export function abandonmentRate(sessionDurationsSeconds: number[]): number {
  if (sessionDurationsSeconds.length === 0) return 0
  const abandoned = sessionDurationsSeconds.filter((duration) => duration < 60).length
  return percentage(abandoned, sessionDurationsSeconds.length)
}

export function switchRate(validSessions: number, directChannelSwitches: number): number {
  return percentage(directChannelSwitches, validSessions)
}

export function netGain(entries: number, exits: number): number {
  return entries - exits
}

export function calculateHealthIndex(input: HealthInputs): number {
  if (input.attempts <= 0) return 0

  const startupPenalty = Math.min(30, Math.max(0, input.startupFailures / input.attempts) * 30)
  const errorPenalty = Math.min(25, Math.max(0, input.playbackErrors / input.attempts) * 25)
  const bufferingPenalty = input.starts > 0
    ? Math.min(25, Math.max(0, input.bufferingSeconds / input.starts / 60) * 25)
    : 0
  const firstFramePenalty = Math.min(10, Math.max(0, (input.firstFrameMs || 0) / 10_000) * 10)
  const dropPenalty = input.starts > 0
    ? Math.min(10, Math.max(0, input.streamDrops / input.starts) * 10)
    : 0

  return Math.round(Math.max(0, Math.min(100, 100 - startupPenalty - errorPenalty - bufferingPenalty - firstFramePenalty - dropPenalty)) * 100) / 100
}
