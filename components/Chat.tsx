'use client';
import * as React from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './ui/Input';
import { CHAT_MAX_LENGTH } from '@/lib/constants';
import type { ChatMessage } from '@/lib/types';

type Props = {
  messages: ChatMessage[];
  meId: string;
  drawerId: string | null;
  meHasGuessed: boolean;
  canChat: boolean;
  roomCode: string;
};

/**
 * Chat list with anti-spoiler filtering. Each message is decided based on:
 *   - type
 *   - sender (the message author)
 *   - viewer (the local player)
 *
 * Rules:
 *   - 'normal'        — visible to everyone (drawer's chat is rejected server-side).
 *   - 'system'/'join'/'leave' — visible to everyone.
 *   - 'correct-guess' — sender sees the actual word; everyone else sees a
 *                       generic "Name guessed the word!" notice.
 *   - 'close-guess'   — only visible to the sender.
 */
export function Chat(props: Props) {
  const { messages, meId, canChat, roomCode } = props;
  const listRef = React.useRef<HTMLUListElement>(null);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setText('');
    try {
      const res = await fetch(`/api/rooms/${roomCode}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: meId, text: value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j.error) console.warn(j.error);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-lg border-2 border-ink bg-paper shadow-doodle-sm">
      <div className="border-b-2 border-ink px-3 py-2 text-sm font-semibold text-ink-soft">Chat</div>
      <ul
        ref={listRef}
        className="scrollbar-doodle flex-1 space-y-1.5 overflow-y-auto px-3 py-2 text-sm"
      >
        {messages.map((m) => (
          <ChatLine key={m.id} m={m} meId={meId} />
        ))}
      </ul>
      <form onSubmit={send} className="border-t-2 border-ink p-2">
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX_LENGTH))}
            placeholder={canChat ? 'Type a guess…' : 'Chat is locked'}
            disabled={!canChat || busy}
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-10"
          />
          <button
            type="submit"
            disabled={!canChat || busy || !text.trim()}
            className="press-doodle inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-ink bg-ink text-paper disabled:opacity-50"
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
