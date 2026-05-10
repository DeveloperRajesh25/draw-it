import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { adminClient } from '@/lib/supabase/server';
import { PlayerOnlySchema } from '@/lib/schemas';
import { bumpRoomActivity, handleZod, loadRoom, readJson } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * Voluntary leave (button press). We delete the player row immediately.
 * If the host left, transfer host to the next-longest-connected player.
 * If the room is now empty, leave it for the janitor (avoids race with
 * other players still loading).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const { playerId } = PlayerOnlySchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return NextResponse.json({ ok: true });

    const { data: rows } = await sb
      .from('players')
      .select('*')
      .eq('room_code', code)
      .order('joined_at', { ascending: true });
    const players = rows ?? [];
    const leaver = players.find((p) => p.id === playerId);
    if (!leaver) return NextResponse.json({ ok: true });

    await sb.from('players').delete().eq('room_code', code).eq('id', playerId);
    await sb.from('chat_messages').insert({
      id: nanoid(),
      room_code: code,
      player_id: null,
      player_name: null,
      text: `${leaver.name} left the room`,
      type: 'leave',
    });

    if (leaver.is_host) {
      const next = players.find((p) => p.id !== playerId);
      if (next) {
        await sb
          .from('players')
          .update({ is_host: true })
          .eq('room_code', code)
          .eq('id', next.id);
        await sb.from('rooms').update({ host_id: next.id }).eq('code', code);
      }
    }

    // If the leaving player was the drawer mid-game, force end of round.
    if (room.drawerId === playerId && room.phase === 'drawing') {
      await sb
        .from('rooms')
        .update({ phase_ends_at: new Date().toISOString() })
        .eq('code', code)
        .eq('phase', 'drawing');
    }

    // If the room is now empty, delete it. Cascade removes strokes/chat/hints.
    const { count: remaining } = await sb
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('room_code', code);
    if ((remaining ?? 0) === 0) {
      await sb.from('rooms').delete().eq('code', code);
      return NextResponse.json({ ok: true, roomDeleted: true });
    }

    await bumpRoomActivity(sb, code);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
