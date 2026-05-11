'use client';
import * as React from 'react';
import {
  Check,
  Copy,
  Link as LinkIcon,
  Loader2,
  LogOut,
  Settings,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getSoundEnabled, setSoundEnabled } from '@/lib/identity';

type Props = {
  roomCode: string;
  onLeave: () => void | Promise<void>;
  leaving: boolean;
};

export function SettingsMenu({ roomCode, onLeave, leaving }: Props) {
  const [open, setOpen] = React.useState(false);
  const [soundOn, setSoundOn] = React.useState(true);
  const [copied, setCopied] = React.useState<'code' | 'link' | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setSoundOn(getSoundEnabled());
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const flipSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const copy = async (kind: 'code' | 'link') => {
    const value =
      kind === 'code'
        ? roomCode
        : typeof window !== 'undefined'
          ? `${window.location.origin}/r/${roomCode}`
          : `/r/${roomCode}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="press-doodle inline-flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-paper-dark shadow-doodle-sm"
        aria-label="Settings"
        aria-expanded={open}
        title="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 w-60 rounded-lg border-2 border-ink bg-paper p-2 shadow-doodle"
        >
          <div className="px-1 pb-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              Room
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => copy('code')}
                className="press-doodle inline-flex h-9 flex-1 items-center justify-between gap-2 rounded-md border-2 border-ink bg-paper-dark px-2 font-mono text-sm font-semibold tracking-[0.18em]"
                title="Copy code"
              >
                <span>{roomCode}</span>
                {copied === 'code' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => copy('link')}
                className="press-doodle inline-flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-paper"
                title="Copy invite link"
                aria-label="Copy invite link"
              >
                {copied === 'link' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <LinkIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <div className="my-1 h-px bg-ink/15" />
          <button
            type="button"
            onClick={flipSound}
            role="menuitemcheckbox"
            aria-checked={soundOn}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-ink/5"
          >
            <span className="flex items-center gap-2">
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              Sound
            </span>
            <span
              className={
                'inline-flex h-5 w-9 items-center rounded-full border-2 border-ink px-0.5 ' +
                (soundOn ? 'bg-mint justify-end' : 'bg-paper-dark justify-start')
              }
            >
              <span className="h-3 w-3 rounded-full bg-ink" />
            </span>
          </button>
          <div className="my-1 h-px bg-ink/15" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void onLeave();
            }}
            disabled={leaving}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-[hsl(0_70%_45%)] hover:bg-ink/5 disabled:opacity-60"
          >
            {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Leave room
          </button>
        </div>
      )}
    </div>
  );
}
