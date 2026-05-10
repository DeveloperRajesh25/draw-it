import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { RejoinBodySchema } from '@/lib/schemas';
import { bumpRoomActivity, handleZod, jsonError, loadPlayer, loadRoom, readJson } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * Fast path on page load. Assumes the player row already exists.
 * On 404, the client should fall through to the /join flow.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const { playerId } = RejoinBodySchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);

    const player = await loadPlayer(sb, code, playerId);
    if (!player) return jsonError('Player not in room', 404);

    await sb
      .from('players')
      .update({
        connected: true,
        last_seen_at: new Date().toISOString(),
      })
      .eq('room_code', code)
      .eq('id', playerId);
    await bumpRoomActivity(sb, code);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
