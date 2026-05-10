'use client';
import { Crown, Loader2, MoreVertical, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Player } from '@/lib/types';
import { ConnectionDot } from './ConnectionDot';
import { AvatarSvg } from './AvatarPicker';

type Variant = 'list' | 'strip';

export function PlayerList({
  players,
  drawerId,
  hostId,
  meId,
  connectedIds,
  onKick,
  kickingId,
  variant = 'list',
}: {
  players: Player[];
  drawerId: string | null;
  hostId: string | null;
  meId: string;
  connectedIds: Set<string>;
  onKick?: (id: string) => void;
  kickingId?: string | null;
  variant?: Variant;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  if (variant === 'strip') {
    return (
      <ul className="scrollbar-doodle flex gap-1 overflow-x-auto pb-0.5">
        {sorted.map((p, i) => {
          const isMe = p.id === meId;
          const isHost = p.id === hostId;
          const isDrawer = p.id === drawerId;
          return (
            <li
              key={p.id}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-md border-2 border-ink bg-paper px-1.5 py-0.5 shadow-doodle-sm',
                isDrawer && 'bg-mustard',
                p.hasGuessed && !isDrawer && 'bg-mint/60',
                !p.connected && 'opacity-60',
              )}
            >
              <span className="font-mono text-[9px] text-ink-soft">#{i + 1}</span>
              <div className="rounded-full border border-ink bg-paper-dark p-px">
                <AvatarSvg avatar={p.avatar} size={16} />
              </div>
              <div className="flex min-w-0 flex-col leading-none">
                <div className="flex items-center gap-0.5">
                  <span className="max-w-16 truncate text-[10px] font-semibold">
                    {p.name}
                    {isMe && <span className="ml-0.5 text-ink-faint">(you)</span>}
                  </span>
                  {isHost && <Crown className="h-2.5 w-2.5 text-mustard" aria-label="Host" />}
                  {isDrawer && <Pencil className="h-2.5 w-2.5" aria-label="Drawing" />}
                </div>
                <span className="text-[9px] tabular-nums text-ink-soft">
                  {p.score}
                  {p.pointsThisRound > 0 && (
                    <span className="ml-0.5 text-[hsl(140_60%_30%)]">+{p.pointsThisRound}</span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((p, i) => {
        const isMe = p.id === meId;
        const isHost = p.id === hostId;
        const isDrawer = p.id === drawerId;
        const isOnline = connectedIds.has(p.id);
        return (
          <li
            key={p.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border-2 border-ink bg-paper p-2 shadow-doodle-sm',
              isDrawer && 'bg-mustard',
              p.hasGuessed && !isDrawer && 'bg-mint/60',
              !p.connected && 'opacity-60',
            )}
          >
            <span className="w-5 text-center font-mono text-sm text-ink-soft">{i + 1}</span>
            <div className="rounded-full border-2 border-ink bg-paper-dark p-0.5">
              <AvatarSvg avatar={p.avatar} size={32} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold">
                  {p.name}
                  {isMe && <span className="ml-1 text-ink-faint">(you)</span>}
                </span>
                {isHost && <Crown className="h-3.5 w-3.5 text-mustard" aria-label="Host" />}
                {isDrawer && <Pencil className="h-3.5 w-3.5" aria-label="Drawing" />}
                <ConnectionDot connected={p.connected} inPresence={isOnline} size="sm" />
              </div>
              <div className="text-xs tabular-nums text-ink-soft">
                {p.score} pts
                {p.pointsThisRound > 0 && (
                  <span className="ml-1 text-[hsl(140_60%_35%)]">+{p.pointsThisRound}</span>
                )}
              </div>
            </div>
            {onKick && hostId === meId && !isMe && (
              <button
                type="button"
                onClick={() => onKick(p.id)}
                disabled={kickingId === p.id}
                className="press-doodle rounded-md border border-ink/40 p-1 text-ink-soft hover:bg-ink/5 disabled:opacity-50"
                aria-label={`Kick ${p.name}`}
                aria-busy={kickingId === p.id || undefined}
                title="Kick"
              >
                {kickingId === p.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </button>
            )}
            {!onKick && (
              <span className="opacity-0">
                <MoreVertical className="h-4 w-4" />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
