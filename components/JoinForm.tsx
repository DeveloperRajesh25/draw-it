'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card, CardBody, CardHeader } from './ui/Card';
import { AvatarPicker, AvatarSvg } from './AvatarPicker';
import { getOrCreatePlayer, setSession, updatePlayer } from '@/lib/identity';
import { NAME_MAX_LENGTH } from '@/lib/constants';
import type { StoredPlayer } from '@/lib/identity';

export function JoinForm({
  code,
  onJoined,
}: {
  code: string;
  onJoined: (playerId: string) => void;
}) {
  const router = useRouter();
  const [player, setPlayer] = React.useState<StoredPlayer | null>(null);
  const [showAvatar, setShowAvatar] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPlayer(getOrCreatePlayer());
  }, []);

  if (!player) return null;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!player.name.trim()) {
      setError('Pick a name first');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          name: player.name.trim(),
          avatar: player.avatar,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 404) {
          setError('That room is closed.');
        } else {
          setError(json.error ?? 'Could not join');
        }
        return;
      }
      setSession({ roomCode: code, joinedAt: Date.now() });
      onJoined(player.id);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-8">
      <Card>
        <CardHeader>
          <h1 className="font-display text-3xl text-ink">Join room</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Code <span className="font-mono tracking-[0.2em]">{code}</span>
          </p>
        </CardHeader>
        <form onSubmit={submit}>
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="press-doodle rounded-full border-2 border-ink bg-paper-dark p-1 shadow-doodle"
                onClick={() => setShowAvatar((v) => !v)}
                aria-label="Customize avatar"
              >
                <AvatarSvg avatar={player.avatar} size={56} />
              </button>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-semibold text-ink-soft">Your name</label>
                <Input
                  autoFocus
                  value={player.name}
                  onChange={(e) => setPlayer(updatePlayer({ name: e.target.value.slice(0, NAME_MAX_LENGTH) }))}
                  placeholder="Doodle Doug"
                  maxLength={NAME_MAX_LENGTH}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>
            {showAvatar && (
              <AvatarPicker
                avatar={player.avatar}
                onChange={(a) => setPlayer(updatePlayer({ avatar: a }))}
              />
            )}
            {error && (
              <p className="rounded-md border-2 border-ink bg-[hsl(0_70%_55%/.15)] px-3 py-2 text-sm text-ink">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => router.push('/')}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={busy}>
                {busy ? 'Joining…' : 'Join'}
              </Button>
            </div>
          </CardBody>
        </form>
      </Card>
    </main>
  );
}
