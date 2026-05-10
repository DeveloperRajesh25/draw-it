import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side admin client. NEVER import this in a Client Component or
// any module that the browser bundles. The 'server-only' guard above
// will hard-fail the build if you try.
let _admin: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
      );
    }
    _admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'public' },
    });
  }
  return _admin;
}
