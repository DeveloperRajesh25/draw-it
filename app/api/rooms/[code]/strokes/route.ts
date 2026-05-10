import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { PlayerOnlySchema, StrokeBodySchema } from '@/lib/schemas';
import { bumpRoomActivity, handleZod, jsonError, loadRoom, readJson } from '@/lib/api-helpers';
import { turnKey } from '@/lib/transitions';

export const dynamic = 'force-dynamic';

/**
 * POST — commit a complete stroke. Drawer-only, drawing phase only.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const body = StrokeBodySchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);
    if (room.phase !== 'drawing') return jsonError('Not in drawing phase', 409);
    if (room.drawerId !== body.playerId) return jsonError('Only the drawer may draw', 403);

    const tk = turnKey(room.round, room.turnInRound);
    const { error } = await sb.from('strokes').insert({
      id: body.id,
      room_code: code,
      turn_key: tk,
      tool: body.tool,
      color: body.color,
      size: body.size,
      points: body.points,
    });
    if (error) {
      // Duplicate id is OK — the drawer may retry.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      console.error(error);
      return jsonError('Failed to record stroke', 500);
    }
    await bumpRoomActivity(sb, code);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}

/**
 * DELETE — clear all strokes for the current turn. Drawer-only.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const { playerId } = PlayerOnlySchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);
    if (room.phase !== 'drawing') return jsonError('Not in drawing phase', 409);
    if (room.drawerId !== playerId) return jsonError('Only the drawer may clear', 403);

    const tk = turnKey(room.round, room.turnInRound);
    await sb.from('strokes').delete().eq('room_code', code).eq('turn_key', tk);
    await bumpRoomActivity(sb, code);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
