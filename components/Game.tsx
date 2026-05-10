'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, MessageSquare } from 'lucide-react';
import { Canvas } from './Canvas';
import { Chat } from './Chat';
import { PlayerList } from './PlayerList';
import { RoomPill } from './RoomPill';
import { SoundToggle } from './SoundToggle';
import { Timer } from './Timer';
import { Toolbar } from './Toolbar';
import { WordPattern } from './WordPattern';
import { Button } from './ui/Button';
import { setSession } from '@/lib/identity';
import { sfx } from '@/lib/sound';
import type { ChatMessage, HintReveal, Player, Room, Stroke, Tool } from '@/lib/types';
import { COLORS, BRUSH_SIZES } from '@/lib/constants';

type Props = {
  room: Room;
  players: Player[];
  strokes: Stroke[];
  chat: ChatMessage[];
  hintReveals: HintReveal[];
  meId: string;
  connectedIds: Set<string>;
  onTick: () => void;
};

export function Game({
  room,
  players,
  strokes,
  chat,
  hintReveals,
  meId,
  connectedIds,
  onTick,
}: Props) {
  const router = useRouter();
  const me = players.find((p) => p.id === meId);
  const drawer = players.find((p) => p.id === room.drawerId) ?? null;
  const isDrawer = room.drawerId === meId;
  const canDraw = isDrawer && room.phase === 'drawing';
  const canChat = !!me && (!isDrawer || room.phase !== 'drawing');

  const [tool, setTool] = React.useState<Tool>('brush');
  const [color, setColor] = React.useState<string>(COLORS[1]); // default black
  const [size, setSize] = React.useState<number>(BRUSH_SIZES[1]);
  const [chatOpenMobile, setChatOpenMobile] = React.useState(false);

  // Last reveal-hint trigger to debounce
  const lastRevealKey = React.useRef<string>('');

  // Sound: ding on each NEW correct-guess message that arrives.
  const seenCorrectIdsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    let didAnyNew = false;
    let firstSeed = seenCorrectIdsRef.current.size === 0;
    for (const m of chat) {
      if (m.type !== 'correct-guess') continue;
      if (seenCorrectIdsRef.current.has(m.id)) continue;
      seenCorrectIdsRef.current.add(m.id);
      if (!firstSeed) didAnyNew = true;
    }
    if (didAnyNew) sfx.correctGuess();
    firstSeed = false;
  }, [chat]);

  // Watch for hint reveals: any client whose local timer crosses a scheduled reveal
  // calls /reveal-hint. The server is the source of truth and dedupes via optimistic
  // locking; we just need to nudge it when the time passes.
  React.useEffect(() => {
    if (room.phase !== 'drawing') return;
    const id = setInterval(() => {
      // We don't have the schedule on the client (server hides it). Instead: if
      // the elapsed fraction has crossed a hint boundary that the server hasn't
      // revealed yet, nudge it. Cheap heuristic: poke once per second when in
      // drawing phase and let the server decide whether to act.
      const key = `${room.round}-${room.turnInRound}-${Math.floor(Date.now() / 5000)}`;
      if (key === lastRevealKey.current) return;
      lastRevealKey.current = key;
      fetch(`/api/rooms/${room.code}/reveal-hint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: meId }),
      }).catch(() => {/* ignore */});
    }, 1000);
    return () => clearInterval(id);
  }, [room.phase, room.code, room.round, room.turnInRound, meId]);

  const onCommitStroke = React.useCallback(
    async (s: { id: string; tool: Tool; color: string; size: number; points: number[] }) => {
      try {
        await fetch(`/api/rooms/${room.code}/strokes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: meId, ...s }),
        });
      } catch {/* ignore */}
    },
    [room.code, meId],
  );

  const onUndo = async () => {
    if (!canDraw) return;
    await fetch(`/api/rooms/${room.code}/strokes/last`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: meId }),
    });
  };

  const onClear = async () => {
    if (!canDraw) return;
    if (!window.confirm('Clear the canvas?')) return;
    await fetch(`/api/rooms/${room.code}/strokes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: meId }),
    });
  };

  const leave = async () => {
    setSession(null);
    fetch(`/api/rooms/${room.code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: meId }),
    }).catch(() => {/* ignore */});
    router.push('/');
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-3 pb-4 pt-3 sm:px-5 sm:pt-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-ink bg-paper p-2 shadow-doodle-sm">
        <RoomPill code={room.code} className="shrink-0" />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink-soft hidden sm:inline">
            Round {room.round}/{room.settings.rounds}
          </span>
          <Timer
            endsAt={room.phaseEndsAt}
            totalSeconds={room.settings.drawTimeSeconds}
            onExpire={onTick}
          />
          <SoundToggle />
          <button
            type="button"
            className="press-doodle inline-flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-paper-dark sm:hidden"
            aria-label="Toggle chat"
            onClick={() => setChatOpenMobile((v) => !v)}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          <Button size="sm" variant="ghost" onClick={leave} aria-label="Leave">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <div className="basis-full">
          <WordPattern
            pattern={room.wordPattern}
            reveals={hintReveals}
            isDrawer={isDrawer}
            word={room.word}
          />
        </div>
      </div>

      {/* Body */}
      <div className="mt-3 grid gap-3 lg:grid-cols-[220px_1fr_300px]">
        {/* Players */}
        <div className="order-2 lg:order-1">
          <div className="lg:sticky lg:top-3">
            <PlayerList
              players={players}
              drawerId={room.drawerId}
              hostId={room.hostId}
              meId={meId}
              connectedIds={connectedIds}
            />
          </div>
        </div>

        {/* Canvas + toolbar */}
        <div className="order-1 lg:order-2 space-y-2">
          {canDraw && (
            <Toolbar
              tool={tool}
              color={color}
              size={size}
              onTool={setTool}
              onColor={setColor}
              onSize={setSize}
              onUndo={onUndo}
              onClear={onClear}
            />
          )}
          <Canvas
            roomCode={room.code}
            strokes={strokes}
            canDraw={canDraw}
            tool={tool}
            color={color}
            size={size}
            onCommitStroke={onCommitStroke}
          />
        </div>

        {/* Chat */}
        <div className={`order-3 ${chatOpenMobile ? '' : 'hidden'} lg:block`}>
          <div className="h-[60dvh] lg:h-[68dvh]">
            <Chat
              messages={chat}
              meId={meId}
              drawerId={room.drawerId}
              meHasGuessed={!!me?.hasGuessed}
              canChat={canChat}
              roomCode={room.code}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
