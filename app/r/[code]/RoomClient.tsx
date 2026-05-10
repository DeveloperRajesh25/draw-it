'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { GameEnd } from '@/components/GameEnd';
import { Game } from '@/components/Game';
import { JoinForm } from '@/components/JoinForm';
import { Lobby } from '@/components/Lobby';
import { RoundEnd } from '@/components/RoundEnd';
import { WordPick } from '@/components/WordPick';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { isValidRoomCode } from '@/lib/room-code';
import { getOrCreatePlayer, getSession, setSession } from '@/lib/identity';
import { useRoomStore } from '@/lib/store';
import { refetchRoomSnapshot, useRoom } from '@/lib/use-room';
import { sfx } from '@/lib/sound';

type Phase = 'boot' | 'rejoining' | 'joining' | 'in-room' | 'missing';

export default function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>('boot');
  const [playerId, setPlayerId] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  // Validate code shape
  React.useEffect(() => {
    if (!isValidRoomCode(code)) {
      setError('That room code looks off.');
      setPhase('missing');
    }
  }, [code]);

  // Boot path: try fast rejoin if session matches.
  React.useEffect(() => {
    if (phase !== 'boot' || !isValidRoomCode(code)) return;
    const player = getOrCreatePlayer();
    setPlayerId(player.id);
    const session = getSession();

    const tryRejoin = async () => {
      if (!session || session.roomCode !== code) {
        setPhase('joining');
        return;
      }
      setPhase('rejoining');
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/rejoin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: player.id }),
        });
        if (res.ok) {
          setSession({ roomCode: code, joinedAt: Date.now() });
          setPhase('in-room');
          return;
        }
        if (res.status === 404) {
          // Room or player vanished — fall through to fresh join form.
          setSession(null);
          setPhase('joining');
          return;
        }
        setPhase('joining');
      } catch {
        setPhase('joining');
      }
    };

    tryRejoin();
  }, [phase, code]);

  if (phase === 'missing') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5">
        <Card>
          <CardBody className="text-center">
            <p className="font-display text-3xl">Room not found</p>
            <p className="mt-1 text-ink-soft">
              {error ?? 'It might have closed, or the code is wrong.'}
            </p>
            <Button className="mt-4" onClick={() => router.push('/')}>
              Back home
            </Button>
          </CardBody>
        </Card>
      </main>
    );
  }

  if (phase === 'boot' || phase === 'rejoining') {
    return <BootScreen label={phase === 'rejoining' ? 'Rejoining…' : 'Connecting…'} />;
  }

  if (phase === 'joining') {
    return (
      <JoinForm
        code={code}
        onJoined={(pid) => {
          setPlayerId(pid);
          setPhase('in-room');
        }}
      />
    );
  }

  return <RoomShell code={code} playerId={playerId} onMissing={() => setPhase('joining')} />;
}

function RoomShell({
  code,
  playerId,
  onMissing,
}: {
  code: string;
  playerId: string;
  onMissing: () => void;
}) {
  useRoom(code, playerId);
  const state = useRoomStore((s) => s.state);
  const connectedIds = useRoomStore((s) => s.connectedIds);
  const router = useRouter();

  // Special sentinel for room-missing returned by use-room.
  React.useEffect(() => {
    if (state && (state as unknown as { __roomMissing?: boolean }).__roomMissing) {
      setSession(null);
      onMissing();
    }
  }, [state, onMissing]);

  // Sound on phase transitions. We compare the current phase against the
  // *previous* one so we can distinguish "game just started" (lobby → word-
  // pick) from "next round" (round-end → word-pick).
  const lastPhaseRef = React.useRef<string>('');
  React.useEffect(() => {
    const phase = state?.room?.phase;
    if (!phase) return;
    const prev = lastPhaseRef.current;
    if (prev && prev !== phase) {
      if (phase === 'round-end') sfx.roundEnd();
      else if (phase === 'game-end') sfx.fanfare();
      else if (phase === 'word-pick') {
        if (prev === 'lobby') sfx.gameStart();
        else sfx.wordPick();
      }
    }
    lastPhaseRef.current = phase;
  }, [state?.room?.phase]);

  // Heartbeat-driven tick debounce: never let multiple tick calls pile up.
  const tickInFlight = React.useRef(false);
  const tickLastFiredAt = React.useRef(0);
  const onTick = React.useCallback(() => {
    if (!state) return;
    if (tickInFlight.current) return;
    if (Date.now() - tickLastFiredAt.current < 600) return;
    tickInFlight.current = true;
    tickLastFiredAt.current = Date.now();
    fetch(`/api/rooms/${code}/tick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    })
      .then(async () => {
        // Server may have advanced the phase. Pull the new snapshot now —
        // don't wait for Postgres CDC + Realtime fanout (~hundreds of ms).
        await refetchRoomSnapshot(code, playerId);
      })
      .catch(() => {/* ignore */})
      .finally(() => {
        tickInFlight.current = false;
      });
  }, [code, playerId, state]);

  if (!state) return <BootScreen label="Loading room…" />;
  const me = state.players.find((p) => p.id === playerId);
  if (!me) {
    // Player row gone (kicked or expired). Drop out.
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5">
        <Card>
          <CardBody className="text-center">
            <p className="font-display text-3xl">You&rsquo;re no longer in this room</p>
            <p className="mt-1 text-ink-soft">You may have been removed.</p>
            <Button className="mt-4" onClick={() => router.push('/')}>
              Back home
            </Button>
          </CardBody>
        </Card>
      </main>
    );
  }

  const drawer = state.players.find((p) => p.id === state.room.drawerId) ?? null;

  switch (state.room.phase) {
    case 'lobby':
      return (
        <Lobby
          room={state.room}
          players={state.players}
          meId={playerId}
          connectedIds={connectedIds}
        />
      );
    case 'word-pick':
      return (
        <WordPick room={state.room} meId={playerId} drawer={drawer} onTick={onTick} />
      );
    case 'drawing':
      return (
        <Game
          room={state.room}
          players={state.players}
          strokes={state.strokes}
          chat={state.chat}
          hintReveals={state.hintReveals}
          meId={playerId}
          connectedIds={connectedIds}
          onTick={onTick}
        />
      );
    case 'round-end':
      return <RoundEnd room={state.room} players={state.players} onTick={onTick} />;
    case 'game-end':
      return (
        <GameEnd
          room={state.room}
          players={state.players}
          meId={playerId}
          onTick={onTick}
        />
      );
    default:
      return <BootScreen label="Loading…" />;
  }
}

function BootScreen({ label }: { label: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-5">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-ink border-t-transparent" />
        <p className="font-display text-2xl">{label}</p>
      </div>
    </main>
  );
}
