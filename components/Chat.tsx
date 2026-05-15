'use client';
import * as React from 'react';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { CHAT_MAX_LENGTH } from '@/lib/constants';
import type { ChatMessage } from '@/lib/types';
import { sfx } from '@/lib/sound';
import { useRoomStore } from '@/lib/store';
import { broadcastChat, broadcastStateRefresh, refetchRoomSnapshot } from '@/lib/use-room';

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
 * Two paths:
 *
 *   A. NOT in a guess context (lobby, word-pick, round-end, or you've already
 *      guessed correctly). The message can't be a guess, so we optimistically
 *      append it as 'normal' immediately for instant local feedback. Server
 *      response is just a sanity check; on failure we roll back.
 *
 *   B. In a guess context (drawing phase, not the drawer, haven't guessed yet).
 *      The text could be a correct guess, a close guess, or normal chat — and
 *      we don't know the word locally (anti-cheat). If we appended as 'normal'
 *      first, the user would see their guess flash white before turning green,
 *      which feels laggy. Instead we hold the optimistic append and wait for
 *      the server verdict (~100-200ms), then append once with the right type.
 *      Input clearing + chatSend sfx give immediate "sent" feedback.
 *
 * In both cases the server inserts a chat row with the same id; the Realtime
 * echo upserts by id and is a no-op against whatever we appended locally.
 */
export function useChat({
  meId,
  meName,
  meHasGuessed,
  canChat,
  isPossibleGuess,
  roomCode,
}: {
  meId: string;
  meName: string;
  meHasGuessed: boolean;
  canChat: boolean;
  isPossibleGuess: boolean;
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
    const createdAt = new Date().toISOString();
    const optimistic: ChatMessage = {
      id,
      roomCode,
      playerId: meId,
      playerName: meName || 'You',
      text: value,
      type: 'normal',
      createdAt,
    };
    if (!isPossibleGuess) {
      appendChat(optimistic);
    }
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
          if (!isPossibleGuess) removeChat(id);
          return;
        }
        const j = (await res.json().catch(() => ({}))) as {
          correct?: boolean;
          close?: boolean;
          roundEnded?: boolean;
        };
        if (j.correct) {
          const upgraded: ChatMessage = {
            id,
            roomCode,
            playerId: meId,
            playerName: meName || 'You',
            text: value,
            type: 'correct-guess',
            createdAt,
          };
          appendChat(upgraded);
          broadcastChat(roomCode, upgraded);
          broadcastStateRefresh(roomCode);
          // If my guess ended the round, also refetch locally — the broadcast
          // above is `self: false` so it doesn't bring me along.
          if (j.roundEnded) {
            void refetchRoomSnapshot(roomCode, meId);
          }
        } else if (j.close) {
          const upgraded: ChatMessage = {
            id,
            roomCode,
            playerId: meId,
            playerName: meName || 'You',
            text: value,
            type: 'close-guess',
            createdAt,
          };
          appendChat(upgraded);
          sfx.closeGuess();
        } else {
          // Plain chat. If we deferred the optimistic append (guess context),
          // do it now. Then broadcast iff we didn't already broadcast above.
          if (isPossibleGuess) {
            appendChat(optimistic);
          }
          if (!safeToFanOutImmediately) {
            broadcastChat(roomCode, optimistic);
          }
        }
      } catch {
        if (!isPossibleGuess) removeChat(id);
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
  placeholder,
}: {
  chat: ChatState;
  className?: string;
  placeholder?: string;
}) {
  const defaultPlaceholder = chat.canChat ? 'Type your message here...' : 'Chat is locked';
  return (
    <form onSubmit={chat.send} className={cn('chat-input-bar bg-paper-dark', className)}>
      <input
        ref={chat.inputRef}
        value={chat.text}
        onChange={(e) => chat.setText(e.target.value.slice(0, CHAT_MAX_LENGTH))}
        placeholder={placeholder ?? defaultPlaceholder}
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
