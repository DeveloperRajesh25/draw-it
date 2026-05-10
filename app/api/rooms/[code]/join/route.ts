import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { adminClient } from '@/lib/supabase/server';
import { JoinBodySchema } from '@/lib/schemas';
import { bumpRoomActivity, handleZod, jsonError, loadRoom, readJson } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const body = JoinBodySchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);

    // If the player is already in the room (e.g. they navigated back), upgrade
    // them to connected rather than reject.
    const { data: existing } = await sb
      .from('players')
      .select('*')
      .eq('room_code', code)
      .eq('id', body.playerId)
      .maybeSingle();

    if (existing) {
      await sb
        .from('players')
        .update({
          name: body.name,
          avatar: body.avatar,
          connected: true,
          last_seen_at: new Date().toISOString(),
        })
        .eq('room_code', code)
        .eq('id', body.playerId);
      await bumpRoomActivity(sb, code);
      return NextResponse.json({ ok: true, rejoined: true });
    }

    if (room.phase !== 'lobby') {
      return jsonError('Game already in progress, ask the host', 409);
    }

    const { count } = await sb
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('room_code', code);
    if ((count ?? 0) >= room.settings.maxPlayers) {
      return jsonError('Room is full', 409);
    }

    const { error } = await sb.from('players').insert({
      id: body.playerId,
      room_code: code,
      name: body.name,
      avatar: body.avatar,
      is_host: false,
      connected: true,
    });
    if (error) {
      console.error(error);
      return jsonError('Failed to join', 500);
    }

    await sb.from('chat_messages').insert({
      id: nanoid(),
      room_code: code,
      player_id: null,
      player_name: null,
      text: `${body.name} joined the room`,
      type: 'join',
    });
    await bumpRoomActivity(sb, code);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
