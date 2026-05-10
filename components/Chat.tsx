'use client';
import * as React from 'react';
import { Send } from 'lucide-react';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { CHAT_MAX_LENGTH } from '@/lib/constants';
import type { ChatMessage } from '@/lib/types';
import { useRoomStore } from '@/lib/store';

type Props = {
  messages: ChatMessage[];
  meId: string;
  meName: string;
  drawerId: string | null;
  meHasGuessed: boolean;
  canChat: boolean;
  roomCode: string;
};

/**
 * Chat list with optimistic local-echo and anti-spoiler filtering.
 *
 * Send flow:
 *   1. User submits → we generate a nanoid and append a 'normal' message to
 *      the store immediately. The input clears and the list scrolls.
 *   2. We POST to /api/rooms/[code]/chat with the same id.
 *   3. Server inserts the row with that id (and the canonical type if it was
 *      an exact/close guess). The Realtime echo arrives within ~100ms and
 *      the store upserts by id — replacing our optimistic copy in place.
 *   4. On non-OK response we roll back the optimistic message.
 */
export function Chat(props: Props) {
  const { messages, meId, meName, canChat, roomCode } = props;
  const listRef = React.useRef<HTMLUListElement>(null);
  const [text, setText] = React.useState('');
  const appendChat = useRoomStore((s) => s.appendChat);
  const removeChat = useRoomStore((s) => s.removeChat);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.id]);

  const send = (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || !canChat) return;
    const id = nanoid();
    const optimistic: ChatMessage = {
      id,
      roomCode,
      playerId: meId,
      playerName: meName || 'You',
      text: value,
      type: 'normal',
      createdAt: new Date().toISOString(),
    };
    appendChat(optimistic);
    setText('');
    void (async () => {
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, playerId: meId, text: value }),
        });
        if (!res.ok) {
          removeChat(id);
          return;
        }
        // Optimistically reflect the server's verdict so the sender sees the
        // green/yellow line immediately — no waiting on Realtime CDC. The
        // server-issued row will arrive shortly and upsert by id (same data,
        // so visually a no-op).
        const j = (await res.json().catch(() => ({}))) as {
          correct?: boolean;
          close?: boolean;
        };
        if (j.correct) {
          appendChat({
            id,
            roomCode,
            playerId: meId,
            playerName: meName || 'You',
            text: value,
            type: 'correct-guess',
            createdAt: optimistic.createdAt,
          });
        } else if (j.close) {
          appendChat({
            id,
            roomCode,
            playerId: meId,
            playerName: meName || 'You',
            text: value,
            type: 'close-guess',
            createdAt: optimistic.createdAt,
          });
        }
      } catch {
        removeChat(id);
      }
    })();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border-2 border-ink bg-paper shadow-doodle-sm">
      <ul
        ref={listRef}
        className="scrollbar-doodle min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2 text-sm sm:px-3"
      >
        {messages.map((m) => (
          <ChatLine key={m.id} m={m} meId={meId} />
        ))}
      </ul>
      <form onSubmit={send} className="border-t-2 border-ink bg-paper-dark p-2">
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX_LENGTH))}
            placeholder={canChat ? 'Type your guess here...' : 'Chat is locked'}
            disabled={!canChat}
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            className="h-10 min-w-0 flex-1 rounded-md border-2 border-ink bg-paper px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-coral disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canChat || !text.trim()}
            className="press-doodle inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-ink text-paper disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function ChatLine({ m, meId }: { m: ChatMessage; meId: string }) {
  const isMine = m.playerId === meId;

  if (m.type === 'system') {
    return (
      <li className="rounded-md bg-paper-dark px-2 py-1 text-center text-xs text-ink-soft">{m.text}</li>
    );
  }
  if (m.type === 'join' || m.type === 'leave') {
    return (
      <li className="text-xs italic text-ink-faint">{m.text}</li>
    );
  }
  if (m.type === 'close-guess') {
    if (!isMine) return null;
    return (
      <li className="rounded-md bg-mustard/40 px-2 py-1">
        <span className="font-semibold">{m.playerName ?? 'You'}: </span>
        <span>{m.text}</span>
        <span className="ml-2 text-xs italic text-ink-soft">close!</span>
      </li>
    );
  }
  if (m.type === 'correct-guess') {
    return (
      <li
        className={cn(
          'rounded-md px-2 py-1 text-[hsl(140_60%_25%)]',
          isMine ? 'bg-mint/70' : 'bg-mint/30',
        )}
      >
        <span className="font-semibold">{m.playerName}</span>
        {isMine ? <> guessed <b>{m.text}</b>!</> : <> guessed the word!</>}
      </li>
    );
  }
  // normal
  return (
    <li className={cn('rounded-md px-1', isMine && 'font-semibold')}>
      <span className="text-ink-soft">{m.playerName}: </span>
      <span>{m.text}</span>
    </li>
  );
}
