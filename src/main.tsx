import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

// Register Samsung Tizen remote keys
try {
  const tizen = window.tizen
  if (tizen && tizen.tvinputdevice) {
    const keys = [
      'Return',
      'ChannelUp',
      'ChannelDown',
      'MediaPlay',
      'MediaPause',
      'MediaPlayPause',
      'MediaFastForward',
      'MediaRewind',
      'MediaStop',
      'ColorF0Red',
      'ColorF1Green',
      'ColorF2Yellow',
      'ColorF3Blue',
    ]
    keys.forEach((k) => {
      try { tizen.tvinputdevice.registerKey(k) } catch { /* unsupported key */ }
    })
  }
} catch { /* not Tizen */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
