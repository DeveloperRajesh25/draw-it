import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { adminClient } from '@/lib/supabase/server';
import { ChatBodySchema } from '@/lib/schemas';
import { bumpRoomActivity, handleZod, jsonError, loadPlayer, loadRoom, readJson } from '@/lib/api-helpers';
import { isCloseMatch, isExactMatch, normalize } from '@/lib/matching';
import { guesserPoints } from '@/lib/scoring';
import { maybeEndDrawingEarly } from '@/lib/transitions';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const body = ChatBodySchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);

    const sender = await loadPlayer(sb, code, body.playerId);
    if (!sender) return jsonError('Not in room', 403);

    const text = body.text.trim();
    if (!text) return NextResponse.json({ ok: true });

    // Drawer can never send chat during their own turn (anti-spoiler).
    if (room.phase === 'drawing' && room.drawerId === sender.id) {
      return jsonError('Drawers cannot chat during their turn', 403);
    }

    // Players who have already guessed correctly cannot reveal it in chat.
    // We let them chat normally though (just a normal message). Filtering
    // happens client-side based on player_id + correct-guess metadata.

    // Guess matching only applies during the drawing phase, only from non-drawers,
    // and only from players who haven't already guessed correctly.
    if (
      room.phase === 'drawing' &&
      room.word &&
      sender.id !== room.drawerId &&
      !sender.hasGuessed
    ) {
      if (isExactMatch(text, room.word)) {
        // Compute score
        const { count: correctSoFarRaw } = await sb
          .from('players')
          .select('id', { count: 'exact', head: true })
          .eq('room_code', code)
          .eq('has_guessed', true);
        const correctSoFar = correctSoFarRaw ?? 0;
        const guessOrder = correctSoFar + 1;

        const totalGuessersRaw = await sb
          .from('players')
          .select('id', { count: 'exact', head: true })
          .eq('room_code', code)
          .neq('id', room.drawerId ?? '');
        const totalGuessers = totalGuessersRaw.count ?? 1;

        const endsAt = room.phaseEndsAt ? new Date(room.phaseEndsAt).getTime() : Date.now();
        const timeRemaining = Math.max(0, (endsAt - Date.now()) / 1000);
        const totalDrawTime = Math.max(1, room.settings.drawTimeSeconds);
        const pts = guesserPoints({
          timeRemaining,
          totalDrawTime,
          guessOrder,
          totalGuessers,
        });

        await sb
          .from('players')
          .update({
            has_guessed: true,
            guess_order: guessOrder,
            score: sender.score + pts,
            points_this_round: sender.pointsThisRound + pts,
          })
          .eq('room_code', code)
          .eq('id', sender.id);

        // Insert correct-guess message. Text is the actual word so the
        // guesser themselves sees it; clients filter to show
        // "{name} guessed the word!" for everyone else.
        await sb.from('chat_messages').insert({
          id: body.id ?? nanoid(),
          room_code: code,
          player_id: sender.id,
          player_name: sender.name,
          text: room.word,
          type: 'correct-guess',
        });

        await bumpRoomActivity(sb, code);
        await maybeEndDrawingEarly(sb, code);
        return NextResponse.json({ ok: true, correct: true, points: pts });
      }

      if (isCloseMatch(text, room.word)) {
        await sb.from('chat_messages').insert({
          id: body.id ?? nanoid(),
          room_code: code,
          player_id: sender.id,
          player_name: sender.name,
          text: text,
          type: 'close-guess',
        });
        await bumpRoomActivity(sb, code);
        return NextResponse.json({ ok: true, close: true });
      }
    }

    // Normal chat. Truncate the visible text to a reasonable length and pass through.
    void normalize; // imported for future profanity work
    await sb.from('chat_messages').insert({
      id: body.id ?? nanoid(),
      room_code: code,
      player_id: sender.id,
      player_name: sender.name,
      text,
      type: 'normal',
    });
    await bumpRoomActivity(sb, code);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
