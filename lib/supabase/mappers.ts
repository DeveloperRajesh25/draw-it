import type {
  Avatar,
  ChatMessage,
  ChatType,
  GamePhase,
  HintReveal,
  Player,
  Room,
  RoomSettings,
  Stroke,
  Tool,
  WordMode,
} from '../types';

// snake_case rows from Postgres → camelCase typed shapes for the app.

export function mapRoomRow(row: Record<string, unknown>): Room {
  const settings: RoomSettings = {
    language: (row.language as string) ?? 'en',
    maxPlayers: (row.max_players as number) ?? 8,
    drawTimeSeconds: (row.draw_time_seconds as number) ?? 80,
    rounds: (row.rounds as number) ?? 3,
    wordCount: (row.word_count as number) ?? 3,
    hints: (row.hints as number) ?? 2,
    wordMode: ((row.word_mode as WordMode) ?? 'normal'),
    customWords: (row.custom_words as string[]) ?? [],
    useOnlyCustomWords: (row.use_only_custom as boolean) ?? false,
  };
  return {
    code: row.code as string,
    hostId: row.host_id as string,
    createdAt: row.created_at as string,
    lastActivityAt: row.last_activity_at as string,
    settings,
    phase: (row.phase as GamePhase) ?? 'lobby',
    round: (row.round as number) ?? 0,
    turnInRound: (row.turn_in_round as number) ?? 0,
    drawerId: (row.drawer_id as string | null) ?? null,
    word: (row.word as string | null) ?? null,
    wordPattern: (row.word_pattern as string | null) ?? null,
    wordOptions: (row.word_options as string[] | null) ?? null,
    phaseStartedAt: (row.phase_started_at as string | null) ?? null,
    phaseEndsAt: (row.phase_ends_at as string | null) ?? null,
    usedWords: (row.used_words as string[]) ?? [],
  };
}

export function mapPlayerRow(row: Record<string, unknown>): Player {
  const avatar = (row.avatar as Avatar | null) ?? { skinColor: 0, eyes: 0, mouth: 0, special: -1 };
  return {
    id: row.id as string,
    roomCode: row.room_code as string,
    name: row.name as string,
    avatar,
    score: (row.score as number) ?? 0,
    isHost: (row.is_host as boolean) ?? false,
    joinedAt: row.joined_at as string,
    lastSeenAt: row.last_seen_at as string,
    connected: (row.connected as boolean) ?? false,
    hasGuessed: (row.has_guessed as boolean) ?? false,
    guessOrder: (row.guess_order as number | null) ?? null,
    pointsThisRound: (row.points_this_round as number) ?? 0,
  };
}

export function mapStrokeRow(row: Record<string, unknown>): Stroke {
  return {
    id: row.id as string,
    roomCode: row.room_code as string,
    turnKey: row.turn_key as string,
    seq: Number(row.seq ?? 0),
    tool: row.tool as Tool,
    color: row.color as string,
    size: row.size as number,
    points: (row.points as number[]) ?? [],
    createdAt: row.created_at as string,
  };
}

export function mapChatRow(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    roomCode: row.room_code as string,
    playerId: (row.player_id as string | null) ?? null,
    playerName: (row.player_name as string | null) ?? null,
    text: row.text as string,
    type: (row.type as ChatType) ?? 'normal',
    createdAt: row.created_at as string,
  };
}

export function mapHintRow(row: Record<string, unknown>): HintReveal & { round: number; turn: number } {
  return {
    round: row.round as number,
    turn: row.turn as number,
    letterIndex: row.letter_index as number,
    letter: row.letter as string,
  };
}
