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
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => onCopy('code')}
        className="press-doodle inline-flex h-9 items-center gap-2 rounded-md border-2 border-ink bg-paper-dark px-3 font-mono text-base font-semibold tracking-[0.25em] shadow-doodle-sm"
        title="Copy code"
      >
        {code}
        {copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => onCopy('link')}
        className="press-doodle inline-flex h-9 items-center gap-1 rounded-md border-2 border-ink bg-paper px-2 text-sm font-semibold shadow-doodle-sm"
        title="Copy invite link"
      >
        {copied === 'link' ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
        <span className="hidden sm:inline">Invite</span>
      </button>
    </div>
  );
}
