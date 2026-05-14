import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { nanoid } from 'nanoid';
import { adminClient } from '@/lib/supabase/server';
import { ChatBodySchema } from '@/lib/schemas';
import { handleZod, jsonError, loadPlayer, loadRoom, readJson } from '@/lib/api-helpers';
import { isCloseMatch, isExactMatch, normalize } from '@/lib/matching';
import { guesserPoints } from '@/lib/scoring';
import { maybeEndDrawingEarly } from '@/lib/transitions';
import { getTurnCache, tryClaimGuess } from '@/lib/redis';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const body = ChatBodySchema.parse(await readJson(req));
    const text = body.text.trim();
    if (!text) return NextResponse.json({ ok: true });
    const messageId = body.id ?? nanoid();
    const sb = adminClient();

    // ----------------------------------------------------------------
    // FAST PATH: Redis hot cache.
    //
    // When the round started we cached the word, drawer, deadlines, and
    // guesser count in Upstash Redis. A guess can be verified in ~30-80ms
    // total (one Redis GET + one atomic Lua claim) — vs the ~800-1200ms
    // Supabase path below. All DB writes are pushed into `after()` so the
    // guesser sees their green message immediately and the rest of the
    // bookkeeping (chat insert, score update, round-end transition) runs
    // out-of-band.
    // ----------------------------------------------------------------
    const turn = await getTurnCache(code);
    if (
      turn &&
      turn.word &&
      body.playerId !== turn.drawerId &&
      isExactMatch(text, turn.word)
    ) {
      const guessOrder = await tryClaimGuess(code, turn.round, turn.turn, body.playerId);
      if (guessOrder && guessOrder > 0) {
        const timeRemaining = Math.max(0, (turn.phaseEndsAtMs - Date.now()) / 1000);
        const pts = guesserPoints({
          timeRemaining,
          totalDrawTime: Math.max(1, turn.drawTimeSeconds),
          guessOrder,
          totalGuessers: Math.max(1, turn.totalGuessers),
        });

        // Best-effort hint to the client that this guess closed the round.
        // The watchdog and broadcastStateRefresh in use-room/Chat handle the
        // case where this estimate is wrong.
        const roundEnded = guessOrder >= turn.totalGuessers;

        after(async () => {
          try {
            await persistCorrectGuess({
              sb,
              code,
              senderId: body.playerId,
              messageId,
              word: turn.word,
              guessOrder,
              points: pts,
            });
          } catch (e) {
            console.error('[chat] deferred fast-path persist failed', e);
          }
        });

        return NextResponse.json({
          ok: true,
          correct: true,
          points: pts,
          messageId,
          roundEnded,
        });
      }
      // tryClaimGuess returned null (Redis unavailable) or 0 (player already
      // claimed a guess this turn). Either way, drop through to the slow
      // path so Supabase is the source of truth.
    }

    // ----------------------------------------------------------------
    // SLOW PATH: original Supabase-backed flow. Runs when Redis isn't
    // primed (dev without env vars, brand-new turn before cache write
    // settled, Redis network blip) or when the player has already claimed
    // a guess this turn.
    // ----------------------------------------------------------------
    const [{ room }, sender] = await Promise.all([
      loadRoom(sb, code),
      loadPlayer(sb, code, body.playerId),
    ]);
    if (!room) return jsonError('Room not found', 404);
    if (!sender) return jsonError('Not in room', 403);

    if (room.phase === 'drawing' && room.drawerId === sender.id) {
      return jsonError('Drawers cannot chat during their turn', 403);
    }

    if (
      room.phase === 'drawing' &&
      room.word &&
      sender.id !== room.drawerId &&
      !sender.hasGuessed
    ) {
      if (isExactMatch(text, room.word)) {
        // Guard against the deferred-write race: if a prior request from
        // this player already claimed the guess via Redis but its Supabase
        // update hasn't landed yet, sender.hasGuessed reads false here.
        // Re-checking the Redis claim catches the duplicate.
        const claim = await tryClaimGuess(code, room.round, room.turnInRound, sender.id);
        if (claim !== 0) {
          // Defer everything so the guesser still sees fast green even when
          // Redis is unavailable. Points/order/round-end are computed
          // inside the deferred block — the client doesn't need them in
          // the response.
          after(async () => {
            try {
              await persistCorrectGuessSlowPath({
                sb,
                room,
                sender,
                messageId,
                guessOrderHint: claim && claim > 0 ? claim : null,
              });
            } catch (e) {
              console.error('[chat] deferred slow-path persist failed', e);
            }
          });
          return NextResponse.json({
            ok: true,
            correct: true,
            messageId,
          });
        }
        // claim === 0 — already counted via fast path. Drop through and
        // treat as a normal chat message so the duplicate text still shows
        // up in chat (rare; happens on user double-submit or retry).
      }

      if (isCloseMatch(text, room.word)) {
        await sb.from('chat_messages').insert({
          id: messageId,
          room_code: code,
          player_id: sender.id,
          player_name: sender.name,
          text: text,
          type: 'close-guess',
        });
        void sb
          .from('rooms')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('code', code);
        return NextResponse.json({ ok: true, close: true, messageId });
      }
    }

    // Normal chat. Truncate the visible text to a reasonable length and pass through.
    void normalize; // imported for future profanity work
    await sb.from('chat_messages').insert({
      id: messageId,
      room_code: code,
      player_id: sender.id,
      player_name: sender.name,
      text,
      type: 'normal',
    });
    void sb
      .from('rooms')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('code', code);
    return NextResponse.json({ ok: true, messageId });
  } catch (e) {
    return handleZod(e);
  }
}

async function persistCorrectGuess(args: {
  sb: SupabaseClient;
  code: string;
  senderId: string;
  messageId: string;
  word: string;
  guessOrder: number;
  points: number;
}) {
  const { sb, code, senderId, messageId, word, guessOrder, points } = args;
  // We didn't load sender on the fast path — fetch the minimum we need now.
  const { data: sender } = await sb
    .from('players')
    .select('id, name, score, points_this_round')
    .eq('room_code', code)
    .eq('id', senderId)
    .maybeSingle();
  if (!sender) return;

  await Promise.all([
    sb
      .from('players')
      .update({
        has_guessed: true,
        guess_order: guessOrder,
        score: (sender.score ?? 0) + points,
        points_this_round: (sender.points_this_round ?? 0) + points,
      })
      .eq('room_code', code)
      .eq('id', sender.id),
    sb.from('chat_messages').insert({
      id: messageId,
      room_code: code,
      player_id: sender.id,
      player_name: sender.name,
      text: word,
      type: 'correct-guess',
    }),
    sb
      .from('rooms')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('code', code),
  ]);

  await maybeEndDrawingEarly(sb, code);
}

async function persistCorrectGuessSlowPath(args: {
  sb: SupabaseClient;
  room: NonNullable<Awaited<ReturnType<typeof loadRoom>>['room']>;
  sender: NonNullable<Awaited<ReturnType<typeof loadPlayer>>>;
  messageId: string;
  guessOrderHint: number | null;
}) {
  const { sb, room, sender, messageId, guessOrderHint } = args;
  const code = room.code;
  const [correctSoFarRes, totalGuessersRes] = await Promise.all([
    sb
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('room_code', code)
      .eq('has_guessed', true),
    sb
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('room_code', code)
      .neq('id', room.drawerId ?? ''),
  ]);
  const correctSoFar = correctSoFarRes.count ?? 0;
  // Redis claim, when available, is the authoritative guess order. The DB
  // count is a lagging approximation when other guessers' deferred updates
  // haven't landed yet.
  const guessOrder = guessOrderHint ?? correctSoFar + 1;
  const totalGuessers = totalGuessersRes.count ?? 1;
  const endsAt = room.phaseEndsAt ? new Date(room.phaseEndsAt).getTime() : Date.now();
  const timeRemaining = Math.max(0, (endsAt - Date.now()) / 1000);
  const totalDrawTime = Math.max(1, room.settings.drawTimeSeconds);
  const pts = guesserPoints({ timeRemaining, totalDrawTime, guessOrder, totalGuessers });

  await Promise.all([
    sb
      .from('players')
      .update({
        has_guessed: true,
        guess_order: guessOrder,
        score: sender.score + pts,
        points_this_round: sender.pointsThisRound + pts,
      })
      .eq('room_code', code)
      .eq('id', sender.id),
    sb.from('chat_messages').insert({
      id: messageId,
      room_code: code,
      player_id: sender.id,
      player_name: sender.name,
      text: room.word ?? '',
      type: 'correct-guess',
    }),
    sb
      .from('rooms')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('code', code),
  ]);

  await maybeEndDrawingEarly(sb, code);
}
