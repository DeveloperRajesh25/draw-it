import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { mapPlayerRow, mapRoomRow } from './supabase/mappers';
import type { Player, Room } from './types';

export function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export function handleZod(e: unknown) {
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: 'Invalid input', issues: e.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 },
    );
  }
  console.error('API error', e);
  return jsonError('Internal error', 500);
}

export async function loadRoom(
  sb: SupabaseClient,
  code: string,
): Promise<{ room: Room | null }> {
  const { data } = await sb.from('rooms').select('*').eq('code', code).maybeSingle();
  return { room: data ? mapRoomRow(data) : null };
}

export async function loadPlayer(
  sb: SupabaseClient,
  code: string,
  playerId: string,
): Promise<Player | null> {
  const { data } = await sb
    .from('players')
    .select('*')
    .eq('room_code', code)
    .eq('id', playerId)
    .maybeSingle();
  return data ? mapPlayerRow(data) : null;
}

export async function bumpRoomActivity(sb: SupabaseClient, code: string) {
  await sb.from('rooms').update({ last_activity_at: new Date().toISOString() }).eq('code', code);
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
