import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { PlayerOnlySchema } from '@/lib/schemas';
import { bumpRoomActivity, handleZod, jsonError, loadRoom, readJson } from '@/lib/api-helpers';
import { turnKey } from '@/lib/transitions';

export const dynamic = 'force-dynamic';

/**
 * DELETE the most recently committed stroke (undo).
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const { playerId } = PlayerOnlySchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);
    if (room.phase !== 'drawing') return jsonError('Not in drawing phase', 409);
    if (room.drawerId !== playerId) return jsonError('Only the drawer may undo', 403);

    const tk = turnKey(room.round, room.turnInRound);
    const { data: rows } = await sb
      .from('strokes')
      .select('id, seq')
      .eq('room_code', code)
      .eq('turn_key', tk)
      .order('seq', { ascending: false })
      .limit(1);

    if (rows && rows.length > 0) {
      await sb.from('strokes').delete().eq('id', rows[0].id);
    }
    await bumpRoomActivity(sb, code);
    return NextResponse.json({ ok: true, deletedId: rows?.[0]?.id ?? null });
  } catch (e) {
    return handleZod(e);
  }
}
