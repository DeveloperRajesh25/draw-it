import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { PlayerOnlySchema } from '@/lib/schemas';
import { handleZod, jsonError, loadPlayer, readJson } from '@/lib/api-helpers';
import { tryRevealNextHint } from '@/lib/transitions';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const { playerId } = PlayerOnlySchema.parse(await readJson(req));
    const sb = adminClient();

    const player = await loadPlayer(sb, code, playerId);
    if (!player) return jsonError('Not in room', 403);

    const r = await tryRevealNextHint(sb, code);
    return NextResponse.json({ ok: r.ok });
  } catch (e) {
    return handleZod(e);
  }
}
