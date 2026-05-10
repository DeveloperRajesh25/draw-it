'use client';
import { nanoid } from 'nanoid';

const PLAYER_KEY = 'drawit.player.v1';
const SESSION_KEY = 'drawit.session.v1';
const SOUND_KEY = 'drawit.sound.v1';

export type StoredPlayer = {
  id: string;
  name: string;
  avatar: { skinColor: number; eyes: number; mouth: number; special: number };
};

export type StoredSession = {
  roomCode: string;
  joinedAt: number;
};

const SSR_FALLBACK: StoredPlayer = {
  id: '',
  name: '',
  avatar: { skinColor: 0, eyes: 0, mouth: 0, special: -1 },
};

export function getOrCreatePlayer(): StoredPlayer {
  if (typeof window === 'undefined') return SSR_FALLBACK;
  const raw = localStorage.getItem(PLAYER_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredPlayer;
      if (parsed?.id) return parsed;
    } catch {
      /* fall through */
    }
  }
  const fresh: StoredPlayer = {
    id: nanoid(12),
    name: '',
    avatar: {
      skinColor: Math.floor(Math.random() * 4),
      eyes: Math.floor(Math.random() * 4),
      mouth: Math.floor(Math.random() * 4),
      special: -1,
    },
  };
  localStorage.setItem(PLAYER_KEY, JSON.stringify(fresh));
  return fresh;
}

export function updatePlayer(patch: Partial<StoredPlayer>): StoredPlayer {
  const current = getOrCreatePlayer();
  const next: StoredPlayer = {
    ...current,
    ...patch,
    avatar: { ...current.avatar, ...(patch.avatar ?? {}) },
  };
  localStorage.setItem(PLAYER_KEY, JSON.stringify(next));
  return next;
}

export function getSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function setSession(s: StoredSession | null) {
  if (typeof window === 'undefined') return;
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

export function getSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = localStorage.getItem(SOUND_KEY);
  return raw !== '0';
}

export function setSoundEnabled(on: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SOUND_KEY, on ? '1' : '0');
}
