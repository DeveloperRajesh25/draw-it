'use client';
import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { browserClient } from './supabase/client';
import { useRoomStore } from './store';
import { mapChatRow, mapHintRow, mapPlayerRow, mapRoomRow, mapStrokeRow } from './supabase/mappers';
import { TIMING } from './constants';
import type { StrokePreviewSegment } from './types';

const PREVIEW_EVENT = 'stroke-preview';

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
