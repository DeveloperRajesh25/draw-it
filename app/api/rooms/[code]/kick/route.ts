import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { adminClient } from '@/lib/supabase/server';
import { KickBodySchema } from '@/lib/schemas';
import { bumpRoomActivity, handleZod, jsonError, loadPlayer, loadRoom, readJson } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const body = KickBodySchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);
    if (room.hostId !== body.playerId) return jsonError('Only the host can kick', 403);
    if (body.targetId === body.playerId) return jsonError('Host cannot kick themselves', 400);

    const target = await loadPlayer(sb, code, body.targetId);
    if (!target) return NextResponse.json({ ok: true });

    await sb.from('players').delete().eq('room_code', code).eq('id', body.targetId);
    await sb.from('chat_messages').insert({
      id: nanoid(),
      room_code: code,
      player_id: null,
      player_name: null,
      text: `${target.name} was removed from the room`,
      type: 'leave',
    });

    // If the kicked player was the drawer mid-game, force end of round.
    if (room.drawerId === body.targetId && room.phase === 'drawing') {
      await sb
        .from('rooms')
        .update({ phase_ends_at: new Date().toISOString() })
        .eq('code', code)
        .eq('phase', 'drawing');
    }
    await bumpRoomActivity(sb, code);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
