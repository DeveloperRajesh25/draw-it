'use client';
import { cn } from '@/lib/utils';

export function ConnectionDot({
  connected,
  inPresence,
  size = 'md',
}: {
  connected: boolean;
  inPresence: boolean;
  size?: 'sm' | 'md';
}) {
  const color = !connected
    ? 'bg-[hsl(0_70%_55%)]'
    : inPresence
      ? 'bg-[hsl(140_60%_45%)]'
      : 'bg-[hsl(42_85%_55%)]';
  const cls = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  const title = !connected
    ? 'Disconnected'
    : inPresence
      ? 'Online'
      : 'Reconnecting…';
  return <span className={cn('inline-block rounded-full', cls, color)} title={title} />;
}
