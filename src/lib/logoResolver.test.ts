import { describe, expect, it } from 'vitest'
import {
  CHANNEL_LOGO_PLACEHOLDER,
  normalizeChannelLogoKey,
  resolveChannelLogo,
  resolveChannelLogoCandidates,
  setInternalChannelLogoCache,
} from './logoResolver'

describe('logoResolver', () => {
  it('normalizes channel names without depending on external logo catalogs', () => {
    expect(normalizeChannelLogoKey('CNN Brasil HD')).toBe('cnn')
    expect(normalizeChannelLogoKey('Band News FHD')).toBe('bandnews')
    expect(normalizeChannelLogoKey('ESPN Brasil 4K')).toBe('espnbrasil')
    expect(normalizeChannelLogoKey('SporTV 2')).toBe('sportv2')
    expect(normalizeChannelLogoKey('TNT Series')).toBe('tntseries')
  })

  it('prioritizes own CDN/local logo before playlist and placeholder', () => {
    expect(
      resolveChannelLogoCandidates('SporTV', 'https://playlist.example/sportv.png', {
        logoCdn: 'https://cdn.example/logos/sportv.webp',
      }),
    ).toEqual(['https://cdn.example/logos/sportv.webp', 'https://playlist.example/sportv.png', CHANNEL_LOGO_PLACEHOLDER])
  })

  it('uses the internal logo cache before playlist logos', () => {
    setInternalChannelLogoCache({ sportv: 'https://cdn.example/logos/sportv.webp' })

    expect(resolveChannelLogoCandidates('SporTV', 'https://playlist.example/sportv.png')).toEqual([
      'https://cdn.example/logos/sportv.webp',
      'https://playlist.example/sportv.png',
      CHANNEL_LOGO_PLACEHOLDER,
    ])

    setInternalChannelLogoCache({})
  })

  it('falls back to playlist when no own CDN/local logo exists', () => {
    expect(resolveChannelLogo('SporTV', 'https://playlist.example/sportv.png')).toBe('https://playlist.example/sportv.png')
  })

  it('falls back to local placeholder when playlist logo is empty', () => {
    expect(resolveChannelLogoCandidates('SporTV', '')).toEqual([CHANNEL_LOGO_PLACEHOLDER])
    expect(resolveChannelLogo('SporTV', '')).toBe(CHANNEL_LOGO_PLACEHOLDER)
  })

  it('deduplicates repeated URLs in the fallback chain', () => {
    expect(
      resolveChannelLogoCandidates('SporTV', 'https://cdn.example/logos/sportv.webp', {
        logoCdn: 'https://cdn.example/logos/sportv.webp',
      }),
    ).toEqual(['https://cdn.example/logos/sportv.webp', CHANNEL_LOGO_PLACEHOLDER])
  })
})
