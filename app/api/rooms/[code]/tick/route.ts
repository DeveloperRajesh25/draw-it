import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { PlayerOnlySchema } from '@/lib/schemas';
import { handleZod, jsonError, loadPlayer, loadRoom, readJson } from '@/lib/api-helpers';
import {
  transitionDrawingToRoundEnd,
  transitionGameEndToLobby,
  transitionRoundEndToNext,
  transitionWordPickToDrawing,
} from '@/lib/transitions';

export const dynamic = 'force-dynamic';

/**
 * Pull-based phase ticker. Any client whose local timer has expired calls this.
 * Optimistic locking inside the transition helpers ensures exactly-once execution.
 */
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

    // Authorize: the caller must be a member of the room.
    const player = await loadPlayer(sb, code, playerId);
    if (!player) return jsonError('Not in room', 403);

    // Has the deadline actually passed?
    if (!room.phaseEndsAt) {
      return NextResponse.json({ ok: true, alreadyAhead: true });
    }
    if (new Date(room.phaseEndsAt).getTime() > Date.now()) {
      return NextResponse.json({ ok: true, alreadyAhead: true });
    }

    switch (room.phase) {
      case 'word-pick': {
        const r = await transitionWordPickToDrawing(sb, room, 0);
        return NextResponse.json({ ok: true, raceLost: !r.ok });
      }
      case 'drawing': {
        const r = await transitionDrawingToRoundEnd(sb, room, 'time-up');
        return NextResponse.json({ ok: true, raceLost: !r.ok });
      }
      case 'round-end': {
        const r = await transitionRoundEndToNext(sb, room);
        return NextResponse.json({ ok: true, raceLost: !r.ok });
      }
      case 'game-end': {
        const r = await transitionGameEndToLobby(sb, room);
        return NextResponse.json({ ok: true, raceLost: !r.ok });
      }
      default:
        return NextResponse.json({ ok: true, ignored: true });
    }
  } catch (e) {
    return handleZod(e);
  }
}
