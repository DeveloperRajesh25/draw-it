export const BRUSH_SIZES = [4, 10, 20, 32, 40] as const;

export const COLORS = [
  '#FFFFFF', '#000000', '#C1C1C1', '#4C4C4C',
  '#EF130B', '#740B07',
  '#FF7100', '#C23800',
  '#FFE400', '#E8A200',
  '#00CC00', '#005510',
  '#00FF91', '#00B5AD',
  '#00B2FF', '#00569E',
  '#231FD3', '#0E0865',
  '#A300BA', '#550069',
  '#DF69A7', '#873554',
  '#FFAC8E', '#CC774D',
  '#A0613C', '#63300D',
] as const;

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const SCORING = {
  MAX_GUESS_POINTS: 250,
  MIN_GUESS_POINTS: 50,
  FIRST_GUESS_BONUS: 50,
  DRAWER_PER_GUESS: 50,
} as const;

export const TIMING = {
  WORD_PICK_SECONDS: 15,
  ROUND_END_SECONDS: 5,
  GAME_END_SECONDS: 15,
  GRACE_PERIOD_SECONDS: 60,
  DRAWER_DISCONNECT_SECONDS: 15,
  HEARTBEAT_INTERVAL_MS: 20_000,
  STROKE_FLUSH_INTERVAL_MS: 33,
} as const;

export const ROOM_CODE_LENGTH = 6;
// Excluded I, O, 0, 1 to avoid look-alikes when shared verbally.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const SETTINGS_LIMITS = {
  maxPlayers: { min: 2, max: 12 },
  drawTimeSeconds: { min: 30, max: 240 },
  rounds: { min: 1, max: 10 },
  wordCount: { min: 2, max: 5 },
  hints: { min: 0, max: 5 },
} as const;

export const NAME_MAX_LENGTH = 16;
export const CHAT_MAX_LENGTH = 100;
export const CUSTOM_WORDS_MAX = 200;
