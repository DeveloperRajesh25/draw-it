'use client';
import { setSession } from './identity';

/**
 * Shared leave-room helper.
 * If the caller is the only player in the room, surfaces a confirm dialog
 * — leaving deletes the room for everyone (server enforces this server-side
 * by checking the player count after delete).
 *
 * Returns { ok: false, cancelled: true } if the user cancelled.
 */
export async function leaveRoom(opts: {
  code: string;
  playerId: string;
  totalPlayers: number;
}): Promise<{ ok: boolean; cancelled?: boolean }> {
  const isLast = opts.totalPlayers <= 1;
  if (isLast && typeof window !== 'undefined') {
    const ok = window.confirm(
      "You're the last one here. Leaving will close this room for good. Continue?",
    );
    if (!ok) return { ok: false, cancelled: true };
  }
  setSession(null);
  try {
    await fetch(`/api/rooms/${encodeURIComponent(opts.code)}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: opts.playerId }),
      keepalive: true,
    });
  } catch {
    /* ignore — best-effort */
  }
  return { ok: true };
}
