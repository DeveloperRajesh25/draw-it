'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Card, CardBody } from './ui/Card';
import { Timer } from './Timer';
import type { Player, Room } from '@/lib/types';
import { TIMING } from '@/lib/constants';
import { refetchRoomSnapshot } from '@/lib/use-room';

export function WordPick({
  room,
  meId,
  drawer,
  onTick,
}: {
  room: Room;
  meId: string;
  drawer: Player | null;
  onTick: () => void;
}) {
  const isDrawer = room.drawerId === meId;
  const [pickedIdx, setPickedIdx] = React.useState<number | null>(null);
  const busy = pickedIdx !== null;

  const select = async (idx: number) => {
    if (!isDrawer || busy) return;
    setPickedIdx(idx);
    try {
      const res = await fetch(`/api/rooms/${room.code}/select-word`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: meId, wordIndex: idx }),
      });
      if (res.ok) {
        // Don't wait for Realtime CDC — pull the new 'drawing' state now.
        await refetchRoomSnapshot(room.code, meId);
      } else {
        setPickedIdx(null);
      }
    } catch {
      setPickedIdx(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-5 py-8">
      <Card className="w-full">
        <CardBody className="flex flex-col items-center gap-5 p-8">
          <Timer endsAt={room.phaseEndsAt} totalSeconds={TIMING.WORD_PICK_SECONDS} onExpire={onTick} />
          {isDrawer ? (
            <>
              <h2 className="font-display text-3xl text-ink">Pick a word</h2>
              <div className="grid w-full gap-3 sm:grid-cols-3">
                {(room.wordOptions ?? []).map((w, i) => {
                  const isPicked = pickedIdx === i;
                  return (
                    <motion.button
                      key={w + i}
                      initial={{ y: 8, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      type="button"
                      onClick={() => select(i)}
                      disabled={busy}
                      aria-busy={isPicked || undefined}
                      className={`press-doodle relative rounded-xl border-2 border-ink px-4 py-6 text-center font-display text-2xl shadow-doodle transition ${
                        isPicked
                          ? 'bg-mustard'
                          : busy
                            ? 'bg-paper-dark/60 opacity-60'
                            : 'bg-paper-dark hover:bg-mustard'
                      }`}
                    >
                      {isPicked && (
                        <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin" />
                      )}
                      {w}
                    </motion.button>
                  );
                })}
              </div>
              <p className="text-sm text-ink-faint">If you don&rsquo;t pick, the first option is auto-selected.</p>
            </>
          ) : (
            <>
              <h2 className="font-display text-3xl text-ink">
                {drawer?.name ?? 'Someone'} is choosing…
              </h2>
              <div className="grid w-full gap-3 sm:grid-cols-3">
                {Array.from({ length: room.settings.wordCount }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-xl border-2 border-dashed border-ink/40 bg-paper-dark/40 px-4 py-6"
                  >
                    <div className="mx-auto h-3 w-2/3 animate-pulse rounded-full bg-ink/15" />
                  </div>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
