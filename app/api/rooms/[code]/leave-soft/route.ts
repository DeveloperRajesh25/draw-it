import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { handleZod, readJson } from '@/lib/api-helpers';
import { PlayerOnlySchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

/**
 * Soft leave from `beforeunload` via sendBeacon. Just mark disconnected.
 * The janitor (or grace period) handles cleanup if they don't return in 60s.
 *
 * NOTE: sendBeacon sets Content-Type to text/plain or similar by default
 * (depending on the Blob), so we accept JSON best-effort here.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const raw = await readJson<{ playerId?: string }>(req);
    const { playerId } = PlayerOnlySchema.parse(raw);
    const sb = adminClient();

    await sb
      .from('players')
      .update({ connected: false, last_seen_at: new Date().toISOString() })
      .eq('room_code', code)
      .eq('id', playerId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
