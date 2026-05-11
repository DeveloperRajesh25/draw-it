import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { adminClient } from '@/lib/supabase/server';
import { ChatBodySchema } from '@/lib/schemas';
import { handleZod, jsonError, loadPlayer, loadRoom, readJson } from '@/lib/api-helpers';
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

    // Fetch room and sender in parallel — they're independent reads.
    const [{ room }, sender] = await Promise.all([
      loadRoom(sb, code),
      loadPlayer(sb, code, body.playerId),
    ]);
    if (!room) return jsonError('Room not found', 404);
    if (!sender) return jsonError('Not in room', 403);

    const text = body.text.trim();
    if (!text) return NextResponse.json({ ok: true });

    // Drawer can never send chat during their own turn (anti-spoiler).
    if (room.phase === 'drawing' && room.drawerId === sender.id) {
      return jsonError('Drawers cannot chat during their turn', 403);
    }

    const messageId = body.id ?? nanoid();

    // Guess matching only applies during the drawing phase, only from non-drawers,
    // and only from players who haven't already guessed correctly.
    if (
      room.phase === 'drawing' &&
      room.word &&
      sender.id !== room.drawerId &&
      !sender.hasGuessed
    ) {
      if (isExactMatch(text, room.word)) {
        // Both counts are independent — fire them in parallel.
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
        const guessOrder = correctSoFar + 1;
        const totalGuessers = totalGuessersRes.count ?? 1;

        const endsAt = room.phaseEndsAt ? new Date(room.phaseEndsAt).getTime() : Date.now();
        const timeRemaining = Math.max(0, (endsAt - Date.now()) / 1000);
        const totalDrawTime = Math.max(1, room.settings.drawTimeSeconds);
        const pts = guesserPoints({
          timeRemaining,
          totalDrawTime,
          guessOrder,
          totalGuessers,
        });

        // Player score update + chat insert are independent — run them concurrently.
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
            text: room.word,
            type: 'correct-guess',
          }),
        ]);

        void sb
          .from('rooms')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('code', code);
        // Fire-and-forget: doing this synchronously delays the sender's
        // "correct!" verdict by an extra ~100-300ms of DB roundtrips, which
        // is the dominant source of the white→green flicker they see. Peers
        // pick up round-end via postgres_changes + the phase watchdog within
        // a few hundred ms — fine for the "everyone guessed" transition.
        void maybeEndDrawingEarly(sb, code);

        return NextResponse.json({
          ok: true,
          correct: true,
          points: pts,
          messageId,
        });
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
