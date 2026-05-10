import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { SettingsBodySchema } from '@/lib/schemas';
import { bumpRoomActivity, handleZod, jsonError, loadRoom, readJson } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const body = SettingsBodySchema.parse(await readJson(req));
    const sb = adminClient();

    const { room } = await loadRoom(sb, code);
    if (!room) return jsonError('Room not found', 404);
    if (room.hostId !== body.playerId) return jsonError('Only the host can change settings', 403);
    if (room.phase !== 'lobby') return jsonError('Settings can only change in the lobby', 409);

    const updates: Record<string, unknown> = {};
    if (body.settings.language !== undefined) updates.language = body.settings.language;
    if (body.settings.maxPlayers !== undefined) updates.max_players = body.settings.maxPlayers;
    if (body.settings.drawTimeSeconds !== undefined)
      updates.draw_time_seconds = body.settings.drawTimeSeconds;
    if (body.settings.rounds !== undefined) updates.rounds = body.settings.rounds;
    if (body.settings.wordCount !== undefined) updates.word_count = body.settings.wordCount;
    if (body.settings.hints !== undefined) updates.hints = body.settings.hints;
    if (body.settings.wordMode !== undefined) updates.word_mode = body.settings.wordMode;
    if (body.settings.customWords !== undefined) updates.custom_words = body.settings.customWords;
    if (body.settings.useOnlyCustomWords !== undefined)
      updates.use_only_custom = body.settings.useOnlyCustomWords;
    updates.last_activity_at = new Date().toISOString();

    if (Object.keys(updates).length === 1) return NextResponse.json({ ok: true });

    const { error } = await sb.from('rooms').update(updates).eq('code', code);
    if (error) {
      console.error(error);
      return jsonError('Failed to update settings', 500);
    }
    await bumpRoomActivity(sb, code);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleZod(e);
  }
}
