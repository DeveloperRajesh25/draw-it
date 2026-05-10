import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { CreateRoomBodySchema } from '@/lib/schemas';
import { generateRoomCode } from '@/lib/room-code';
import { handleZod, jsonError, readJson } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = CreateRoomBodySchema.parse(await readJson(req));
    const sb = adminClient();

    // Try a few codes to dodge the rare collision.
    let code = '';
    for (let i = 0; i < 6; i++) {
      const candidate = generateRoomCode();
      const { data: existing } = await sb.from('rooms').select('code').eq('code', candidate).maybeSingle();
      if (!existing) {
        code = candidate;
        break;
      }
    }
    if (!code) return jsonError('Could not allocate a room code, try again', 503);

    const { error: roomErr } = await sb.from('rooms').insert({
      code,
      host_id: body.playerId,
    });
    if (roomErr) {
      console.error(roomErr);
      return jsonError('Failed to create room', 500);
    }

    const { error: playerErr } = await sb.from('players').insert({
      id: body.playerId,
      room_code: code,
      name: body.name,
      avatar: body.avatar,
      is_host: true,
      connected: true,
    });
    if (playerErr) {
      console.error(playerErr);
      // best-effort cleanup
      await sb.from('rooms').delete().eq('code', code);
      return jsonError('Failed to create host player', 500);
    }

    return NextResponse.json({ code });
  } catch (e) {
    return handleZod(e);
  }
}
