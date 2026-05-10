'use client';
import * as React from 'react';
import { Check, Copy, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RoomPill({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = React.useState<'code' | 'link' | null>(null);

  const onCopy = async (kind: 'code' | 'link') => {
    const value =
      kind === 'code'
        ? code
        : typeof window !== 'undefined'
          ? `${window.location.origin}/r/${code}`
          : `/r/${code}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore — older browsers */
    }
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button
        type="button"
        onClick={() => onCopy('code')}
        className="press-doodle inline-flex h-9 items-center gap-1.5 rounded-md border-2 border-ink bg-paper-dark px-2 font-mono text-xs font-semibold tracking-[0.18em] shadow-doodle-sm sm:px-3 sm:text-sm sm:tracking-[0.22em]"
        title="Copy code"
      >
        {code}
        {copied === 'code' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => onCopy('link')}
        className="press-doodle hidden h-9 items-center gap-1 rounded-md border-2 border-ink bg-paper px-2 text-sm font-semibold shadow-doodle-sm sm:inline-flex"
        title="Copy invite link"
      >
        {copied === 'link' ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
        <span className="hidden md:inline">Invite</span>
      </button>
    </div>
  );
}
