'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Canvas } from './Canvas';
import { Chat } from './Chat';
import { PlayerList } from './PlayerList';
import { RoomPill } from './RoomPill';
import { RoundEndOverlay } from './RoundEnd';
import { SoundToggle } from './SoundToggle';
import { Timer } from './Timer';
import { Toolbar } from './Toolbar';
import { WordPattern } from './WordPattern';
import { WordPickOverlay } from './WordPick';
import { Button } from './ui/Button';
import { leaveRoom } from '@/lib/leave';
import { sfx } from '@/lib/sound';
import type { ChatMessage, HintReveal, Player, Room, Stroke, Tool } from '@/lib/types';
import { COLORS, BRUSH_SIZES, TIMING } from '@/lib/constants';

type Props = {
  room: Room;
  players: Player[];
  strokes: Stroke[];
  chat: ChatMessage[];
  hintReveals: HintReveal[];
  meId: string;
  connectedIds: Set<string>;
  drawer: Player | null;
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
  drawer,
  onTick,
}: Props) {
  const router = useRouter();
  const me = players.find((p) => p.id === meId);
  const isDrawer = room.drawerId === meId;
  const inDrawing = room.phase === 'drawing';
  const inWordPick = room.phase === 'word-pick';
  const inRoundEnd = room.phase === 'round-end';
  const canDraw = isDrawer && inDrawing;
  const canChat = !!me && (!isDrawer || !inDrawing);

  const [tool, setTool] = React.useState<Tool>('brush');
  const [color, setColor] = React.useState<string>(COLORS[1]); // default black
  const [size, setSize] = React.useState<number>(BRUSH_SIZES[1]);

  // Last reveal-hint trigger to debounce
  const lastRevealKey = React.useRef<string>('');

  // Sound: ding on each NEW correct-guess message that arrives.
  const seenCorrectIdsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const isFirstSeed = seenCorrectIdsRef.current.size === 0;
    let didAnyNew = false;
    for (const m of chat) {
      if (m.type !== 'correct-guess') continue;
      if (seenCorrectIdsRef.current.has(m.id)) continue;
      seenCorrectIdsRef.current.add(m.id);
      if (!isFirstSeed) didAnyNew = true;
    }
    if (didAnyNew) sfx.correctGuess();
  }, [chat]);

  // Sound: blip when a player count drops (someone left).
  const seenPlayerIdsRef = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    const next = new Set(players.map((p) => p.id));
    const prev = seenPlayerIdsRef.current;
    if (prev) {
      for (const id of prev) {
        if (!next.has(id)) {
          sfx.playerLeave();
          break;
        }
      }
    }
    seenPlayerIdsRef.current = next;
  }, [players]);

  React.useEffect(() => {
    if (!inDrawing) return;
    const id = setInterval(() => {
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
  }, [inDrawing, room.code, room.round, room.turnInRound, meId]);

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

  const [leaving, setLeaving] = React.useState(false);
  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    const { ok } = await leaveRoom({
      code: room.code,
      playerId: meId,
      totalPlayers: players.length,
    });
    if (!ok) {
      setLeaving(false);
      return;
    }
    router.push('/');
  };

  // Timer source-of-truth depends on phase. The bar shows a single timer that
  // re-syncs whenever the phase transitions.
  const timerTotal = inDrawing
    ? room.settings.drawTimeSeconds
    : inWordPick
      ? TIMING.WORD_PICK_SECONDS
      : TIMING.ROUND_END_SECONDS;

  return (
    <main className="game-shell mx-auto flex w-full max-w-6xl flex-col px-2 pt-2 pb-2 sm:px-4 sm:pt-3 sm:pb-3">
      {/* Header — single strip: timer/round on left, word pattern centered,
          sound + leave on right. Mirrors skribbl.io's compact top bar. */}
      <div className="flex shrink-0 items-center gap-2 rounded-lg border-2 border-ink bg-paper px-2 py-1.5 shadow-doodle-sm sm:gap-3 sm:px-3 sm:py-2">
        <div className="flex shrink-0 flex-col items-center leading-none">
          <Timer endsAt={room.phaseEndsAt} totalSeconds={timerTotal} onExpire={onTick} />
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft sm:text-[11px]">
            R{room.round}/{room.settings.rounds}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center px-1">
          {inDrawing ? (
            <WordPattern
              pattern={room.wordPattern}
              reveals={hintReveals}
              isDrawer={isDrawer}
              word={room.word}
            />
          ) : inRoundEnd && room.word ? (
            <span className="font-display text-xl text-ink sm:text-2xl">{room.word}</span>
          ) : (
            <span className="font-display text-lg text-ink-soft sm:text-xl">
              {inWordPick ? 'Choosing word…' : 'Get ready…'}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <RoomPill code={room.code} />
          <SoundToggle />
          <Button
            size="sm"
            variant="ghost"
            onClick={leave}
            disabled={leaving}
            loading={leaving}
            aria-label="Leave"
            className="px-2"
          >
            {!leaving && <LogOut className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Players strip — horizontal on mobile, sidebar on desktop. */}
      <div className="mt-1.5 shrink-0 sm:mt-2 lg:hidden">
        <PlayerList
          players={players}
          drawerId={room.drawerId}
          hostId={room.hostId}
          meId={meId}
          connectedIds={connectedIds}
          variant="strip"
        />
      </div>

      {/* Body — mobile: stacked; lg: 3-col grid */}
      <div className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1.5 sm:mt-2 sm:gap-2 lg:grid lg:grid-cols-[220px_1fr_300px] lg:gap-3">
        {/* Players sidebar (desktop only) */}
        <div className="hidden lg:order-1 lg:block lg:overflow-y-auto">
          <div className="lg:sticky lg:top-0">
            <PlayerList
              players={players}
              drawerId={room.drawerId}
              hostId={room.hostId}
              meId={meId}
              connectedIds={connectedIds}
            />
          </div>
        </div>

        {/* Canvas + toolbar block */}
        <div className="flex shrink-0 flex-col gap-1.5 sm:gap-2 lg:order-2 lg:min-h-0">
          {/* Toolbar — only when drawing. Reserve space so layout doesn't jump. */}
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
          {/* Canvas frame: sized purely from container width. The aspect ratio
              keeps the height proportional, and the keyboard opening on mobile
              never changes the width — so the canvas dimensions are fixed
              while typing. */}
          <div className="canvas-frame relative mx-auto w-full">
            <Canvas
              roomCode={room.code}
              strokes={strokes}
              canDraw={canDraw}
              tool={tool}
              color={color}
              size={size}
              onCommitStroke={onCommitStroke}
            />
            {inWordPick && (
              <WordPickOverlay room={room} meId={meId} drawer={drawer} />
            )}
            {inRoundEnd && (
              <RoundEndOverlay room={room} players={players} />
            )}
          </div>
        </div>

        {/* Chat — mobile: fills remaining height; lg: fixed-ish height column */}
        <div className="min-h-0 flex-1 lg:order-3 lg:h-[68dvh] lg:flex-none">
          <Chat
            messages={chat}
            meId={meId}
            meName={me?.name ?? 'You'}
            drawerId={room.drawerId}
            meHasGuessed={!!me?.hasGuessed}
            canChat={canChat}
            roomCode={room.code}
          />
        </div>
      </div>
    </main>
  );
}
