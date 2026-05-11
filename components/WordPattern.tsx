'use client';
import { cn } from '@/lib/utils';
import type { HintReveal } from '@/lib/types';

/**
 * Render either:
 *   - the actual word (drawer view)
 *   - the pattern with revealed letters (guesser view)
 *
 * Pattern is the server-side mask: '_' for unrevealed letter, ' ' for spaces,
 * '?' for hidden mode. We overlay revealed letters by index.
 */
export function WordPattern({
  pattern,
  reveals,
  isDrawer,
  word,
}: {
  pattern: string | null;
  reveals: HintReveal[];
  isDrawer: boolean;
  word: string | null;
}) {
  const display = isDrawer && word ? word : pattern ?? '';
  const revealMap = new Map(reveals.map((r) => [r.letterIndex, r.letter]));
  const letterCount = pattern
    ? Array.from(pattern).filter((c) => c !== ' ' && c !== '?').length
    : 0;

  return (
    <div className="flex min-w-0 flex-col items-center leading-tight">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft sm:text-xs">
        {isDrawer ? 'Draw this' : 'Guess this'}
      </span>
      <div className="flex flex-wrap items-end justify-center gap-1 font-display text-xl tracking-wide text-ink sm:text-3xl">
        {Array.from(display).map((ch, i) => {
          if (ch === ' ') return <span key={i} className="w-2 sm:w-3" aria-hidden="true" />;
          const revealed = isDrawer || ch !== '_' || revealMap.has(i);
          const out = isDrawer ? ch : ch === '_' ? (revealMap.get(i) ?? '_') : ch;
          return (
            <span
              key={i}
              className={cn(
                'inline-block min-w-[1ch] border-b-2 border-ink px-0.5 leading-none',
                revealed && !isDrawer && 'text-coral',
              )}
            >
              {out === '_' ? ' ' : out}
            </span>
          );
        })}
        {!isDrawer && letterCount > 0 && (
          <sub className="ml-0.5 self-end pb-0.5 font-sans text-[10px] tabular-nums text-ink-soft sm:text-xs">
            {letterCount}
          </sub>
        )}
      </div>
    </div>
  );
}
