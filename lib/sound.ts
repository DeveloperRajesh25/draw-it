'use client';
import { getSoundEnabled } from './identity';

let _ctx: AudioContext | null = null;
let _master: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_ctx) return _ctx;
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();

    // Master chain: gain → compressor → destination. Lets us push volumes
    // hard without clipping the speaker.
    const master = ctx.createGain();
    master.gain.value = 1.0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.knee.value = 6;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.06;
    master.connect(comp).connect(ctx.destination);

    _ctx = ctx;
    _master = master;
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  durationMs: number,
  volume = 0.6,
  type: OscillatorType = 'sine',
  delayMs = 0,
) {
  if (!getSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx || !_master) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {/* ignore */});
  const start = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain).connect(_master);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, start + durationMs / 1000);
  osc.start(start);
  osc.stop(start + durationMs / 1000 + 0.05);
}

function chord(freqs: number[], durationMs: number, volume = 0.5, type: OscillatorType = 'triangle') {
  freqs.forEach((f) => tone(f, durationMs, volume / Math.sqrt(freqs.length), type));
}

export const sfx = {
  // Generic UI click — short, crisp.
  click: () => tone(820, 30, 0.45, 'square'),

  // Last-10s countdown blip.
  tick: () => tone(760, 70, 0.55, 'square'),

  // Correct guess: three rising notes, celebratory.
  correctGuess: () => {
    tone(660, 90, 0.75, 'triangle');
    tone(880, 110, 0.75, 'triangle', 80);
    tone(1320, 160, 0.7, 'triangle', 180);
  },

  // Close guess (sender-only): warm "almost" ping.
  closeGuess: () => {
    tone(560, 90, 0.55, 'sine');
    tone(620, 110, 0.45, 'sine', 60);
  },

  // Next round word-pick begins (ascending two-note).
  wordPick: () => {
    tone(523, 110, 0.65, 'triangle');
    tone(784, 140, 0.65, 'triangle', 110);
  },

  // Drawer picked a word — high chirp transitioning to drawing.
  wordPicked: () => {
    tone(880, 70, 0.6, 'triangle');
    tone(1175, 110, 0.6, 'triangle', 60);
  },

  // Game start: bright ascending fanfare (3 notes).
  gameStart: () => {
    [523, 659, 880].forEach((f, i) => tone(f, 170, 0.75, 'triangle', i * 90));
  },

  // Round end: descending two-note.
  roundEnd: () => {
    tone(440, 150, 0.65, 'sine');
    tone(330, 220, 0.55, 'sine', 100);
  },

  // Game end / podium: 5-note ascending fanfare with chord finish.
  fanfare: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 180, 0.75, 'triangle', i * 100));
    chord([523, 659, 784, 1047], 400, 0.6, 'triangle');
    // delayed chord
    setTimeout(() => chord([523, 659, 784, 1047], 350, 0.55, 'triangle'), 450);
  },

  // Player joined: quick "blip-up".
  playerJoin: () => {
    tone(620, 70, 0.55, 'triangle');
    tone(820, 100, 0.55, 'triangle', 60);
  },

  // Player left: descending sawtooth.
  playerLeave: () => {
    tone(420, 90, 0.55, 'sawtooth');
    tone(280, 160, 0.5, 'sawtooth', 80);
  },

  // Hint letter revealed — soft high ping.
  hint: () => tone(1320, 70, 0.45, 'sine'),

  // Outgoing chat message (own send).
  chatSend: () => tone(900, 40, 0.4, 'sine'),

  // Incoming chat message (others).
  chatReceive: () => tone(680, 50, 0.35, 'sine'),

  // Undo last stroke.
  undo: () => {
    tone(500, 50, 0.45, 'triangle');
    tone(380, 80, 0.4, 'triangle', 40);
  },

  // Clear canvas.
  clear: () => {
    tone(300, 60, 0.5, 'square');
    tone(200, 90, 0.45, 'square', 60);
  },

  // Stroke commit (pen tap) — kept subtle to avoid spamming.
  stroke: () => tone(180, 18, 0.18, 'sine'),
};
