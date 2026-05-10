'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Play, Settings as SettingsIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Input } from './ui/Input';
import { PlayerList } from './PlayerList';
import { RoomPill } from './RoomPill';
import type { Player, Room, RoomSettings, WordMode } from '@/lib/types';
import { SETTINGS_LIMITS } from '@/lib/constants';
import { leaveRoom } from '@/lib/leave';
import { refetchRoomSnapshot } from '@/lib/use-room';

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
  const [showSettings, setShowSettings] = React.useState(false);

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
      // Server has already advanced phase to 'word-pick'. Pull the new snapshot
      // immediately so we don't wait on Realtime CDC. Keep busy=true — this
      // component will unmount when phase changes.
      await refetchRoomSnapshot(room.code, meId);
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
    } finally {
      setKickingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-5 pb-16 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-ink">Lobby</h1>
          <p className="text-sm text-ink-soft">Waiting for players. Share the code below.</p>
        </div>
        <RoomPill code={room.code} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="font-display text-2xl">Players ({players.length})</h2>
              {me && <span className="text-xs text-ink-faint">you are <b>{me.name}</b></span>}
            </CardHeader>
            <CardBody>
              <PlayerList
                players={players}
                drawerId={null}
                hostId={room.hostId}
                meId={meId}
                connectedIds={connectedIds}
                onKick={isHost ? kick : undefined}
                kickingId={kickingId}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-wrap items-center gap-3">
              {isHost ? (
                <Button
                  onClick={startGame}
                  disabled={busy || players.length < 2}
                  loading={busy}
                  size="lg"
                  variant="accent"
                >
                  {!busy && <Play className="h-4 w-4" />}
                  {busy ? 'Starting…' : players.length < 2 ? 'Need 2+ players' : 'Start game'}
                </Button>
              ) : (
                <p className="text-sm text-ink-soft">Waiting for the host to start…</p>
              )}
              <Button variant="ghost" onClick={leave} disabled={leaving} loading={leaving}>
                {leaving ? 'Leaving…' : 'Leave'}
              </Button>
              {error && <span className="text-sm text-[hsl(0_70%_45%)]">{error}</span>}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="font-display text-2xl">Settings</h2>
            {!isHost && <span className="text-xs text-ink-faint">Host only</span>}
            {isHost && (
              <button
                type="button"
                className="press-doodle text-ink-soft"
                onClick={() => setShowSettings((v) => !v)}
                aria-label="Toggle settings"
              >
                <SettingsIcon className="h-5 w-5" />
              </button>
            )}
          </CardHeader>
          <CardBody>
            <SettingsView
              roomCode={room.code}
              settings={room.settings}
              isHost={isHost}
              meId={meId}
              expanded={showSettings || !isHost}
            />
          </CardBody>
        </Card>
      </div>
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
    <div className="grid gap-3">
      <NumField
        label="Max players"
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
      <NumField
        label="Draw time (s)"
        value={settings.drawTimeSeconds}
        min={SETTINGS_LIMITS.drawTimeSeconds.min}
        max={SETTINGS_LIMITS.drawTimeSeconds.max}
        step={10}
        disabled={!isHost || busy}
        onChange={(v) => update({ drawTimeSeconds: v })}
      />
      <NumField
        label="Word options"
        value={settings.wordCount}
        min={SETTINGS_LIMITS.wordCount.min}
        max={SETTINGS_LIMITS.wordCount.max}
        step={1}
        disabled={!isHost || busy}
        onChange={(v) => update({ wordCount: v })}
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
      <Field label="Word mode">
        <select
          disabled={!isHost || busy}
          value={settings.wordMode}
          onChange={(e) => update({ wordMode: e.target.value as WordMode })}
          className="h-10 w-full rounded-md border-2 border-ink bg-paper px-3 text-sm shadow-doodle-soft focus:outline-none focus:ring-2 focus:ring-coral"
        >
          <option value="normal">Normal</option>
          <option value="hidden">Hidden (no letter count)</option>
          <option value="combination">Combination (two words)</option>
        </select>
      </Field>
      <Field label="Custom words (comma or newline)">
        <textarea
          disabled={!isHost || busy}
          defaultValue={settings.customWords.join(', ')}
          onBlur={(e) => {
            const list = e.target.value
              .split(/[,\n]/)
              .map((w) => w.trim())
              .filter(Boolean)
              .slice(0, 200);
            update({ customWords: list });
          }}
          rows={3}
          className="w-full rounded-md border-2 border-ink bg-paper px-3 py-2 text-sm shadow-doodle-soft focus:outline-none focus:ring-2 focus:ring-coral"
          placeholder="optional — your own words"
        />
      </Field>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          disabled={!isHost || busy}
          checked={settings.useOnlyCustomWords}
          onChange={(e) => update({ useOnlyCustomWords: e.target.checked })}
          className="h-4 w-4"
        />
        Use only my custom words
      </label>
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
