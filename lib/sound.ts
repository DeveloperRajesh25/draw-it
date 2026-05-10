'use client';
import { getSoundEnabled } from './identity';

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_ctx) return _ctx;
  try {
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    _ctx = new Ctor();
    return _ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, durationMs: number, volume = 0.08, type: OscillatorType = 'sine') {
  if (!getSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {/* ignore */});
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain).connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.05);
}

export const sfx = {
  tick: () => tone(720, 90, 0.05, 'square'),
  correctGuess: () => {
    tone(660, 90, 0.07, 'triangle');
    setTimeout(() => tone(880, 140, 0.07, 'triangle'), 90);
  },
  wordPick: () => tone(520, 110, 0.05, 'triangle'),
  roundEnd: () => {
    tone(440, 150, 0.06, 'sine');
    setTimeout(() => tone(330, 220, 0.05, 'sine'), 100);
  },
  fanfare: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 180, 0.07, 'triangle'), i * 110));
  },
};
