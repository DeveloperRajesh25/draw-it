'use client';
import * as React from 'react';
import { Check, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RoomPill({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);

  const onInvite = async () => {
    const value =
      typeof window !== 'undefined'
        ? `${window.location.origin}/r/${code}`
        : `/r/${code}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore — older browsers */
    }
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span
        className="inline-flex h-9 items-center rounded-md border-2 border-ink bg-paper-dark px-2 font-mono text-xs font-semibold tracking-[0.18em] sm:px-3 sm:text-sm sm:tracking-[0.22em]"
        title="Room code"
      >
        {code}
      </span>
      <button
        type="button"
        onClick={onInvite}
        className="press-doodle inline-flex h-9 items-center gap-1.5 rounded-md border-2 border-ink bg-paper px-2.5 text-sm font-semibold shadow-doodle-sm sm:px-3"
        title="Copy invite link"
      >
        {copied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
        <span>{copied ? 'Copied!' : 'Invite'}</span>
      </button>
    </div>
  );
}
