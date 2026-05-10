'use client';
import * as React from 'react';
import { Send } from 'lucide-react';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { CHAT_MAX_LENGTH } from '@/lib/constants';
import type { ChatMessage } from '@/lib/types';
import { useRoomStore } from '@/lib/store';
import { broadcastChat, broadcastStateRefresh } from '@/lib/use-room';

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
  const { messages, meId, meName, canChat, meHasGuessed, roomCode } = props;
  const listRef = React.useRef<HTMLUListElement>(null);
  const [text, setText] = React.useState('');
  const appendChat = useRoomStore((s) => s.appendChat);
  const removeChat = useRoomStore((s) => s.removeChat);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.id]);

  // When the chat input gains focus on mobile, scroll it into view above the
  // on-screen keyboard. We deliberately do NOT lock the body or rebind the
  // shell height — the canvas is sized in `svh` units, which are stable when
  // the keyboard opens, so it never resizes while typing.
  const inputRef = React.useRef<HTMLInputElement>(null);
  const onInputFocus = React.useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
  }, []);

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
    // Anti-spoiler: if the sender hasn't guessed yet, this message could BE
    // the answer — broadcasting it to everyone as 'normal' would briefly
    // reveal the word. Wait for the server verdict before fanning out.
    // Players who have already guessed correctly can chat freely (they can't
    // reveal anything new), so we broadcast immediately for them.
    const safeToFanOutImmediately = meHasGuessed;
    if (safeToFanOutImmediately) {
      broadcastChat(roomCode, optimistic);
    }
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
        const j = (await res.json().catch(() => ({}))) as {
          correct?: boolean;
          close?: boolean;
        };
        // Sender renders the verdict instantly. We also broadcast the canonical
        // message so every other client renders it at the same time — no CDC
        // wait. The DB row arriving via postgres_changes later upserts by id
        // and is a visual no-op.
        if (j.correct) {
          const upgraded: ChatMessage = {
            id,
            roomCode,
            playerId: meId,
            playerName: meName || 'You',
            text: value,
            type: 'correct-guess',
            createdAt: optimistic.createdAt,
          };
          appendChat(upgraded);
          broadcastChat(roomCode, upgraded);
          // The server may have flagged the round as "everyone guessed" and
          // moved phase_ends_at to NOW(). Tell peers to refresh so their
          // timer + phase advance together — without this they'd wait on
          // the rooms postgres_changes event (often delayed).
          broadcastStateRefresh(roomCode);
        } else if (j.close) {
          const upgraded: ChatMessage = {
            id,
            roomCode,
            playerId: meId,
            playerName: meName || 'You',
            text: value,
            type: 'close-guess',
            createdAt: optimistic.createdAt,
          };
          appendChat(upgraded);
          // close-guess is filtered to sender-only on receivers — no need to
          // broadcast it to others.
        } else if (!safeToFanOutImmediately) {
          // We held back the optimistic broadcast because the sender hadn't
          // guessed yet. Now that the server has confirmed it's a normal
          // message (not the word), fan it out to everyone else.
          broadcastChat(roomCode, optimistic);
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
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX_LENGTH))}
            onFocus={onInputFocus}
            placeholder={canChat ? 'Type your guess here...' : 'Chat is locked'}
            disabled={!canChat}
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            // 16px font on mobile prevents iOS from auto-zooming the page on focus.
            className="h-10 min-w-0 flex-1 rounded-md border-2 border-ink bg-paper px-3 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-coral disabled:opacity-50 sm:text-sm"
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
