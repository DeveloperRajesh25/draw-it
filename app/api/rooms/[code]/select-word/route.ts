import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { SelectWordSchema } from '@/lib/schemas';
import { handleZod, jsonError, loadRoom, readJson } from '@/lib/api-helpers';
import { transitionWordPickToDrawing } from '@/lib/transitions';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const body = SelectWordSchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);
    if (room.phase !== 'word-pick') return jsonError('Not in word-pick phase', 409);
    if (room.drawerId !== body.playerId) return jsonError('Only the drawer can pick a word', 403);

    const result = await transitionWordPickToDrawing(sb, room, body.wordIndex);
    if (!result.ok) return jsonError(result.reason, 409);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
