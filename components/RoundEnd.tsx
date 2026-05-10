'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Timer } from './Timer';
import type { Player, Room } from '@/lib/types';
import { AvatarSvg } from './AvatarPicker';
import { TIMING } from '@/lib/constants';

export function RoundEnd({
  room,
  players,
  onTick,
}: {
  room: Room;
  players: Player[];
  onTick: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.pointsThisRound - a.pointsThisRound);

  // Tracks whether the local clock has crossed phase_ends_at — used to show
  // a "Next round starting…" hint while the server-side transition lands.
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
    <main className="mx-auto flex h-dvh max-w-2xl flex-col items-center justify-center overflow-hidden px-5 py-6">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-h-full overflow-y-auto">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="font-display text-3xl">Round over</h2>
            <Timer endsAt={room.phaseEndsAt} totalSeconds={TIMING.ROUND_END_SECONDS} onExpire={onTick} />
          </CardHeader>
          <CardBody className="grid gap-4">
            {room.word && (
              <p className="text-center text-lg">
                The word was{' '}
                <span className="font-display text-3xl text-coral">&ldquo;{room.word}&rdquo;</span>
              </p>
            )}
            <ul className="grid gap-2">
              {sorted.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-md border-2 border-ink bg-paper-dark px-3 py-2 shadow-doodle-sm"
                >
                  <AvatarSvg avatar={p.avatar} size={36} />
                  <span className="flex-1 font-semibold">{p.name}</span>
                  <span className="tabular-nums text-ink-soft">
                    {p.pointsThisRound > 0 ? `+${p.pointsThisRound}` : '0'}
                  </span>
                  <span className="w-14 text-right tabular-nums font-mono">{p.score}</span>
                </li>
              ))}
            </ul>
            {pastDue && (
              <div className="flex items-center justify-center gap-2 text-sm text-ink-soft">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Starting next round…</span>
              </div>
            )}
          </CardBody>
        </Card>
      </motion.div>
    </main>
  );
}
