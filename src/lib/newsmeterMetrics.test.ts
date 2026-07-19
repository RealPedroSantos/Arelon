import { describe, expect, it } from 'vitest'
import {
  abandonmentRate,
  averageMinuteAudience,
  averageWatchTime,
  calculateHealthIndex,
  internalRating,
  netGain,
  retentionRate,
  share,
  switchRate,
} from './newsmeterMetrics'

describe('NewsMeter metrics', () => {
  it('calculates share and returns zero without a denominator', () => {
    expect(share(25, 100)).toBe(25)
    expect(share(25, 0)).toBe(0)
  })

  it('calculates the internal rating', () => {
    expect(internalRating(50, 200)).toBe(25)
  })

  it('calculates average minute audience without duplicating seconds', () => {
    expect(averageMinuteAudience(1_800, 3_600)).toBe(0.5)
  })

  it('calculates average watch time', () => {
    expect(averageWatchTime(900, 3)).toBe(300)
  })

  it('calculates retention and abandonment', () => {
    const durations = [30, 60, 300, 900, 3_600]
    expect(retentionRate(durations, 60)).toBe(80)
    expect(retentionRate(durations, 300)).toBe(60)
    expect(abandonmentRate(durations)).toBe(20)
  })

  it('calculates channel switching and net gain', () => {
    expect(switchRate(100, 25)).toBe(25)
    expect(netGain(120, 95)).toBe(25)
  })

  it('keeps channel health between zero and one hundred', () => {
    expect(calculateHealthIndex({
      attempts: 100,
      starts: 98,
      startupFailures: 2,
      playbackErrors: 1,
      bufferingSeconds: 30,
      validWatchSeconds: 6_000,
      streamDrops: 1,
    })).toBeGreaterThan(90)

    expect(calculateHealthIndex({
      attempts: 0,
      starts: 0,
      startupFailures: 0,
      playbackErrors: 0,
      bufferingSeconds: 0,
      validWatchSeconds: 0,
      streamDrops: 0,
    })).toBe(0)
  })
})
