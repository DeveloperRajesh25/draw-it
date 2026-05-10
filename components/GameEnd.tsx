'use client';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Timer } from './Timer';
import type { Player, Room } from '@/lib/types';
import { AvatarSvg } from './AvatarPicker';
import { TIMING } from '@/lib/constants';

export function GameEnd({
  room,
  players,
  meId,
  onTick,
}: {
  room: Room;
  players: Player[];
  meId: string;
  onTick: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const isHost = room.hostId === meId;

  const playAgain = async () => {
    if (!isHost) return;
    // Force the lobby transition immediately, no need to wait for the timer.
    await fetch(`/api/rooms/${room.code}/tick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: meId }),
    });
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-5 py-8">
      <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-6 w-6 text-mustard" />
              <h2 className="font-display text-3xl">Game over</h2>
            </div>
            <Timer endsAt={room.phaseEndsAt} totalSeconds={TIMING.GAME_END_SECONDS} onExpire={onTick} />
          </CardHeader>
          <CardBody className="grid gap-4">
            <Podium players={sorted.slice(0, 3)} />
            <ul className="grid gap-2">
              {sorted.slice(3).map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-md border-2 border-ink bg-paper-dark px-3 py-2 shadow-doodle-sm"
                >
                  <span className="w-5 text-center text-sm text-ink-faint">{i + 4}</span>
                  <AvatarSvg avatar={p.avatar} size={32} />
                  <span className="flex-1 font-semibold">{p.name}</span>
                  <span className="tabular-nums">{p.score}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              {isHost && <Button onClick={playAgain}>Play again</Button>}
            </div>
          </CardBody>
        </Card>
      </motion.div>
    </main>
  );
}

function Podium({ players }: { players: Player[] }) {
  const [first, second, third] = players;
  const Block = ({ p, place, h, bg }: { p?: Player; place: 1 | 2 | 3; h: string; bg: string }) => {
    if (!p) return <div className="flex flex-col items-center" />;
    return (
      <div className="flex flex-col items-center">
        <div className="rounded-full border-2 border-ink bg-paper-dark p-1 shadow-doodle">
          <AvatarSvg avatar={p.avatar} size={56} />
        </div>
        <p className="mt-1 max-w-[6rem] truncate font-semibold">{p.name}</p>
        <p className="text-xs tabular-nums text-ink-soft">{p.score}</p>
        <div className={`mt-2 ${h} ${bg} flex w-20 items-center justify-center rounded-t-md border-2 border-ink shadow-doodle font-display text-3xl`}>
          {place}
        </div>
      </div>
    );
  };
  return (
    <div className="grid grid-cols-3 items-end gap-3">
      <Block p={second} place={2} h="h-16" bg="bg-paper-dark" />
      <Block p={first} place={1} h="h-24" bg="bg-mustard" />
      <Block p={third} place={3} h="h-12" bg="bg-paper-dark" />
    </div>
  );
}
