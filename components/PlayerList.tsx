'use client';
import { Crown, Loader2, MoreVertical, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Player } from '@/lib/types';
import { ConnectionDot } from './ConnectionDot';
import { AvatarSvg } from './AvatarPicker';

export function PlayerList({
  players,
  drawerId,
  hostId,
  meId,
  connectedIds,
  onKick,
  kickingId,
}: {
  players: Player[];
  drawerId: string | null;
  hostId: string | null;
  meId: string;
  connectedIds: Set<string>;
  onKick?: (id: string) => void;
  kickingId?: string | null;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
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
              p.hasGuessed && !isDrawer && 'bg-mint/40',
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
