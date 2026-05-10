'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Canvas } from './Canvas';
import { Chat } from './Chat';
import { PlayerList } from './PlayerList';
import { RoomPill } from './RoomPill';
import { SoundToggle } from './SoundToggle';
import { Timer } from './Timer';
import { Toolbar } from './Toolbar';
import { WordPattern } from './WordPattern';
import { Button } from './ui/Button';
import { leaveRoom } from '@/lib/leave';
import { sfx } from '@/lib/sound';
import type { ChatMessage, HintReveal, Player, Room, Stroke, Tool } from '@/lib/types';
import { COLORS, BRUSH_SIZES } from '@/lib/constants';

/**
 * Tracks the visualViewport height on mobile. When the on-screen keyboard
 * opens, visualViewport.height shrinks while window.innerHeight does not —
 * so binding the room shell to this value (instead of dvh alone) keeps the
 * chat input glued just above the keyboard on every mobile browser.
 */
function useViewportHeight(): number | null {
  const [h, setH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const read = () => setH(vv ? vv.height : window.innerHeight);
    read();
    if (vv) {
      vv.addEventListener('resize', read);
      vv.addEventListener('scroll', read);
      return () => {
        vv.removeEventListener('resize', read);
        vv.removeEventListener('scroll', read);
      };
    }
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return h;
}

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
  const isDrawer = room.drawerId === meId;
  const canDraw = isDrawer && room.phase === 'drawing';
  const canChat = !!me && (!isDrawer || room.phase !== 'drawing');

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

  // Sound: blip when a player count drops (someone left). We compare against
  // the previous render's player ids and play once per disappearance, but
  // skip the very first render (otherwise rejoiners would hear it for ghosts).
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

  const viewportHeight = useViewportHeight();

  React.useEffect(() => {
    if (room.phase !== 'drawing') return;
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

  // On mobile we bind the shell height to the visual viewport, so the chat
  // input is always glued to the top edge of the keyboard. On lg+ we revert
  // to dvh so the layout doesn't twitch when desktop text-IME panels open.
  const [isLg, setIsLg] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsLg(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const shellStyle: React.CSSProperties =
    viewportHeight && !isLg ? { height: `${viewportHeight}px` } : {};

  return (
    <main
      className="mx-auto flex w-full max-w-6xl flex-col overflow-hidden px-2 pt-1.5 pb-1.5 sm:h-dvh sm:px-5 sm:pt-3 sm:pb-3"
      style={shellStyle}
    >
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border-2 border-ink bg-paper p-1.5 shadow-doodle-sm sm:p-2 sm:gap-3">
        <RoomPill code={room.code} className="shrink-0" />
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-ink-soft sm:inline">
            Round {room.round}/{room.settings.rounds}
          </span>
          <Timer
            endsAt={room.phaseEndsAt}
            totalSeconds={room.settings.drawTimeSeconds}
            onExpire={onTick}
          />
          <SoundToggle />
          <Button
            size="sm"
            variant="ghost"
            onClick={leave}
            disabled={leaving}
            loading={leaving}
            aria-label="Leave"
          >
            {!leaving && <LogOut className="h-4 w-4" />}
          </Button>
        </div>
        <div className="basis-full">
          <div className="flex items-center justify-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-ink-soft sm:hidden">
              R{room.round}/{room.settings.rounds}
            </span>
            <WordPattern
              pattern={room.wordPattern}
              reveals={hintReveals}
              isDrawer={isDrawer}
              word={room.word}
            />
          </div>
        </div>
      </div>

      {/* Mobile players strip — horizontal scroll, ultra-compact */}
      <div className="mt-1.5 shrink-0 lg:hidden">
        <PlayerList
          players={players}
          drawerId={room.drawerId}
          hostId={room.hostId}
          meId={meId}
          connectedIds={connectedIds}
          variant="strip"
        />
      </div>

      {/* Body — mobile: flex column with chat taking remaining height; lg: 3-col grid */}
      <div className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1.5 sm:mt-3 sm:gap-3 lg:grid lg:grid-cols-[220px_1fr_300px]">
        {/* Players (desktop only) */}
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

        {/* Canvas + toolbar */}
        <div className="flex shrink-0 flex-col gap-2 lg:order-2 lg:min-h-0">
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
          <div className="canvas-mobile-fit mx-auto w-full">
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
        </div>

        {/* Chat — mobile: flex-1 (fills remaining); lg: fixed height */}
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
