'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { sfx } from '@/lib/sound';

type Props = {
  endsAt: string | null;
  totalSeconds: number;
  /**
   * Called when the local clock has hit 0. The Timer keeps re-firing every
   * ~2.5s while still past-due, so a transient network failure on the first
   * tick won't strand the room (the next attempt advances).
   * Caller should debounce server calls of its own.
   */
  onExpire?: () => void;
  className?: string;
};

const FIRE_GATE_MS = 2500;

export function Timer({ endsAt, totalSeconds, onExpire, className }: Props) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remainingMs = endsAt ? Math.max(0, new Date(endsAt).getTime() - now) : 0;
  const remaining = Math.ceil(remainingMs / 1000);

  // Tick sound during the last 10 seconds.
  const lastTickedRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!endsAt) return;
    if (remaining > 10 || remaining < 1) return;
    if (lastTickedRef.current === remaining) return;
    lastTickedRef.current = remaining;
    sfx.tick();
  }, [remaining, endsAt]);

  // Fire-gate: reset whenever endsAt changes (new phase = fresh debounce window).
  const lastFireAtRef = React.useRef<number>(0);
  React.useEffect(() => {
    lastFireAtRef.current = 0;
    lastTickedRef.current = null;
  }, [endsAt]);

  // Fire onExpire while past-due, at most every FIRE_GATE_MS. This effect
  // re-runs every 250ms because `remainingMs` changes with the now-tick, so
  // it naturally retries if the previous attempt didn't transition the room.
  React.useEffect(() => {
    if (!endsAt) return;
    if (remainingMs > 0) return;
    const t = Date.now();
    if (t - lastFireAtRef.current < FIRE_GATE_MS) return;
    lastFireAtRef.current = t;
    onExpire?.();
  }, [endsAt, remainingMs, onExpire]);

  const pct = Math.min(1, Math.max(0, totalSeconds > 0 ? remainingMs / 1000 / totalSeconds : 0));
  const danger = remaining <= 10;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative h-9 w-9">
        <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="hsl(var(--ink) / 0.15)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={danger ? 'hsl(0 70% 55%)' : 'hsl(var(--ink))'}
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 15}`}
            strokeDashoffset={`${(1 - pct) * 2 * Math.PI * 15}`}
            strokeLinecap="round"
          />
        </svg>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums',
            danger && 'text-[hsl(0_70%_45%)]',
          )}
        >
          {endsAt ? remaining : '–'}
        </span>
      </div>
    </div>
  );
}
