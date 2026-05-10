// Canonical types shared by client and server.
// Server data comes from Postgres in snake_case; mappers in lib/supabase/mappers.ts
// convert it to these camelCase shapes.

export type PlayerId = string;
export type RoomCode = string;

export type Avatar = {
  skinColor: number;
  eyes: number;
  mouth: number;
  special: number;
};

export type GamePhase = 'lobby' | 'word-pick' | 'drawing' | 'round-end' | 'game-end';
export type WordMode = 'normal' | 'hidden' | 'combination';
export type ChatType = 'normal' | 'system' | 'correct-guess' | 'close-guess' | 'join' | 'leave';
export type Tool = 'brush' | 'eraser' | 'fill';

export type Player = {
  id: PlayerId;
  roomCode: RoomCode;
  name: string;
  avatar: Avatar;
  score: number;
  isHost: boolean;
  joinedAt: string;
  lastSeenAt: string;
  connected: boolean;
  hasGuessed: boolean;
  guessOrder: number | null;
  pointsThisRound: number;
};

export type RoomSettings = {
  language: string;
  maxPlayers: number;
  drawTimeSeconds: number;
  rounds: number;
  wordCount: number;
  hints: number;
  wordMode: WordMode;
  customWords: string[];
  useOnlyCustomWords: boolean;
};

export type Stroke = {
  id: string;
  roomCode: RoomCode;
  turnKey: string;
  seq: number;
  tool: Tool;
  color: string;
  size: number;
  points: number[];
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  roomCode: RoomCode;
  playerId: PlayerId | null;
  playerName: string | null;
  text: string;
  type: ChatType;
  createdAt: string;
};

export type HintReveal = {
  letterIndex: number;
  letter: string;
};

export type Room = {
  code: RoomCode;
  hostId: PlayerId;
  createdAt: string;
  lastActivityAt: string;
  settings: RoomSettings;
  phase: GamePhase;
  round: number;
  turnInRound: number;
  drawerId: PlayerId | null;
  word: string | null;
  wordPattern: string | null;
  wordOptions: string[] | null;
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
  usedWords: string[];
};

export type RoomState = {
  room: Room;
  players: Player[];
  strokes: Stroke[];
  chat: ChatMessage[];
  hintReveals: HintReveal[];
};

export type StrokePreviewSegment = {
  strokeId: string;
  tool: Tool;
  color: string;
  size: number;
  points: number[];
  done?: boolean;
};
