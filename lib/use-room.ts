'use client';
import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { browserClient } from './supabase/client';
import { useRoomStore } from './store';
import { mapChatRow, mapHintRow, mapPlayerRow, mapRoomRow, mapStrokeRow } from './supabase/mappers';
import { TIMING } from './constants';
import type { ChatMessage, StrokePreviewSegment } from './types';

const PREVIEW_EVENT = 'stroke-preview';
const CHAT_EVENT = 'chat-msg';
const STATE_REFRESH_EVENT = 'state-refresh';

type PreviewListener = (seg: StrokePreviewSegment) => void;

const previewListeners = new Map<string, Set<PreviewListener>>();

function addPreviewListener(code: string, fn: PreviewListener): () => void {
  let set = previewListeners.get(code);
  if (!set) {
    set = new Set();
    previewListeners.set(code, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

function emitPreview(code: string, seg: StrokePreviewSegment) {
  previewListeners.get(code)?.forEach((fn) => {
    try {
      fn(seg);
    } catch (e) {
      console.error(e);
    }
  });
}

// Module-scoped channel ref so dev-mode StrictMode double-mount doesn't open twice.
const channelByCode = new Map<string, RealtimeChannel>();

export function subscribeStrokePreviews(code: string, fn: PreviewListener) {
  return addPreviewListener(code, fn);
}

// Per-room dedupe so multiple components can request a refetch in the same tick.
const refetchInFlight = new Map<string, Promise<void>>();
const refetchLastAt = new Map<string, number>();

/**
 * Pull a fresh snapshot from /api/rooms/[code] and push it into the store.
 * Used to bypass Realtime CDC latency right after a known-good server mutation
 * (start game, tick, etc) — so the local UI advances immediately instead of
 * waiting on Postgres → Supabase Realtime → WebSocket → client.
 *
 * Coalesces concurrent calls and rate-limits to ~1 every 200ms per room.
 */
export async function refetchRoomSnapshot(code: string, playerId: string): Promise<void> {
  if (!code || !playerId) return;
  const existing = refetchInFlight.get(code);
  if (existing) return existing;

  const last = refetchLastAt.get(code) ?? 0;
  const sinceLast = Date.now() - last;
  if (sinceLast < 200) return;

  const p = (async () => {
    try {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(code)}?playerId=${encodeURIComponent(playerId)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const snap = await res.json();
      const store = useRoomStore.getState();
      store.setState(snap);
      store.setStrokes(snap.strokes);
    } catch {
      /* ignore */
    } finally {
      refetchLastAt.set(code, Date.now());
      refetchInFlight.delete(code);
    }
  })();
  refetchInFlight.set(code, p);
  return p;
}

/**
 * Broadcast a live preview segment from the drawer to all viewers.
 * Returns true if the channel was ready, false otherwise (caller may buffer).
 */
export function broadcastStrokePreview(code: string, seg: StrokePreviewSegment): boolean {
  const ch = channelByCode.get(code);
  if (!ch) return false;
  ch.send({ type: 'broadcast', event: PREVIEW_EVENT, payload: seg });
  return true;
}

/**
 * Broadcast a chat message to every other client in the room. We use this to
 * fan out chat — and especially the correct-guess "verdict" — without waiting
 * on Postgres CDC (~hundreds of ms). Receivers upsert by id, so the canonical
 * row that arrives later via postgres_changes is a no-op.
 */
export function broadcastChat(code: string, msg: ChatMessage): boolean {
  const ch = channelByCode.get(code);
  if (!ch) return false;
  ch.send({ type: 'broadcast', event: CHAT_EVENT, payload: msg });
  return true;
}

/**
 * Tell every other client in the room "something changed, pull a fresh
 * snapshot now". Used as a belt-and-suspenders alongside postgres_changes —
 * Realtime CDC for `rooms`/`players` is sometimes delayed by hundreds of ms
 * or dropped entirely on flaky connections. This broadcast is peer-to-peer
 * over the WebSocket and arrives instantly.
 */
export function broadcastStateRefresh(code: string): boolean {
  const ch = channelByCode.get(code);
  if (!ch) return false;
  ch.send({ type: 'broadcast', event: STATE_REFRESH_EVENT, payload: { at: Date.now() } });
  return true;
}

export function useRoom(code: string, playerId: string) {
  const setState = useRoomStore((s) => s.setState);
  const patchRoom = useRoomStore((s) => s.patchRoom);
  const upsertPlayer = useRoomStore((s) => s.upsertPlayer);
  const removePlayer = useRoomStore((s) => s.removePlayer);
  const appendChat = useRoomStore((s) => s.appendChat);
  const appendStroke = useRoomStore((s) => s.appendStroke);
  const removeStroke = useRoomStore((s) => s.removeStroke);
  const appendHint = useRoomStore((s) => s.appendHint);
  const setStrokes = useRoomStore((s) => s.setStrokes);
  const setConnectedIds = useRoomStore((s) => s.setConnectedIds);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!code || !playerId) return;
    cancelledRef.current = false;

    const fetchSnapshot = async () => {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(code)}?playerId=${encodeURIComponent(playerId)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        if (res.status === 404) {
          // Surface as a special state so the UI can re-show the join form.
          setState({
            // @ts-expect-error sentinel
            __roomMissing: true,
          });
        }
        return null;
      }
      const snap = await res.json();
      if (cancelledRef.current) return null;
      setState(snap);
      // Reset stroke list to whatever the snapshot says (handles late-join + clear).
      setStrokes(snap.strokes);
      return snap;
    };

    const init = async () => {
      const snap = await fetchSnapshot();
      if (!snap || cancelledRef.current) return;

      const supabase = browserClient();
      // Reuse channel if it already exists (StrictMode dev double-mount).
      const existing = channelByCode.get(code);
      if (existing) {
        try {
          await existing.unsubscribe();
        } catch {/* ignore */}
        try {
          supabase.removeChannel(existing);
        } catch {/* ignore */}
        channelByCode.delete(code);
      }

      const channel = supabase.channel(`room:${code}`, {
        config: {
          presence: { key: playerId },
          broadcast: { self: false, ack: false },
        },
      });

      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
          (payload) => {
            const row = payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old;
            if (!row) return;
            const room = mapRoomRow(row as Record<string, unknown>);
            // Word visibility: if we are not the drawer, mask the word.
            const cur = useRoomStore.getState().state;
            const isDrawer = room.drawerId === playerId;
            const masked = isDrawer
              ? room
              : {
                  ...room,
                  word: room.phase === 'round-end' || room.phase === 'game-end' ? room.word : null,
                  wordOptions: isDrawer ? room.wordOptions : null,
                };
            // If turn changed, reset strokes locally (next snapshot or DELETE events
            // will repopulate).
            if (cur && cur.room && (cur.room.round !== room.round || cur.room.turnInRound !== room.turnInRound)) {
              setStrokes([]);
            }
            patchRoom(masked);
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${code}` },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const id = (payload.old as Record<string, unknown>)?.id as string | undefined;
              if (id) removePlayer(id);
              return;
            }
            const row = payload.new as Record<string, unknown>;
            if (!row) return;
            upsertPlayer(mapPlayerRow(row));
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_code=eq.${code}` },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if (!row) return;
            appendChat(mapChatRow(row));
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'strokes', filter: `room_code=eq.${code}` },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const id = (payload.old as Record<string, unknown>)?.id as string | undefined;
              if (id) removeStroke(id);
              return;
            }
            const row = payload.new as Record<string, unknown>;
            if (!row) return;
            appendStroke(mapStrokeRow(row));
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'hint_reveals', filter: `room_code=eq.${code}` },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            if (!row) return;
            const h = mapHintRow(row);
            appendHint({ letterIndex: h.letterIndex, letter: h.letter });
          },
        )
        .on('broadcast', { event: PREVIEW_EVENT }, ({ payload }) => {
          if (payload) emitPreview(code, payload as StrokePreviewSegment);
        })
        .on('broadcast', { event: CHAT_EVENT }, ({ payload }) => {
          if (!payload) return;
          appendChat(payload as ChatMessage);
        })
        .on('broadcast', { event: STATE_REFRESH_EVENT }, () => {
          // Some peer signalled "state changed, refetch now". Cheap belt-and-
          // suspenders against postgres_changes lag/drop. The refetch is
          // coalesced + rate-limited inside refetchRoomSnapshot.
          void refetchRoomSnapshot(code, playerId);
        })
        .on('presence', { event: 'sync' }, () => {
          const stateMap = channel.presenceState() as Record<string, unknown>;
          const ids = new Set<string>(Object.keys(stateMap));
          setConnectedIds(ids);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            try {
              await channel.track({ playerId, at: Date.now() });
            } catch (e) {
              console.error('Presence track failed', e);
            }
            // Tell everyone else in the room to pull a fresh snapshot. This is
            // how a freshly-joined player makes the host's lobby update without
            // waiting on postgres_changes (which is sometimes laggy or drops
            // INSERT events on the players table).
            try {
              channel.send({
                type: 'broadcast',
                event: STATE_REFRESH_EVENT,
                payload: { at: Date.now() },
              });
            } catch {/* ignore */}
          }
        });

      channelByCode.set(code, channel);
      channelRef.current = channel;
    };

    init();

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (cancelledRef.current) return;
      fetch(`/api/rooms/${encodeURIComponent(code)}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
        keepalive: true,
      }).catch(() => {/* ignore */});
    }, TIMING.HEARTBEAT_INTERVAL_MS);

    // Visibility re-sync (the persistence trick)
    const onVisible = async () => {
      if (document.visibilityState === 'visible') {
        try {
          await fetch(`/api/rooms/${encodeURIComponent(code)}/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId }),
          });
        } catch {/* ignore */}
        await fetchSnapshot();
        // Re-track presence (the channel may still be alive but the row in
        // Supabase Presence might have lapsed).
        const ch = channelRef.current;
        if (ch) {
          try {
            await ch.track({ playerId, at: Date.now() });
          } catch {/* ignore */}
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    // beforeunload soft leave — uses sendBeacon to dodge the browser tearing down requests.
    const onUnload = () => {
      try {
        const blob = new Blob([JSON.stringify({ playerId })], { type: 'application/json' });
        navigator.sendBeacon(
          `/api/rooms/${encodeURIComponent(code)}/leave-soft`,
          blob,
        );
      } catch {/* ignore */}
    };
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      cancelledRef.current = true;
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        try {
          ch.untrack();
        } catch {/* ignore */}
        try {
          browserClient().removeChannel(ch);
        } catch {/* ignore */}
        channelByCode.delete(code);
      }
    };
  }, [
    code,
    playerId,
    setState,
    patchRoom,
    upsertPlayer,
    removePlayer,
    appendChat,
    appendStroke,
    removeStroke,
    appendHint,
    setStrokes,
    setConnectedIds,
  ]);
}
