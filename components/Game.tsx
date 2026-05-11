'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Canvas } from './Canvas';
import { ChatInput, ChatList, useChat } from './Chat';
import { PlayerList } from './PlayerList';
import { RoundEndOverlay } from './RoundEnd';
import { SettingsMenu } from './SettingsMenu';
import { Timer } from './Timer';
import { Toolbar } from './Toolbar';
import { WordPattern } from './WordPattern';
import { WordPickOverlay } from './WordPick';
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
  chat: chatMessages,
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

  const lastRevealKey = React.useRef<string>('');

  // Chat audio: track which message IDs we've seen, then fire the right
  // sound for any newly-arrived ones. Done in one pass so a single tick
  // produces at most one correct-guess + one chat-receive.
  const seenChatIdsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const isFirstSeed = seenChatIdsRef.current.size === 0;
    let didCorrect = false;
    let didReceive = false;
    for (const m of chatMessages) {
      if (seenChatIdsRef.current.has(m.id)) continue;
      seenChatIdsRef.current.add(m.id);
      if (isFirstSeed) continue;
      if (m.type === 'correct-guess') didCorrect = true;
      else if (m.type === 'normal' && m.playerId !== meId) didReceive = true;
    }
    if (didCorrect) sfx.correctGuess();
    else if (didReceive) sfx.chatReceive();
  }, [chatMessages, meId]);

  // Player join/leave audio: compare current player IDs against last tick.
  const seenPlayerIdsRef = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    const next = new Set(players.map((p) => p.id));
    const prev = seenPlayerIdsRef.current;
    if (prev) {
      let joined = false;
      let left = false;
      for (const id of next) if (!prev.has(id)) joined = true;
      for (const id of prev) if (!next.has(id)) left = true;
      if (joined) sfx.playerJoin();
      if (left) sfx.playerLeave();
    }
    seenPlayerIdsRef.current = next;
  }, [players]);

  // Hint reveals: ping when a new letter appears.
  const seenHintCountRef = React.useRef<number>(-1);
  React.useEffect(() => {
    if (seenHintCountRef.current >= 0 && hintReveals.length > seenHintCountRef.current) {
      sfx.hint();
    }
    seenHintCountRef.current = hintReveals.length;
  }, [hintReveals]);

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
    sfx.undo();
    await fetch(`/api/rooms/${room.code}/strokes/last`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: meId }),
    });
  };

  const onClear = async () => {
    if (!canDraw) return;
    if (!window.confirm('Clear the canvas?')) return;
    sfx.clear();
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

  const timerTotal = inDrawing
    ? room.settings.drawTimeSeconds
    : inWordPick
      ? TIMING.WORD_PICK_SECONDS
      : TIMING.ROUND_END_SECONDS;

  const chatState = useChat({
    meId,
    meName: me?.name ?? 'You',
    meHasGuessed: !!me?.hasGuessed,
    canChat,
    roomCode: room.code,
  });

  // Lock the page so it can't scroll while in-game. The game shell is a
  // fixed-height container; chat scrolling happens inside its own list.
  React.useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  // Keyboard inset: with `interactive-widget=overlays-content`, the on-screen
  // keyboard overlays the page without resizing the layout viewport. We
  // measure the gap between the layout viewport and the visual viewport and
  // expose it as a CSS variable so the chat input can translate above the
  // keyboard while everything else stays put.
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--keyboard-inset', `${inset}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--keyboard-inset');
    };
  }, []);

  return (
    <main className="game-shell relative mx-auto flex w-full max-w-6xl flex-col sm:px-4 sm:pt-3 sm:pb-3">
      {/* Header strip: timer (left) | word + label (center) | settings (right).
          Edge-to-edge on mobile (bottom border only); rounded card on sm+. */}
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-ink bg-paper px-2 py-1.5 sm:gap-3 sm:rounded-lg sm:border-2 sm:px-3 sm:py-2 sm:shadow-doodle-sm">
        <div className="flex shrink-0 flex-col items-center leading-none">
          <Timer endsAt={room.phaseEndsAt} totalSeconds={timerTotal} onExpire={onTick} />
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft sm:text-[11px]">
            Round {room.round} of {room.settings.rounds}
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
            <div className="flex flex-col items-center leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft sm:text-xs">
                The word was
              </span>
              <span className="font-display text-xl text-ink sm:text-2xl">{room.word}</span>
            </div>
          ) : (
            <span className="font-display text-lg text-ink-soft sm:text-xl">
              {inWordPick ? 'Choosing word…' : 'Get ready…'}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          <SettingsMenu roomCode={room.code} onLeave={leave} leaving={leaving} />
        </div>
      </div>

      {/* Body — mobile: canvas top, then edge-to-edge players+chat-list row.
          The chat input is a fixed-position sibling pinned to the viewport
          bottom (see below), so we reserve a `pb-11` band here on mobile so
          the chat list doesn't sit behind it. lg: 3-col grid (players
          sidebar | canvas | chat sidebar) — input lives inside the chat
          column on desktop, no reserved space needed. */}
      <div className="flex min-h-0 flex-1 flex-col pb-11 sm:mt-2 sm:gap-2 lg:grid lg:grid-cols-[220px_1fr_300px] lg:gap-3 lg:pb-0">
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

        {/* Mobile/tablet bottom row: players | chat-list with a single
            divider. On sm+ the negative margin cancels main's `sm:px-4` so
            it touches screen edges. */}
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden border-t-2 border-ink sm:-mx-4 lg:hidden">
          <div className="scrollbar-doodle min-h-0 w-2/5 max-w-[40%] shrink-0 overflow-y-auto border-r-2 border-ink bg-paper">
            <PlayerList
              players={players}
              drawerId={room.drawerId}
              hostId={room.hostId}
              meId={meId}
              connectedIds={connectedIds}
              variant="compact"
            />
          </div>
          <div className="relative min-h-0 min-w-0 flex-1 bg-paper">
            <ChatList
              messages={chatMessages}
              meId={meId}
              className="absolute inset-0"
            />
          </div>
        </div>

        {/* Desktop chat column (list + input stacked, bordered). */}
        <div className="hidden min-h-0 overflow-hidden rounded-lg border-2 border-ink bg-paper shadow-doodle-sm lg:order-3 lg:flex lg:h-[68dvh] lg:flex-col">
          <ChatList messages={chatMessages} meId={meId} />
          <ChatInput chat={chatState} className="border-t-2 border-ink" />
        </div>
      </div>

      {/* Mobile chat input — pinned to the viewport bottom, independent of
          the in-flow layout above. Translates above the keyboard via the
          `.chat-input-bar` class driven by --keyboard-inset. */}
      <ChatInput
        chat={chatState}
        className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink lg:hidden"
      />
    </main>
  );
}
