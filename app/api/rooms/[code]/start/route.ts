import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { PlayerOnlySchema } from '@/lib/schemas';
import { handleZod, jsonError, loadRoom, readJson } from '@/lib/api-helpers';
import { transitionLobbyToWordPick } from '@/lib/transitions';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const { playerId } = PlayerOnlySchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);
    if (room.hostId !== playerId) return jsonError('Only the host can start the game', 403);
    if (room.phase !== 'lobby') return jsonError('Game already in progress', 409);

    const result = await transitionLobbyToWordPick(sb, room);
    if (!result.ok) return jsonError(result.reason, 409);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
