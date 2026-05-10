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

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 font-display text-xl tracking-wide text-ink sm:text-3xl">
      {Array.from(display).map((ch, i) => {
        if (ch === ' ') return <span key={i} className="w-3" aria-hidden="true" />;
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
      {!isDrawer && pattern && (
        <span className="ml-2 hidden text-sm text-ink-soft sm:inline">
          {Array.from(pattern).filter((c) => c !== ' ' && c !== '?').length} letters
        </span>
      )}
    </div>
  );
}
