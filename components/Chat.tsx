'use client';
import * as React from 'react';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { CHAT_MAX_LENGTH } from '@/lib/constants';
import type { ChatMessage } from '@/lib/types';
import { sfx } from '@/lib/sound';
import { useRoomStore } from '@/lib/store';
import { broadcastChat, broadcastStateRefresh } from '@/lib/use-room';

type ChatState = {
  text: string;
  setText: (v: string) => void;
  send: (e?: React.FormEvent) => void;
  canChat: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
};

/**
 * Chat send logic with optimistic local-echo and anti-spoiler filtering.
 *
 * Send flow:
 *   1. User submits → we generate a nanoid and append a 'normal' message to
 *      the store immediately. The input clears and the list scrolls.
 *   2. We POST to /api/rooms/[code]/chat with the same id.
 *   3. Server inserts the row with that id (and the canonical type if it was
 *      an exact/close guess). The Realtime echo arrives within ~100ms and
 *      the store upserts by id — replacing our optimistic copy in place.
 *   4. On non-OK response we roll back the optimistic message.
 *
 * Returns a state bundle so the list and input can render in different parts
 * of the DOM while sharing the same controlled text + send action.
 */
export function useChat({
  meId,
  meName,
  meHasGuessed,
  canChat,
  roomCode,
}: {
  meId: string;
  meName: string;
  meHasGuessed: boolean;
  canChat: boolean;
  roomCode: string;
}): ChatState {
  const [text, setText] = React.useState('');
  const appendChat = useRoomStore((s) => s.appendChat);
  const removeChat = useRoomStore((s) => s.removeChat);
  const inputRef = React.useRef<HTMLInputElement>(null);

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
    sfx.chatSend();
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
          sfx.closeGuess();
        } else if (!safeToFanOutImmediately) {
          broadcastChat(roomCode, optimistic);
        }
      } catch {
        removeChat(id);
      }
    })();
  };

  return { text, setText, send, canChat, inputRef };
}

export function ChatList({
  messages,
  meId,
  className,
}: {
  messages: ChatMessage[];
  meId: string;
  className?: string;
}) {
  const listRef = React.useRef<HTMLUListElement>(null);
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.id]);

  return (
    <ul
      ref={listRef}
      className={cn(
        'scrollbar-doodle min-h-0 flex-1 space-y-1 overflow-y-auto bg-paper px-2 py-2 text-sm sm:px-3',
        className,
      )}
    >
      {messages.map((m) => (
        <ChatLine key={m.id} m={m} meId={meId} />
      ))}
    </ul>
  );
}

export function ChatInput({
  chat,
  className,
}: {
  chat: ChatState;
  className?: string;
}) {
  return (
    <form onSubmit={chat.send} className={cn('chat-input-bar bg-paper-dark', className)}>
      <input
        ref={chat.inputRef}
        value={chat.text}
        onChange={(e) => chat.setText(e.target.value.slice(0, CHAT_MAX_LENGTH))}
        placeholder={chat.canChat ? 'Type your guess here...' : 'Chat is locked'}
        disabled={!chat.canChat}
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        // 16px font on mobile prevents iOS from auto-zooming the page on focus.
        className="block h-11 w-full bg-paper px-3 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-inset focus:ring-coral disabled:opacity-50 sm:h-10 sm:text-sm"
      />
    </form>
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
