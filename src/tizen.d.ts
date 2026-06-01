import type Hls from 'hls.js'

interface TizenTVInputDevice {
  registerKey(keyName: string): void
  unregisterKey(keyName: string): void
}

interface Tizen {
  tvinputdevice: TizenTVInputDevice
}

declare global {
  interface Window {
    tizen?: Tizen
    __IS_TIZEN_TV__?: boolean
    __SHARED_VIDEO_ELEMENT__?: HTMLVideoElement
    __SHARED_VIDEO_MAIN_URL__?: string | null
    __SHARED_HLS_INSTANCE__?: Hls | null
    __TRANSITIONING_TO_FULLSCREEN_URL__?: string | null
  }
}
