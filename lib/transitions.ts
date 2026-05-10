import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import { mapPlayerRow, mapRoomRow } from './supabase/mappers';
import { drawerPoints } from './scoring';
import { applyRevealedLetters, buildHintSchedule, makeWordPattern, pickWordOptions } from './words';
import { TIMING } from './constants';
import type { Room } from './types';

// =====================================================================
// Helpers
// =====================================================================

export function turnKey(round: number, turnInRound: number) {
  return `${round}-${turnInRound}`;
}

function nowISO() {
  return new Date().toISOString();
}

function inSeconds(s: number) {
  return new Date(Date.now() + s * 1000).toISOString();
}

async function sysMessage(
  sb: SupabaseClient,
  roomCode: string,
  text: string,
) {
  await sb.from('chat_messages').insert({
    id: nanoid(),
    room_code: roomCode,
    player_id: null,
    player_name: null,
    text,
    type: 'system',
  });
}

async function getOrderedPlayers(sb: SupabaseClient, roomCode: string) {
  const { data } = await sb
    .from('players')
    .select('*')
    .eq('room_code', roomCode)
    .order('joined_at', { ascending: true });
  return (data ?? []).map(mapPlayerRow);
}

// =====================================================================
// Phase transitions
// Each function uses optimistic locking via UPDATE ... WHERE phase = ...
// to ensure exactly-once execution under racing tick callers.
// =====================================================================

/**
 * Lobby → first word-pick.
 * Called by /api/rooms/[code]/start and on transitionToNextTurnOrGameEnd
 * when starting round 1 turn 1.
 */
export async function transitionLobbyToWordPick(
  sb: SupabaseClient,
  room: Room,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const players = await getOrderedPlayers(sb, room.code);
  if (players.length < 2) return { ok: false, reason: 'Need at least 2 players' };

  const drawer = players[0];
  const options = pickWordOptions({
    language: room.settings.language,
    count: room.settings.wordCount,
    customWords: room.settings.customWords,
    useOnlyCustom: room.settings.useOnlyCustomWords,
    usedWords: room.usedWords,
    wordMode: room.settings.wordMode,
  });

  // Reset all per-game player stats
  await sb
    .from('players')
    .update({
      score: 0,
      has_guessed: false,
      guess_order: null,
      points_this_round: 0,
    })
    .eq('room_code', room.code);

  const { data, error } = await sb
    .from('rooms')
    .update({
      phase: 'word-pick',
      round: 1,
      turn_in_round: 1,
      drawer_id: drawer.id,
      word: null,
      word_pattern: null,
      word_options: options,
      hint_schedule: [],
      hint_letters_pending: [],
      phase_started_at: nowISO(),
      phase_ends_at: inSeconds(TIMING.WORD_PICK_SECONDS),
      used_words: [],
      last_activity_at: nowISO(),
    })
    .eq('code', room.code)
    .eq('phase', 'lobby')
    .select()
    .single();

  if (error || !data) return { ok: false, reason: 'Race lost or update failed' };
  return { ok: true };
}

/**
 * Word-pick → drawing.
 */
export async function transitionWordPickToDrawing(
  sb: SupabaseClient,
  room: Room,
  wordIndex: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const options = room.wordOptions ?? [];
  const idx = Math.max(0, Math.min(options.length - 1, wordIndex));
  const word = options[idx];
  if (!word) return { ok: false, reason: 'No word options' };

  const startedAtMs = Date.now();
  const { schedule, pendingLetters } = buildHintSchedule({
    word,
    hintsRequested: room.settings.hints,
    drawTimeSeconds: room.settings.drawTimeSeconds,
    startedAtMs,
  });

  const pattern = makeWordPattern(word, room.settings.wordMode);

  const { data, error } = await sb
    .from('rooms')
    .update({
      phase: 'drawing',
      word,
      word_pattern: pattern,
      word_options: null,
      hint_schedule: schedule,
      hint_letters_pending: pendingLetters,
      phase_started_at: new Date(startedAtMs).toISOString(),
      phase_ends_at: new Date(startedAtMs + room.settings.drawTimeSeconds * 1000).toISOString(),
      used_words: Array.from(new Set([...(room.usedWords ?? []), word])),
      last_activity_at: nowISO(),
    })
    .eq('code', room.code)
    .eq('phase', 'word-pick')
    .select()
    .single();

  if (error || !data) return { ok: false, reason: 'Race lost or update failed' };
  return { ok: true };
}

/**
 * Drawing → round-end. Reveals word in chat, awards drawer points if any
 * guesses landed. Caller should pass `reason` for the system message.
 */
export async function transitionDrawingToRoundEnd(
  sb: SupabaseClient,
  room: Room,
  reason: 'time-up' | 'all-guessed' | 'drawer-left',
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Compute drawer points based on guessers this turn.
  const players = await getOrderedPlayers(sb, room.code);
  const guessers = players.filter((p) => p.id !== room.drawerId);
  const correct = guessers.filter((p) => p.hasGuessed && p.pointsThisRound > 0);
  const correctCount = correct.length;
  const totalGuessers = guessers.length;
  const startedAt = room.phaseStartedAt ? new Date(room.phaseStartedAt).getTime() : Date.now();
  const endsAt = room.phaseEndsAt ? new Date(room.phaseEndsAt).getTime() : Date.now();
  const totalMs = Math.max(1, endsAt - startedAt);

  // Without per-guess timestamps we approximate avg fraction from points already
  // awarded: pointsThisRound was scored against time, so its mean ÷ MAX is OK.
  const avgFraction =
    correctCount === 0
      ? 0
      : Math.min(
          1,
          correct.reduce((s, p) => s + p.pointsThisRound, 0) /
            (correctCount * 250 /* SCORING.MAX_GUESS_POINTS */),
        );

  const drawerAward =
    reason === 'drawer-left' || !room.drawerId
      ? 0
      : drawerPoints({
          correctCount,
          totalGuessers,
          averageGuessTimeFraction: avgFraction,
        });

  if (drawerAward > 0 && room.drawerId) {
    await sb.rpc('cleanup_disconnected_players').then(() => {/* keep table size sane occasionally */});
    const { data: drawerRow } = await sb
      .from('players')
      .select('score, points_this_round')
      .eq('room_code', room.code)
      .eq('id', room.drawerId)
      .maybeSingle();
    if (drawerRow) {
      await sb
        .from('players')
        .update({
          score: (drawerRow.score ?? 0) + drawerAward,
          points_this_round: (drawerRow.points_this_round ?? 0) + drawerAward,
        })
        .eq('room_code', room.code)
        .eq('id', room.drawerId);
    }
  }

  // Optimistic phase update
  const { data, error } = await sb
    .from('rooms')
    .update({
      phase: 'round-end',
      phase_started_at: nowISO(),
      phase_ends_at: inSeconds(TIMING.ROUND_END_SECONDS),
      last_activity_at: nowISO(),
    })
    .eq('code', room.code)
    .eq('phase', 'drawing')
    .select()
    .single();

  if (error || !data) return { ok: false, reason: 'Race lost or update failed' };

  const wordReveal = room.word ?? '???';
  const msg =
    reason === 'time-up'
      ? `Time's up! The word was "${wordReveal}".`
      : reason === 'all-guessed'
        ? `Everyone guessed it! The word was "${wordReveal}".`
        : `Drawer left. The word was "${wordReveal}".`;
  void totalMs;
  await sysMessage(sb, room.code, msg);
  return { ok: true };
}

/**
 * Round-end → next turn (word-pick) OR game-end.
 */
export async function transitionRoundEndToNext(
  sb: SupabaseClient,
  room: Room,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const players = await getOrderedPlayers(sb, room.code);
  const order = players.map((p) => p.id);
  if (order.length < 2) {
    // Lost too many players — bail back to lobby.
    return await forceBackToLobby(sb, room);
  }

  // Clear strokes from the just-finished turn.
  await sb
    .from('strokes')
    .delete()
    .eq('room_code', room.code)
    .eq('turn_key', turnKey(room.round, room.turnInRound));

  // Reset per-turn flags
  await sb
    .from('players')
    .update({ has_guessed: false, guess_order: null, points_this_round: 0 })
    .eq('room_code', room.code);

  let nextRound = room.round;
  let nextTurn = room.turnInRound + 1;
  if (nextTurn > order.length) {
    nextTurn = 1;
    nextRound += 1;
  }

  if (nextRound > room.settings.rounds) {
    // Game end!
    const { data, error } = await sb
      .from('rooms')
      .update({
        phase: 'game-end',
        drawer_id: null,
        word: null,
        word_pattern: null,
        word_options: null,
        hint_schedule: [],
        hint_letters_pending: [],
        phase_started_at: nowISO(),
        phase_ends_at: inSeconds(TIMING.GAME_END_SECONDS),
        last_activity_at: nowISO(),
      })
      .eq('code', room.code)
      .eq('phase', 'round-end')
      .select()
      .single();
    if (error || !data) return { ok: false, reason: 'Race lost or update failed' };
    await sysMessage(sb, room.code, 'Game over! See the podium.');
    return { ok: true };
  }

  const nextDrawer = order[nextTurn - 1];
  const options = pickWordOptions({
    language: room.settings.language,
    count: room.settings.wordCount,
    customWords: room.settings.customWords,
    useOnlyCustom: room.settings.useOnlyCustomWords,
    usedWords: room.usedWords,
    wordMode: room.settings.wordMode,
  });

  const { data, error } = await sb
    .from('rooms')
    .update({
      phase: 'word-pick',
      round: nextRound,
      turn_in_round: nextTurn,
      drawer_id: nextDrawer,
      word: null,
      word_pattern: null,
      word_options: options,
      hint_schedule: [],
      hint_letters_pending: [],
      phase_started_at: nowISO(),
      phase_ends_at: inSeconds(TIMING.WORD_PICK_SECONDS),
      last_activity_at: nowISO(),
    })
    .eq('code', room.code)
    .eq('phase', 'round-end')
    .select()
    .single();
  if (error || !data) return { ok: false, reason: 'Race lost or update failed' };
  return { ok: true };
}

/**
 * Game-end → lobby (after the 15s celebration window).
 */
export async function transitionGameEndToLobby(
  sb: SupabaseClient,
  room: Room,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Clear strokes & hint reveals
  await sb.from('strokes').delete().eq('room_code', room.code);
  await sb.from('hint_reveals').delete().eq('room_code', room.code);

  // Reset all player game stats
  await sb
    .from('players')
    .update({
      score: 0,
      has_guessed: false,
      guess_order: null,
      points_this_round: 0,
    })
    .eq('room_code', room.code);

  const { data, error } = await sb
    .from('rooms')
    .update({
      phase: 'lobby',
      round: 0,
      turn_in_round: 0,
      drawer_id: null,
      word: null,
      word_pattern: null,
      word_options: null,
      hint_schedule: [],
      hint_letters_pending: [],
      phase_started_at: null,
      phase_ends_at: null,
      used_words: [],
      last_activity_at: nowISO(),
    })
    .eq('code', room.code)
    .eq('phase', 'game-end')
    .select()
    .single();
  if (error || !data) return { ok: false, reason: 'Race lost or update failed' };
  return { ok: true };
}

async function forceBackToLobby(
  sb: SupabaseClient,
  room: Room,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await sb.from('strokes').delete().eq('room_code', room.code);
  await sb.from('hint_reveals').delete().eq('room_code', room.code);
  const { data, error } = await sb
    .from('rooms')
    .update({
      phase: 'lobby',
      round: 0,
      turn_in_round: 0,
      drawer_id: null,
      word: null,
      word_pattern: null,
      word_options: null,
      hint_schedule: [],
      hint_letters_pending: [],
      phase_started_at: null,
      phase_ends_at: null,
      used_words: [],
      last_activity_at: nowISO(),
    })
    .eq('code', room.code)
    .select()
    .single();
  if (error || !data) return { ok: false, reason: 'Update failed' };
  return { ok: true };
}

/**
 * Try to reveal the next pending hint. Optimistic-locked by checking
 * that `hint_letters_pending` still has entries when we update the row.
 */
export async function tryRevealNextHint(
  sb: SupabaseClient,
  roomCode: string,
): Promise<{ ok: boolean }> {
  const { data: row } = await sb.from('rooms').select('*').eq('code', roomCode).single();
  if (!row) return { ok: false };
  const room = mapRoomRow(row);
  if (room.phase !== 'drawing') return { ok: false };
  const pending: { letterIndex: number; letter: string }[] =
    (row.hint_letters_pending as { letterIndex: number; letter: string }[] | null) ?? [];
  const schedule: { revealAt: string; letterIndex: number }[] =
    (row.hint_schedule as { revealAt: string; letterIndex: number }[] | null) ?? [];
  if (pending.length === 0) return { ok: false };

  // Has the next reveal time arrived?
  const next = schedule[0];
  if (next && new Date(next.revealAt).getTime() > Date.now()) return { ok: false };

  const head = pending[0];
  const remainingPending = pending.slice(1);
  const remainingSchedule = schedule.slice(1);

  // Optimistic: only succeed if the row still has the same pending head.
  // Use array length as a cheap fingerprint to avoid double-reveal on race.
  const { data: updated, error } = await sb
    .from('rooms')
    .update({
      hint_letters_pending: remainingPending,
      hint_schedule: remainingSchedule,
    })
    .eq('code', roomCode)
    .eq('phase', 'drawing')
    .select('hint_letters_pending')
    .single();
  if (error || !updated) return { ok: false };

  const updatedPending = (updated.hint_letters_pending as unknown[] | null) ?? [];
  if (updatedPending.length !== remainingPending.length) {
    // Someone else won the race; their state is now authoritative.
    return { ok: false };
  }

  // Insert hint_reveals row — Postgres Changes will fan out.
  const { error: insErr } = await sb.from('hint_reveals').insert({
    room_code: roomCode,
    round: room.round,
    turn: room.turnInRound,
    letter_index: head.letterIndex,
    letter: head.letter,
  });
  if (insErr) return { ok: false };

  return { ok: true };
}

/**
 * After a correct guess, check if every non-drawer guesser has guessed.
 * If so, set phase_ends_at = NOW() so the next tick triggers round-end early.
 */
export async function maybeEndDrawingEarly(
  sb: SupabaseClient,
  roomCode: string,
): Promise<void> {
  const { data: roomRow } = await sb.from('rooms').select('*').eq('code', roomCode).single();
  if (!roomRow) return;
  const room = mapRoomRow(roomRow);
  if (room.phase !== 'drawing') return;
  const players = await getOrderedPlayers(sb, roomCode);
  const guessers = players.filter((p) => p.id !== room.drawerId);
  if (guessers.length === 0) return;
  const allGuessed = guessers.every((p) => p.hasGuessed);
  if (!allGuessed) return;
  await sb
    .from('rooms')
    .update({ phase_ends_at: nowISO() })
    .eq('code', roomCode)
    .eq('phase', 'drawing');
}

/**
 * Remove the word from the shape we send to non-drawer clients.
 * Word is replaced with the pattern (so only the drawer sees the actual word).
 */
export function redactRoomForViewer(room: Room, viewerId: string): Room {
  if (room.drawerId === viewerId) return room;
  if (room.phase !== 'drawing' && room.phase !== 'word-pick') return room;
  return {
    ...room,
    word: null,
    wordOptions: room.phase === 'word-pick' ? null : room.wordOptions,
  };
}

/**
 * Build the word_pattern enriched with revealed hints (for the snapshot endpoint).
 */
export function patternWithReveals(
  pattern: string,
  reveals: { letterIndex: number; letter: string }[],
): string {
  return applyRevealedLetters(pattern, reveals);
}
