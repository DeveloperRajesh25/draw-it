'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { Player, Room } from '@/lib/types';
import { AvatarSvg } from './AvatarPicker';

/**
 * Overlay shown over the canvas area at the end of a round. Lists every
 * player's points-this-round + total. The chrome around the canvas (top bar,
 * player strip, chat) stays mounted so the screen feels continuous.
 */
export function RoundEndOverlay({
  room,
  players,
}: {
  room: Room;
  players: Player[];
}) {
  const sorted = [...players].sort((a, b) => b.pointsThisRound - a.pointsThisRound);

  const [pastDue, setPastDue] = React.useState(false);
  React.useEffect(() => {
    setPastDue(false);
    if (!room.phaseEndsAt) return;
    const id = setInterval(() => {
      setPastDue(new Date(room.phaseEndsAt!).getTime() <= Date.now());
    }, 250);
    return () => clearInterval(id);
  }, [room.phaseEndsAt]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-linear-to-b from-ink/85 to-ink/95 px-4 py-5 text-paper backdrop-blur-sm sm:gap-4 sm:px-6">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex w-full max-w-md flex-col items-center gap-3 sm:gap-4"
      >
        <h2 className="font-display text-2xl text-paper sm:text-3xl">Round over</h2>
        {room.word && (
          <p className="text-center text-base sm:text-lg">
            The word was{' '}
            <span className="font-display text-2xl text-mustard sm:text-3xl">
              &ldquo;{room.word}&rdquo;
            </span>
          </p>
        )}
        <ul className="grid w-full gap-1.5">
          {sorted.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2.5 rounded-md border-2 border-paper/30 bg-paper/10 px-2.5 py-1.5"
            >
              <AvatarSvg avatar={p.avatar} size={28} />
              <span className="flex-1 truncate text-sm font-semibold sm:text-base">
                {p.name}
              </span>
              <span className="tabular-nums text-xs text-paper/70 sm:text-sm">
                {p.pointsThisRound > 0 ? `+${p.pointsThisRound}` : '0'}
              </span>
              <span className="w-12 text-right font-mono tabular-nums text-sm">
                {p.score}
              </span>
            </li>
          ))}
        </ul>
        {pastDue && (
          <div className="flex items-center justify-center gap-2 text-xs text-paper/70 sm:text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Starting next round&hellip;</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
