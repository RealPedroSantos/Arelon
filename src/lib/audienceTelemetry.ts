import { useEffect, useRef } from 'react'
import { useStore, type MediaItem } from '../store'
import { getSharedVideoElement } from './playback'

export const NEWSMETER_POLICY_VERSION = '2026-07-19'
export const NEWSMETER_CONSENT_KEY = 'arelon-newsmeter-consent'

const DEVICE_TOKEN_KEY = 'arelon-newsmeter-device-token'
const HEARTBEAT_INTERVAL_MS = 15_000

type AudienceEventType =
  | 'app_opened'
  | 'player_opened'
  | 'playback_requested'
  | 'playback_started'
  | 'playback_paused'
  | 'playback_resumed'
  | 'playback_buffering'
  | 'playback_recovered'
  | 'heartbeat'
  | 'channel_changed'
  | 'playback_stopped'
  | 'playback_failed'
  | 'app_backgrounded'
  | 'app_closed'
  | 'session_expired'

type EventPayload = {
  event_id: string
  event_type: AudienceEventType
  session_id: string
  client_device_token: string
  channel_id?: string | null
  program_id?: string | null
  stream_id?: string | null
  timestamp: string
  playback_position?: number | null
  player_state?: string | null
  app_version: string
  platform: string
  country?: string | null
  state?: string | null
  network_type?: string | null
  error_code?: string | null
  buffering_duration?: number | null
  previous_channel_id?: string | null
  metadata?: Record<string, unknown>
}

type SessionState = {
  id: string
  media: MediaItem
  started: boolean
  bufferingStartedAt: number | null
  lastHeartbeatAt: number
  previousStreamId: string | null
  requestedAt: number
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function getDeviceToken(): string {
  try {
    const existing = localStorage.getItem(DEVICE_TOKEN_KEY)
    if (existing) return existing
    const created = `${newId()}.${newId()}`
    localStorage.setItem(DEVICE_TOKEN_KEY, created)
    return created
  } catch {
    return `${newId()}.${newId()}`
  }
}

function getPlatform(): string {
  const userAgent = navigator.userAgent.toLowerCase()
  if ('tizen' in window || userAgent.includes('tizen')) return 'samsung-tizen'
  if (userAgent.includes('appletv') || userAgent.includes('tvos')) return 'apple-tv'
  if (userAgent.includes('android')) return 'android'
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'ios'
  if (userAgent.includes('mac os')) return 'macos-web'
  if (userAgent.includes('windows')) return 'windows-web'
  return 'web'
}

function getNetworkType(): string | null {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string }
  }).connection
  return connection?.effectiveType || connection?.type || null
}

function appVersion(): string {
  return import.meta.env.VITE_APP_VERSION || '1.0.10'
}

function telemetryEnabled(): boolean {
  try {
    return localStorage.getItem(NEWSMETER_CONSENT_KEY) === 'accepted'
  } catch {
    return false
  }
}

function postEvent(payload: EventPayload, beacon = false): void {
  if (!telemetryEnabled()) return
  const body = JSON.stringify(payload)

  if (beacon && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' })
    navigator.sendBeacon(`/api/audience/${payload.event_type === 'heartbeat' ? 'heartbeat' : 'events'}`, blob)
    return
  }

  void fetch(`/api/audience/${payload.event_type === 'heartbeat' ? 'heartbeat' : 'events'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: beacon,
  }).catch(() => undefined)
}

function eventPayload(
  eventType: AudienceEventType,
  session: SessionState | null,
  video: HTMLVideoElement | null,
  deviceToken: string,
  extra: Partial<EventPayload> = {},
): EventPayload {
  const media = session?.media
  const baseMetadata: Record<string, unknown> = {
    privacy_policy_version: NEWSMETER_POLICY_VERSION,
    content_type: media?.type || null,
    title: media?.title || null,
    assigned_server: media?.assignedServer || null,
    previous_stream_id: session?.previousStreamId || null,
    resolution: video?.videoWidth && video?.videoHeight ? `${video.videoWidth}x${video.videoHeight}` : null,
  }
  return {
    event_id: newId(),
    event_type: eventType,
    session_id: session?.id || newId(),
    client_device_token: deviceToken,
    channel_id: null,
    program_id: null,
    stream_id: media?.id || null,
    timestamp: new Date().toISOString(),
    playback_position: Number.isFinite(video?.currentTime) ? video!.currentTime : null,
    player_state: video
      ? video.ended
        ? 'ended'
        : video.paused
          ? 'paused'
          : video.readyState < 3
            ? 'buffering'
            : 'playing'
      : null,
    app_version: appVersion(),
    platform: getPlatform(),
    country: null,
    state: null,
    network_type: getNetworkType(),
    error_code: null,
    buffering_duration: null,
    previous_channel_id: null,
    ...extra,
    metadata: { ...baseMetadata, ...(extra.metadata || {}) },
  }
}

export function useAudienceTelemetry(enabled: boolean): void {
  const currentMedia = useStore((state) => state.currentMedia)
  const sessionRef = useRef<SessionState | null>(null)
  const previousStreamIdRef = useRef<string | null>(null)
  const deviceTokenRef = useRef<string>('')

  useEffect(() => {
    if (!enabled) return
    deviceTokenRef.current = getDeviceToken()
    const payload = eventPayload('app_opened', null, null, deviceTokenRef.current)
    postEvent(payload)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        postEvent(eventPayload('app_backgrounded', sessionRef.current, null, deviceTokenRef.current), true)
      }
    }
    const onPageHide = () => {
      postEvent(eventPayload('app_closed', sessionRef.current, null, deviceTokenRef.current), true)
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      postEvent(eventPayload('app_closed', sessionRef.current, null, deviceTokenRef.current), true)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !currentMedia || (currentMedia.type !== 'live' && !currentMedia.isLive)) return

    const video = getSharedVideoElement()
    const session: SessionState = {
      id: newId(),
      media: currentMedia,
      started: false,
      bufferingStartedAt: null,
      lastHeartbeatAt: 0,
      previousStreamId: previousStreamIdRef.current,
      requestedAt: Date.now(),
    }
    sessionRef.current = session

    if (previousStreamIdRef.current && previousStreamIdRef.current !== currentMedia.id) {
      postEvent(eventPayload('channel_changed', session, video, deviceTokenRef.current, {
        metadata: {
          privacy_policy_version: NEWSMETER_POLICY_VERSION,
          previous_stream_id: previousStreamIdRef.current,
          next_stream_id: currentMedia.id,
          assigned_server: currentMedia.assignedServer || null,
        },
      }))
    }

    postEvent(eventPayload('player_opened', session, video, deviceTokenRef.current))
    postEvent(eventPayload('playback_requested', session, video, deviceTokenRef.current))

    const onPlaying = () => {
      const recoveredDuration = session.bufferingStartedAt
        ? Math.max(0, (Date.now() - session.bufferingStartedAt) / 1000)
        : null

      if (!session.started) {
        session.started = true
        postEvent(eventPayload('playback_started', session, video, deviceTokenRef.current, {
          metadata: { first_frame_ms: Math.max(0, Date.now() - session.requestedAt) },
        }))
      } else if (session.bufferingStartedAt) {
        postEvent(eventPayload('playback_recovered', session, video, deviceTokenRef.current, {
          buffering_duration: recoveredDuration,
        }))
      } else {
        postEvent(eventPayload('playback_resumed', session, video, deviceTokenRef.current))
      }
      session.bufferingStartedAt = null
    }

    const onPause = () => {
      if (!video.ended) postEvent(eventPayload('playback_paused', session, video, deviceTokenRef.current))
    }

    const onWaiting = () => {
      if (!session.bufferingStartedAt) session.bufferingStartedAt = Date.now()
      postEvent(eventPayload('playback_buffering', session, video, deviceTokenRef.current))
    }

    const onError = () => {
      postEvent(eventPayload('playback_failed', session, video, deviceTokenRef.current, {
        error_code: video.error ? `MEDIA_ERR_${video.error.code}` : 'UNKNOWN_MEDIA_ERROR',
      }))
    }

    const onEnded = () => {
      postEvent(eventPayload('playback_stopped', session, video, deviceTokenRef.current, {
        metadata: {
          privacy_policy_version: NEWSMETER_POLICY_VERSION,
          end_reason: 'ended',
          previous_stream_id: session.previousStreamId,
        },
      }))
    }

    const sendHeartbeat = () => {
      if (
        document.visibilityState !== 'visible' ||
        video.paused ||
        video.ended ||
        video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
        session.bufferingStartedAt
      ) return

      const now = Date.now()
      if (now - session.lastHeartbeatAt < HEARTBEAT_INTERVAL_MS - 500) return
      session.lastHeartbeatAt = now
      postEvent(eventPayload('heartbeat', session, video, deviceTokenRef.current))
    }

    video.addEventListener('playing', onPlaying)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onWaiting)
    video.addEventListener('error', onError)
    video.addEventListener('ended', onEnded)
    video.addEventListener('timeupdate', sendHeartbeat)
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onWaiting)
      video.removeEventListener('error', onError)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('timeupdate', sendHeartbeat)
      postEvent(eventPayload('playback_stopped', session, video, deviceTokenRef.current, {
        metadata: {
          privacy_policy_version: NEWSMETER_POLICY_VERSION,
          end_reason: 'player_closed_or_channel_changed',
          previous_stream_id: session.previousStreamId,
        },
      }), true)
      previousStreamIdRef.current = currentMedia.id
      if (sessionRef.current?.id === session.id) sessionRef.current = null
    }
  }, [currentMedia, enabled])
}
