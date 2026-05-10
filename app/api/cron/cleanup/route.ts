import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron hits this every minute. We delete:
 *   - players disconnected for >60s
 *   - empty rooms older than 30 minutes
 *
 * Vercel's cron sends a Bearer token equal to env.CRON_SECRET when set.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const sb = adminClient();
  const { error } = await sb.rpc('cleanup_disconnected_players');
  if (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
