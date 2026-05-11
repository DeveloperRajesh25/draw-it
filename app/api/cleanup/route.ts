import { NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Public, idempotent janitor. Fired from the home page on mount so that
// every fresh visit sweeps out rooms/players older than 3 hours. This is
// the cron replacement (Vercel free tier doesn't allow per-minute crons).
export async function POST() {
  const sb = adminClient();
  const { error } = await sb.rpc('cleanup_disconnected_players');
  if (error) {
    console.error('[cleanup] rpc failed', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
