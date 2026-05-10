import 'server-only';
import wordsEn from '@/data/words/en.json';
import type { Room, WordMode } from './types';

const POOL_BY_LANG: Record<string, string[]> = {
  en: (wordsEn as { words: string[] }).words,
};

function basePool(language: string): string[] {
  return POOL_BY_LANG[language] ?? POOL_BY_LANG.en;
}

export function pickWordOptions(opts: {
  language: string;
  count: number;
  customWords: string[];
  useOnlyCustom: boolean;
  usedWords: string[];
  wordMode: WordMode;
}): string[] {
  const used = new Set(opts.usedWords.map((w) => w.toLowerCase()));
  const baseList = opts.useOnlyCustom
    ? opts.customWords
    : [...basePool(opts.language), ...opts.customWords];
  // unique, non-empty, not-yet-used
  const pool = [...new Set(baseList.map((w) => w.trim()).filter(Boolean))].filter(
    (w) => !used.has(w.toLowerCase()),
  );

  if (pool.length === 0) {
    // fall back: ignore "used" filter
    const fallback = [...new Set(baseList.map((w) => w.trim()).filter(Boolean))];
    return shuffle(fallback).slice(0, opts.count);
  }

  if (opts.wordMode === 'combination') {
    const out: string[] = [];
    const shuffled = shuffle(pool);
    for (let i = 0; i < opts.count; i++) {
      const a = shuffled[(i * 2) % shuffled.length];
      const b = shuffled[(i * 2 + 1) % shuffled.length];
      out.push(`${a} ${b}`.trim());
    }
    return out;
  }

  return shuffle(pool).slice(0, opts.count);
}

export function makeWordPattern(word: string, mode: WordMode = 'normal'): string {
  // Underscores for letters, spaces preserved.
  // Hidden mode produces all `?` and is intentionally less informative.
  return Array.from(word)
    .map((ch) => {
      if (ch === ' ') return ' ';
      if (mode === 'hidden') return '?';
      return '_';
    })
    .join('');
}

/**
 * Compute when each hint should reveal during the drawing phase.
 *
 * - Total reveals = min(settings.hints, floor(wordLetterCount / 2) - 1).
 * - Words ≤4 letters get 0 hints.
 * - Reveals spaced evenly across the drawing phase.
 * - Letter indices chosen at random from non-space positions.
 *
 * Returns:
 *   schedule: pure timing data — safe to expose to clients.
 *   pendingLetters: actual letters to reveal in order — server-only.
 */
export function buildHintSchedule(opts: {
  word: string;
  hintsRequested: number;
  drawTimeSeconds: number;
  startedAtMs: number;
}): {
  schedule: { revealAt: string; letterIndex: number }[];
  pendingLetters: { letterIndex: number; letter: string }[];
} {
  const word = opts.word;
  const letterCount = Array.from(word).filter((ch) => ch !== ' ').length;
  if (letterCount <= 4) {
    return { schedule: [], pendingLetters: [] };
  }
  const max = Math.max(0, Math.floor(letterCount / 2) - 1);
  const total = Math.max(0, Math.min(opts.hintsRequested, max));
  if (total === 0) return { schedule: [], pendingLetters: [] };

  const letterIndices: number[] = [];
  Array.from(word).forEach((ch, i) => {
    if (ch !== ' ') letterIndices.push(i);
  });
  const chosen = shuffle(letterIndices).slice(0, total).sort((a, b) => a - b);

  const schedule: { revealAt: string; letterIndex: number }[] = [];
  const pendingLetters: { letterIndex: number; letter: string }[] = [];
  // Reveal at evenly-spaced fractions of the way through the draw phase.
  // For 80s/2 hints: reveals at 33% and 66% elapsed (i.e. 27s & 53s in).
  for (let k = 0; k < total; k++) {
    const fraction = (k + 1) / (total + 1);
    const revealMs = opts.startedAtMs + fraction * opts.drawTimeSeconds * 1000;
    schedule.push({
      revealAt: new Date(revealMs).toISOString(),
      letterIndex: chosen[k],
    });
    pendingLetters.push({ letterIndex: chosen[k], letter: word[chosen[k]] });
  }
  return { schedule, pendingLetters };
}

export function applyRevealedLetters(
  pattern: string,
  reveals: { letterIndex: number; letter: string }[],
): string {
  const arr = Array.from(pattern);
  for (const r of reveals) {
    if (r.letterIndex >= 0 && r.letterIndex < arr.length) {
      arr[r.letterIndex] = r.letter;
    }
  }
  return arr.join('');
}

export function pickFirstWordOption(room: Pick<Room, 'wordOptions'>): string | null {
  const opts = room.wordOptions ?? [];
  return opts[0] ?? null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
