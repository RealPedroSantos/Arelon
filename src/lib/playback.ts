import type Hls from 'hls.js'

export function isTizenTVWebView(): boolean {
  const flagged = (window as Window & { __IS_TIZEN_TV__?: boolean }).__IS_TIZEN_TV__
  const ua = navigator.userAgent || ''
  return Boolean(flagged) || /Tizen|SMART-TV|SamsungBrowser|TV/i.test(ua)
}

export function isHlsStreamUrl(url: string): boolean {
  return url.startsWith('blob:') || /\.m3u8(?:[?#]|$)/i.test(url)
}

export function toXtreamLiveTsUrl(url: string): string | null {
  const match = url.match(/^(.*\/live\/[^/]+\/[^/]+\/)([^/?#]+?)(?:\.(?:m3u8|ts))?([?#].*)?$/i)
  if (!match) return null

  const [, prefix, streamId, suffix = ''] = match
  if (!prefix || !streamId) return null
  return `${prefix}${streamId}.ts${suffix}`
}

export function getLivePlaybackCandidates(url: string, preferTransportStream: boolean): string[] {
  const tsUrl = toXtreamLiveTsUrl(url)
  const ordered = preferTransportStream && tsUrl ? [tsUrl, url] : [url, tsUrl]

  return ordered.filter((candidate, index, all): candidate is string => (
    Boolean(candidate) && all.indexOf(candidate) === index
  ))
}

export function getSharedVideoElement(): HTMLVideoElement {
  if (!window.__SHARED_VIDEO_ELEMENT__) {
    const vid = document.createElement('video')
    vid.style.width = '100%'
    vid.style.height = '100%'
    vid.style.display = 'block'
    vid.playsInline = true
    vid.autoplay = true
    window.__SHARED_VIDEO_ELEMENT__ = vid
  }
  return window.__SHARED_VIDEO_ELEMENT__
}

export function setTransitioningToFullscreenUrl(url: string | null): void {
  window.__TRANSITIONING_TO_FULLSCREEN_URL__ = url
}

export function setSharedVideoMainUrl(url: string | null): void {
  window.__SHARED_VIDEO_MAIN_URL__ = url
}

export function setSharedHlsInstance(hls: Hls | null): void {
  window.__SHARED_HLS_INSTANCE__ = hls
}
