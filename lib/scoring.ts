import { SCORING } from './constants';

export function guesserPoints(opts: {
  timeRemaining: number;     // seconds left when they guessed
  totalDrawTime: number;     // total draw seconds for this turn
  guessOrder: number;        // 1 = first
  totalGuessers: number;     // non-drawer count
}): number {
  const totalGuessers = Math.max(1, opts.totalGuessers);
  const timeFraction = clamp(opts.timeRemaining / opts.totalDrawTime, 0, 1);
  const orderFraction = clamp(1 - (opts.guessOrder - 1) / totalGuessers, 0, 1);
  const weight = 0.6 * timeFraction + 0.4 * orderFraction;
  let pts =
    SCORING.MIN_GUESS_POINTS +
    Math.floor(weight * (SCORING.MAX_GUESS_POINTS - SCORING.MIN_GUESS_POINTS));
  if (opts.guessOrder === 1) pts += SCORING.FIRST_GUESS_BONUS;
  return pts;
}

export function drawerPoints(opts: {
  correctCount: number;
  totalGuessers: number;
  averageGuessTimeFraction: number; // 0..1
}): number {
  if (opts.correctCount === 0) return 0;
  const avg = clamp(opts.averageGuessTimeFraction, 0, 1);
  return Math.floor(SCORING.DRAWER_PER_GUESS * opts.correctCount * (0.5 + 0.5 * avg));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
