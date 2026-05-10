'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { sfx } from '@/lib/sound';

type Props = {
  endsAt: string | null;
  totalSeconds: number;
  // Called when the local clock hits 0. Caller debounces server calls.
  onExpire?: () => void;
  className?: string;
};

export function Timer({ endsAt, totalSeconds, onExpire, className }: Props) {
  const [now, setNow] = React.useState(() => Date.now());
  const lastFiredRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remainingMs = endsAt ? Math.max(0, new Date(endsAt).getTime() - now) : 0;
  const remaining = Math.ceil(remainingMs / 1000);

  const lastTickedRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!endsAt) return;
    if (remaining > 10 || remaining < 1) return;
    if (lastTickedRef.current === remaining) return;
    lastTickedRef.current = remaining;
    sfx.tick();
  }, [remaining, endsAt]);

  React.useEffect(() => {
    if (!endsAt) return;
    if (remainingMs > 0) return;
    if (lastFiredRef.current === endsAt) return;
    lastFiredRef.current = endsAt;
    // Small debounce to let races settle
    const t = setTimeout(() => onExpire?.(), 250);
    return () => clearTimeout(t);
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
