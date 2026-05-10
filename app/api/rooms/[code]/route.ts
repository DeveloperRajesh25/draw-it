import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { handleZod, jsonError, loadRoom } from '@/lib/api-helpers';
import { mapChatRow, mapHintRow, mapPlayerRow, mapStrokeRow } from '@/lib/supabase/mappers';
import { turnKey } from '@/lib/transitions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rooms/[code]?playerId=...
 * Returns full room snapshot. The `word` field is null for non-drawer viewers.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
    const sb = adminClient();
    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);

    const [{ data: playersRows }, { data: chatRows }, { data: hintRows }] = await Promise.all([
      sb.from('players').select('*').eq('room_code', code).order('joined_at', { ascending: true }),
      sb.from('chat_messages').select('*').eq('room_code', code).order('created_at', { ascending: true }),
      sb.from('hint_reveals').select('*').eq('room_code', code).eq('round', room.round).eq('turn', room.turnInRound),
    ]);

    // Strokes for the current turn only.
    const tk = turnKey(room.round, room.turnInRound);
    const { data: strokeRows } = await sb
      .from('strokes')
      .select('*')
      .eq('room_code', code)
      .eq('turn_key', tk)
      .order('seq', { ascending: true });

    // Word visibility: only drawer sees the actual word during word-pick or drawing.
    const isDrawer = playerId && playerId === room.drawerId;
    const safeRoom = isDrawer
      ? room
      : {
          ...room,
          word: room.phase === 'round-end' || room.phase === 'game-end' ? room.word : null,
          wordOptions: isDrawer ? room.wordOptions : null,
        };

    return NextResponse.json({
      room: safeRoom,
      players: (playersRows ?? []).map(mapPlayerRow),
      strokes: (strokeRows ?? []).map(mapStrokeRow),
      chat: (chatRows ?? []).map(mapChatRow),
      hintReveals: (hintRows ?? []).map(mapHintRow).map((r) => ({
        letterIndex: r.letterIndex,
        letter: r.letter,
      })),
    });
  } catch (e) {
    return handleZod(e);
  }
}
