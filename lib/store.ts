'use client';
import { create } from 'zustand';
import type { ChatMessage, HintReveal, Player, Room, RoomState, Stroke } from './types';

type Store = {
  state: RoomState | null;
  setState: (s: RoomState) => void;
  patchRoom: (room: Room) => void;
  upsertPlayer: (p: Player) => void;
  removePlayer: (id: string) => void;
  appendChat: (m: ChatMessage) => void;
  appendStroke: (s: Stroke) => void;
  removeStroke: (id: string) => void;
  appendHint: (h: HintReveal) => void;
  setStrokes: (s: Stroke[]) => void;
  connectedIds: Set<string>;
  setConnectedIds: (s: Set<string>) => void;
};

export const useRoomStore = create<Store>((set) => ({
  state: null,
  connectedIds: new Set(),
  setState: (s) => set({ state: s }),
  patchRoom: (room) =>
    set((cur) => (cur.state ? { state: { ...cur.state, room } } : cur)),
  upsertPlayer: (p) =>
    set((cur) => {
      if (!cur.state) return cur;
      const idx = cur.state.players.findIndex((x) => x.id === p.id);
      const players = [...cur.state.players];
      if (idx >= 0) players[idx] = p;
      else players.push(p);
      players.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
      return { state: { ...cur.state, players } };
    }),
  removePlayer: (id) =>
    set((cur) =>
      cur.state
        ? { state: { ...cur.state, players: cur.state.players.filter((p) => p.id !== id) } }
        : cur,
    ),
  appendChat: (m) =>
    set((cur) => {
      if (!cur.state) return cur;
      if (cur.state.chat.some((x) => x.id === m.id)) return cur;
      return { state: { ...cur.state, chat: [...cur.state.chat, m] } };
    }),
  appendStroke: (s) =>
    set((cur) => {
      if (!cur.state) return cur;
      if (cur.state.strokes.some((x) => x.id === s.id)) return cur;
      const strokes = [...cur.state.strokes, s];
      strokes.sort((a, b) => a.seq - b.seq);
      return { state: { ...cur.state, strokes } };
    }),
  removeStroke: (id) =>
    set((cur) =>
      cur.state
        ? { state: { ...cur.state, strokes: cur.state.strokes.filter((s) => s.id !== id) } }
        : cur,
    ),
  appendHint: (h) =>
    set((cur) => {
      if (!cur.state) return cur;
      if (cur.state.hintReveals.some((x) => x.letterIndex === h.letterIndex)) return cur;
      return {
        state: {
          ...cur.state,
          hintReveals: [...cur.state.hintReveals, h].sort((a, b) => a.letterIndex - b.letterIndex),
        },
      };
    }),
  setStrokes: (s) => set((cur) => (cur.state ? { state: { ...cur.state, strokes: s } } : cur)),
  setConnectedIds: (s) => set({ connectedIds: s }),
}));
