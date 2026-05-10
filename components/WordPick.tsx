'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { Player, Room } from '@/lib/types';
import { broadcastStateRefresh, refetchRoomSnapshot } from '@/lib/use-room';

/**
 * Overlay shown over the canvas area during the 'word-pick' phase. Drawer
 * picks a word; everyone else sees a "X is choosing…" placeholder. The
 * surrounding game chrome (top bar, players, chat) stays mounted so the
 * screen never feels like it left the room.
 */
export function WordPickOverlay({
  room,
  meId,
  drawer,
}: {
  room: Room;
  meId: string;
  drawer: Player | null;
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
        await refetchRoomSnapshot(room.code, meId);
        broadcastStateRefresh(room.code);
      } else {
        setPickedIdx(null);
      }
    } catch {
      setPickedIdx(null);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-lg bg-linear-to-b from-ink/85 to-ink/95 px-4 py-5 text-paper backdrop-blur-sm sm:gap-5 sm:px-6">
      {isDrawer ? (
        <>
          <h2 className="font-display text-2xl text-paper sm:text-3xl">Pick a word</h2>
          <div className="grid w-full max-w-md gap-2 sm:gap-3">
            {(room.wordOptions ?? []).map((w, i) => {
              const isPicked = pickedIdx === i;
              return (
                <motion.button
                  key={w + i}
                  initial={{ y: 6, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  type="button"
                  onClick={() => select(i)}
                  disabled={busy}
                  aria-busy={isPicked || undefined}
                  className={`press-doodle relative rounded-xl border-2 border-paper px-4 py-3.5 text-center font-display text-2xl shadow-doodle-sm transition sm:py-4 sm:text-3xl ${
                    isPicked
                      ? 'bg-mustard text-ink'
                      : busy
                        ? 'bg-paper/10 text-paper/60'
                        : 'bg-paper text-ink hover:bg-mustard'
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
          <p className="text-xs text-paper/70 sm:text-sm">
            If you don&rsquo;t pick, the first option is auto-selected.
          </p>
        </>
      ) : (
        <>
          <h2 className="text-center font-display text-2xl text-paper sm:text-3xl">
            {drawer?.name ?? 'Someone'} is choosing&hellip;
          </h2>
          <Loader2 className="h-7 w-7 animate-spin text-paper/80" />
        </>
      )}
    </div>
  );
}
