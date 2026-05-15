'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Play, Share2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, CardBody } from './ui/Card';
import { Input } from './ui/Input';
import { PlayerList } from './PlayerList';
import { RoomPill } from './RoomPill';
import { ChatInput, useChat } from './Chat';
import type { Player, Room, RoomSettings, WordMode } from '@/lib/types';
import { SETTINGS_LIMITS } from '@/lib/constants';
import { leaveRoom } from '@/lib/leave';
import { broadcastStateRefresh, refetchRoomSnapshot } from '@/lib/use-room';

type Props = {
  room: Room;
  players: Player[];
  meId: string;
  connectedIds: Set<string>;
};

export function Lobby({ room, players, meId, connectedIds }: Props) {
  const router = useRouter();
  const isHost = room.hostId === meId;
  const me = players.find((p) => p.id === meId);
  const [busy, setBusy] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [kickingId, setKickingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const chat = useChat({
    meId,
    meName: me?.name || 'You',
    meHasGuessed: true,
    canChat: true,
    isPossibleGuess: false,
    roomCode: room.code,
  });

  const startGame = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${room.code}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: meId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Could not start');
        setBusy(false);
        return;
      }
      await refetchRoomSnapshot(room.code, meId);
      broadcastStateRefresh(room.code);
    } catch {
      setError('Could not start');
      setBusy(false);
    }
  };

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
    broadcastStateRefresh(room.code);
    router.push('/');
  };

  const kick = async (id: string) => {
    if (kickingId) return;
    setKickingId(id);
    try {
      await fetch(`/api/rooms/${room.code}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: meId, targetId: id }),
      });
      broadcastStateRefresh(room.code);
    } finally {
      setKickingId(null);
    }
  };

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/?code=${room.code}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="mx-auto h-screen max-w-md px-4 py-3 flex flex-col">
      {/* Header with room code */}
      <div className="mb-3 shrink-0">
        <h1 className="font-display text-2xl text-ink mb-1">WAITING</h1>
        <RoomPill code={room.code} />
      </div>

      {/* Settings Panel - Always visible */}
      <Card className="mb-3 shrink-0 shadow-none border-ink">
        <CardBody className="py-3">
          <SettingsView
            roomCode={room.code}
            settings={room.settings}
            isHost={isHost}
            meId={meId}
            expanded={true}
          />
        </CardBody>
      </Card>

      {/* Players Section */}
      <div className="mb-3 grow overflow-hidden flex flex-col min-h-0">
        <h2 className="font-display text-sm text-ink mb-1.5 shrink-0">Players ({players.length})</h2>
        <Card className="grow flex flex-col min-h-0 shadow-none border-ink">
          <CardBody className="grow overflow-y-auto py-2 px-2">
            <PlayerList
              players={players}
              drawerId={null}
              hostId={room.hostId}
              meId={meId}
              connectedIds={connectedIds}
              onKick={isHost ? kick : undefined}
              kickingId={kickingId}
              variant="compact"
            />
          </CardBody>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="mb-2 flex gap-1.5 shrink-0">
        <Button
          onClick={copyInviteLink}
          variant="accent"
          size="lg"
          className="flex-1 text-xs h-9"
        >
          <Share2 className="h-3.5 w-3.5" />
          {copied ? 'Copied!' : 'Invite'}
        </Button>
        {isHost && (
          <Button
            onClick={startGame}
            disabled={busy || players.length < 2}
            loading={busy}
            size="lg"
            variant="accent"
            className="flex-1 text-xs h-9"
          >
            {!busy && <Play className="h-3.5 w-3.5" />}
            {busy ? 'Starting…' : 'Start'}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={leave}
          disabled={leaving}
          loading={leaving}
          className="flex-1 text-xs h-9"
        >
          {leaving ? 'Leaving…' : 'Leave'}
        </Button>
      </div>

      {/* Chat Area */}
      <Card className="shrink-0 shadow-none border-ink">
        <CardBody className="p-0">
          <ChatInput
            chat={chat}
            className="rounded-b-lg"
            placeholder={chat.canChat ? 'Type your message here...' : 'Chat is locked'}
          />
        </CardBody>
      </Card>

      {error && (
        <div className="mt-2 rounded-md bg-[hsl(0_70%_60%)] p-2 text-sm text-white">
          {error}
        </div>
      )}
    </main>
  );
}

function SettingsView({
  roomCode,
  settings,
  isHost,
  meId,
  expanded,
}: {
  roomCode: string;
  settings: RoomSettings;
  isHost: boolean;
  meId: string;
  expanded: boolean;
}) {
  const [busy, setBusy] = React.useState(false);

  const update = async (patch: Partial<RoomSettings>) => {
    if (!isHost) return;
    setBusy(true);
    try {
      await fetch(`/api/rooms/${roomCode}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: meId, settings: patch }),
      });
      broadcastStateRefresh(roomCode);
    } finally {
      setBusy(false);
    }
  };

  if (!expanded && isHost) {
    return (
      <ul className="text-sm text-ink-soft">
        <li>{settings.rounds} rounds · {settings.drawTimeSeconds}s draw · {settings.maxPlayers} max</li>
        <li className="capitalize">Mode: {settings.wordMode}</li>
      </ul>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <NumField
          label="Players"
          value={settings.maxPlayers}
          min={SETTINGS_LIMITS.maxPlayers.min}
          max={SETTINGS_LIMITS.maxPlayers.max}
          step={1}
          disabled={!isHost || busy}
          onChange={(v) => update({ maxPlayers: v })}
        />
        <NumField
          label="Rounds"
          value={settings.rounds}
          min={SETTINGS_LIMITS.rounds.min}
          max={SETTINGS_LIMITS.rounds.max}
          step={1}
          disabled={!isHost || busy}
          onChange={(v) => update({ rounds: v })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumField
          label="Draw time"
          value={settings.drawTimeSeconds}
          min={SETTINGS_LIMITS.drawTimeSeconds.min}
          max={SETTINGS_LIMITS.drawTimeSeconds.max}
          step={10}
          disabled={!isHost || busy}
          onChange={(v) => update({ drawTimeSeconds: v })}
        />
        <NumField
          label="Hints"
          value={settings.hints}
          min={SETTINGS_LIMITS.hints.min}
          max={SETTINGS_LIMITS.hints.max}
          step={1}
          disabled={!isHost || busy}
          onChange={(v) => update({ hints: v })}
        />
      </div>
      <Field label="Word mode">
        <select
          disabled={!isHost || busy}
          value={settings.wordMode}
          onChange={(e) => update({ wordMode: e.target.value as WordMode })}
          className="h-9 w-full rounded-md border-2 border-ink bg-paper px-2 text-xs shadow-doodle-soft focus:outline-none focus:ring-2 focus:ring-coral"
        >
          <option value="normal">Normal</option>
          <option value="hidden">Hidden</option>
          <option value="combination">Combination</option>
        </select>
      </Field>
      {!isHost && <span className="text-xs text-ink-faint">Host only</span>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function NumField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={props.label}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={props.value}
          min={props.min}
          max={props.max}
          step={props.step}
          disabled={props.disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            const clamped = Math.max(props.min, Math.min(props.max, n));
            props.onChange(clamped);
          }}
          className="h-10"
        />
        <span className="text-xs text-ink-faint">
          {props.min}–{props.max}
        </span>
      </div>
    </Field>
  );
}
