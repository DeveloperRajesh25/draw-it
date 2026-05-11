'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Smartphone, Users, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { AvatarPicker, AvatarSvg } from '@/components/AvatarPicker';
import { getOrCreatePlayer, getSession, setSession, updatePlayer } from '@/lib/identity';
import { isValidRoomCode } from '@/lib/room-code';
import { NAME_MAX_LENGTH } from '@/lib/constants';
import type { StoredPlayer } from '@/lib/identity';

export default function HomeClient() {
  const router = useRouter();
  const [player, setPlayer] = useState<StoredPlayer | null>(null);
  const [code, setCode] = useState('');
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | 'rejoin' | null>(null);

  useEffect(() => {
    const p = getOrCreatePlayer();
    setPlayer(p);
    const s = getSession();
    if (s?.roomCode && isValidRoomCode(s.roomCode)) {
      // Don't redirect — show a banner so the user can choose to rejoin or stay home.
    }
    // Fire-and-forget janitor: every fresh visitor sweeps rooms/players older
    // than 3 hours so nothing piles up. Replaces the Vercel cron we couldn't
    // ship on the free tier. keepalive lets the request survive navigation.
    fetch('/api/cleanup', { method: 'POST', keepalive: true }).catch(() => {});
  }, []);

  if (!player) return null;

  const session = getSession();

  const onName = (v: string) => {
    const next = updatePlayer({ name: v.slice(0, NAME_MAX_LENGTH) });
    setPlayer(next);
  };

  const create = async () => {
    setError(null);
    if (!player.name.trim()) return setError('Pick a name first');
    setBusy('create');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          name: player.name.trim(),
          avatar: player.avatar,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not create room');
      setSession({ roomCode: json.code, joinedAt: Date.now() });
      router.push(`/r/${json.code}`);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      setBusy(null);
    }
  };

  const join = async () => {
    setError(null);
    if (!player.name.trim()) return setError('Pick a name first');
    const sanitized = code.trim().toUpperCase();
    if (!isValidRoomCode(sanitized)) return setError('That room code looks off');
    setBusy('join');
    try {
      router.push(`/r/${sanitized}`);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5 pb-10 pt-8 sm:px-6">
      {/* Header */}
      <motion.section
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col items-center text-center"
      >
        <h1 className="font-display text-7xl text-ink sm:text-8xl">Draw It</h1>
        <p className="mt-1 text-base text-ink-soft sm:text-lg">
          Pictionary that survives a mobile refresh.
        </p>
      </motion.section>

      {/* Resume banner */}
      {session?.roomCode && (
        <Card className="mt-6 bg-mustard">
          <CardBody className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">Welcome back</p>
              <p className="text-sm text-ink-soft">
                You were in room <span className="font-mono">{session.roomCode}</span>.
              </p>
            </div>
            <Button
              onClick={() => {
                setBusy('rejoin');
                router.push(`/r/${session.roomCode}`);
              }}
              disabled={!!busy}
              loading={busy === 'rejoin'}
            >
              {busy === 'rejoin' ? 'Reconnecting…' : 'Rejoin'}
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Identity card */}
      <Card className="mt-6">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button
            type="button"
            className="press-doodle mx-auto flex shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-dark p-1 shadow-doodle"
            onClick={() => setPickingAvatar((v) => !v)}
            aria-label="Customize avatar"
          >
            <AvatarSvg avatar={player.avatar} size={72} />
          </button>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-semibold text-ink-soft">Your name</label>
            <Input
              value={player.name}
              onChange={(e) => onName(e.target.value)}
              placeholder="Doodle Doug"
              maxLength={NAME_MAX_LENGTH}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </CardBody>
        {pickingAvatar && (
          <div className="border-t-2 border-ink p-4">
            <AvatarPicker
              avatar={player.avatar}
              onChange={(a) => {
                const next = updatePlayer({ avatar: a });
                setPlayer(next);
              }}
            />
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody className="flex flex-col gap-3">
            <h2 className="font-display text-3xl">Start a room</h2>
            <p className="text-sm text-ink-soft">
              Get a 6-character code and share the link.
            </p>
            <Button onClick={create} disabled={!!busy} loading={busy === 'create'} size="lg" variant="accent">
              {busy === 'create' ? 'Creating…' : 'Create Room'}
            </Button>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-col gap-3">
            <h2 className="font-display text-3xl">Join a room</h2>
            <p className="text-sm text-ink-soft">Type the code from a friend.</p>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                placeholder="ABC123"
                maxLength={6}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono tracking-[0.3em]"
              />
              <Button onClick={join} disabled={!!busy || code.length !== 6} loading={busy === 'join'} size="lg">
                {busy === 'join' ? 'Joining…' : 'Join'}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {error && (
        <p className="mt-4 rounded-md border-2 border-ink bg-[hsl(0_70%_55%/.15)] px-3 py-2 text-sm text-ink">
          {error}
        </p>
      )}

      {/* Feature callouts */}
      <section className="mt-12 grid gap-3 sm:grid-cols-3">
        <Feature icon={<Smartphone className="h-5 w-5" />} title="Switch apps freely">
          Background the tab to share the link. Your seat is held.
        </Feature>
        <Feature icon={<Wifi className="h-5 w-5" />} title="Refresh-proof">
          Reload mid-game and pick up exactly where you left off.
        </Feature>
        <Feature icon={<Users className="h-5 w-5" />} title="Friends drop in">
          Up to 12 in a room. Share a code or a link.
        </Feature>
      </section>

      <footer className="mt-auto pt-10 text-center text-xs text-ink-faint">
        <p>Made with ink, paper, and Postgres.</p>
      </footer>
    </main>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border-2 border-ink bg-paper-dark p-3 shadow-doodle-sm">
      <div className="mb-1 flex items-center gap-2 text-ink">
        {icon}
        <span className="font-semibold">{title}</span>
      </div>
      <p className="text-sm text-ink-soft">{children}</p>
    </div>
  );
}
