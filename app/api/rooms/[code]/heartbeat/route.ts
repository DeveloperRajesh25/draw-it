import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { PlayerOnlySchema } from '@/lib/schemas';
import { handleZod, readJson } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const { playerId } = PlayerOnlySchema.parse(await readJson(req));
    const sb = adminClient();

    await sb
      .from('players')
      .update({
        connected: true,
        last_seen_at: new Date().toISOString(),
      })
      .eq('room_code', code)
      .eq('id', playerId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
