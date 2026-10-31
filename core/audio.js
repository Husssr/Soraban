// Sound effects synthesised with the Web Audio API (no audio files).
// Respects the sound on/off + volume settings; haptics use the Vibration API.

import { getSettings } from './store.js';

let ctx = null;

function getContext() {
  if (ctx) return ctx;
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    ctx = new AudioCtx();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Browsers only allow audio after a user gesture: call this from one. */
export function unlock() {
  const c = getContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

/** One enveloped oscillator note. */
function tone(c, volume, { freq, to, dur = 0.08, type = 'sine', gain = 0.2, delay = 0 }) {
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const peak = Math.max(0.0002, gain * volume);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  // soft wooden "click" when a bead moves
  bead: (c, v) => tone(c, v, { freq: 760, to: 420, dur: 0.05, type: 'triangle', gain: 0.16 }),
  ui: (c, v) => tone(c, v, { freq: 520, dur: 0.05, type: 'sine', gain: 0.12 }),
  correct: (c, v) => {
    tone(c, v, { freq: 660, dur: 0.09, gain: 0.18 });
    tone(c, v, { freq: 990, dur: 0.14, gain: 0.18, delay: 0.08 });
  },
  wrong: (c, v) => tone(c, v, { freq: 200, to: 140, dur: 0.22, type: 'sawtooth', gain: 0.1 }),
  tick: (c, v) => tone(c, v, { freq: 900, dur: 0.03, type: 'square', gain: 0.05 }),
  finish: (c, v) => {
    [523, 659, 784, 1047].forEach((freq, i) =>
      tone(c, v, { freq, dur: 0.16, gain: 0.16, delay: i * 0.09 }));
  },
};

/** Play a named effect if sound is enabled. Never throws. */
export function play(name) {
  try {
    const settings = getSettings();
    if (!settings.sound || settings.volume <= 0) return;
    const c = getContext();
    const sound = SOUNDS[name];
    if (!c || !sound) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    sound(c, settings.volume);
  } catch {
    /* audio is a nicety; ignore failures */
  }
}

export function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Short haptic pulse where supported and enabled. */
export function vibrate(pattern = 8) {
  try {
    if (getSettings().haptics && canVibrate()) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
