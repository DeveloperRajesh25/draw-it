'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { Card, CardBody } from './ui/Card';
import { Button } from './ui/Button';
import { Timer } from './Timer';
import type { Player, Room } from '@/lib/types';
import { TIMING } from '@/lib/constants';

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
  const [busy, setBusy] = React.useState(false);

  const select = async (idx: number) => {
    if (!isDrawer || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/rooms/${room.code}/select-word`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: meId, wordIndex: idx }),
      });
    } finally {
      setBusy(false);
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
                {(room.wordOptions ?? []).map((w, i) => (
                  <motion.button
                    key={w + i}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    type="button"
                    onClick={() => select(i)}
                    disabled={busy}
                    className="press-doodle rounded-xl border-2 border-ink bg-paper-dark px-4 py-6 text-center font-display text-2xl shadow-doodle hover:bg-mustard"
                  >
                    {w}
                  </motion.button>
                ))}
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
