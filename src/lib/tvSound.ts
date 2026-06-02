/**
 * UI Sound Effects - Per-context sounds as requested
 */

let audioContext: AudioContext | null = null;
const buffers: Record<string, AudioBuffer | null> = {};
const loading: Record<string, boolean> = {};

let lastPlayTime = 0;
const MIN_PLAY_INTERVAL = 22;
const SOUND_VOLUME = 0.5;

// Use import.meta.env.BASE_URL so paths work on both localhost and GitHub Pages (/Arelon/)
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const PATHS = {
  keyboardKey:   `${BASE}/assets/sounds/keyboard_key.wav`,
  keyboardClear: `${BASE}/assets/sounds/keyboard_clear.wav`,
  keyboardEnter: `${BASE}/assets/sounds/ui_select.wav`,
  uiMove:        `${BASE}/assets/sounds/ui_move.wav`,
  uiClick:       `${BASE}/assets/sounds/ui_select.wav`,
  logout:        `${BASE}/assets/sounds/logout.wav`,
};

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (Ctx) audioContext = new Ctx();
  }
  return audioContext;
}

async function loadSound(name: keyof typeof PATHS) {
  if (buffers[name] || loading[name]) return;

  loading[name] = true;
  try {
    const ctx = getContext();
    if (!ctx) return;

    const res = await fetch(PATHS[name], { cache: 'force-cache' });
    const arr = await res.arrayBuffer();
    buffers[name] = await ctx.decodeAudioData(arr);

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
  } catch (e) {
    console.warn(`[tvSound] Failed to load ${name}:`, e);
  } finally {
    loading[name] = false;
  }
}

function play(name: keyof typeof PATHS) {
  const now = Date.now();
  if (now - lastPlayTime < MIN_PLAY_INTERVAL) return;
  lastPlayTime = now;

  const ctx = getContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  if (!buffers[name]) {
    loadSound(name).then(() => {
      if (buffers[name]) playBuffer(ctx, buffers[name]!, name);
    });
    return;
  }

  playBuffer(ctx, buffers[name]!, name);
}

// === CONTROLE DE VOLUME (ajustável em tempo real) ===
export let normalVolume = 0.3;   // 1. Sons normais (movimento, teclas do teclado, limpar, sair, etc.)
export let clickVolume  = 4.1;   // 2. Som de clique / OK / Enter (seleção de elementos)

export function setNormalVolume(v: number) {
  normalVolume = Math.max(0, v);
}

export function setClickVolume(v: number) {
  clickVolume = Math.max(0, v);
}

function getVolumeFor(name?: keyof typeof PATHS): number {
  if (!name) return normalVolume;
  if (name === 'keyboardEnter' || name === 'uiClick') {
    return clickVolume;
  }
  return normalVolume;
}

function playBuffer(ctx: AudioContext, buffer: AudioBuffer, name?: keyof typeof PATHS) {
  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.value = getVolumeFor(name);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 6500;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start();
  } catch (e) {
    console.warn('[tvSound] Buffer playback failed, trying fallback tone:', e);
    playFallbackTone(ctx);
  }
}

// Fallback simple tone (for debugging on problematic Tizen devices)
function playFallbackTone(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.value = 880;

    filter.type = 'lowpass';
    filter.frequency.value = 2000; // raised for better audibility


    gain.gain.value = SOUND_VOLUME;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(SOUND_VOLUME, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.15);
  } catch (e) {
    console.warn('[tvSound] Even fallback tone failed:', e);
  }
}

/* ====================== PUBLIC API ====================== */

// Keyboard specific
export const playKeyboardKeySound   = () => play('keyboardKey');
export const playKeyboardClearSound = () => play('keyboardClear');
export const playKeyboardEnterSound = () => play('keyboardEnter');

// General UI
export const playUIMoveSound  = () => play('uiMove');
export const playUIClickSound = () => play('uiClick');

// Top bar logout
export const playLogoutSound = () => play('logout');

// Legacy aliases (for old code that still references them)
export const playMoveSound = playUIMoveSound;
export const playSelectSound = playUIClickSound;

export function unlockAudio() {
  const ctx = getContext();
  if (!ctx) return;

  // Very aggressive resume for Tizen 6.5
  for (let i = 0; i < 4; i++) {
    setTimeout(() => {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    }, i * 70);
  }

  // Multiple silent buffers + staggered starts (very effective on stubborn Tizen)
  try {
    for (let i = 0; i < 3; i++) {
      const silent = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(ctx.currentTime + (i * 0.04));
    }
  } catch {}

  // Preload all sounds immediately
  Object.keys(PATHS).forEach(k => loadSound(k as keyof typeof PATHS));
}

export function ensureAudioUnlocked() {
  unlockAudio();
}

if (typeof window !== 'undefined') {
  (window as any).__ArelonPlayMoveSound   = playUIMoveSound;   // for arrows / focus movement
  (window as any).__ArelonPlaySelectSound = playUIClickSound;  // for ENTER/OK selection (the one user wants)
}
