import { z } from 'zod';
import { CHAT_MAX_LENGTH, CUSTOM_WORDS_MAX, NAME_MAX_LENGTH, SETTINGS_LIMITS } from './constants';

export const AvatarSchema = z.object({
  skinColor: z.number().int().min(0).max(31),
  eyes: z.number().int().min(0).max(31),
  mouth: z.number().int().min(0).max(31),
  special: z.number().int().min(-1).max(31),
});

export const PlayerIdSchema = z.string().min(1).max(64);

export const NameSchema = z
  .string()
  .min(1)
  .max(NAME_MAX_LENGTH)
  .transform((s) => s.trim())
  .refine((s) => s.length >= 1, 'Name required');

export const JoinBodySchema = z.object({
  playerId: PlayerIdSchema,
  name: NameSchema,
  avatar: AvatarSchema,
});

export const RejoinBodySchema = z.object({
  playerId: PlayerIdSchema,
});

export const PlayerOnlySchema = z.object({
  playerId: PlayerIdSchema,
});

export const SettingsSchema = z
  .object({
    language: z.string().min(2).max(8).optional(),
    maxPlayers: z
      .number()
      .int()
      .min(SETTINGS_LIMITS.maxPlayers.min)
      .max(SETTINGS_LIMITS.maxPlayers.max)
      .optional(),
    drawTimeSeconds: z
      .number()
      .int()
      .min(SETTINGS_LIMITS.drawTimeSeconds.min)
      .max(SETTINGS_LIMITS.drawTimeSeconds.max)
      .optional(),
    rounds: z.number().int().min(SETTINGS_LIMITS.rounds.min).max(SETTINGS_LIMITS.rounds.max).optional(),
    wordCount: z
      .number()
      .int()
      .min(SETTINGS_LIMITS.wordCount.min)
      .max(SETTINGS_LIMITS.wordCount.max)
      .optional(),
    hints: z.number().int().min(SETTINGS_LIMITS.hints.min).max(SETTINGS_LIMITS.hints.max).optional(),
    wordMode: z.enum(['normal', 'hidden', 'combination']).optional(),
    customWords: z.array(z.string().max(40)).max(CUSTOM_WORDS_MAX).optional(),
    useOnlyCustomWords: z.boolean().optional(),
  })
  .partial();

export const SettingsBodySchema = z.object({
  playerId: PlayerIdSchema,
  settings: SettingsSchema,
});

export const SelectWordSchema = z.object({
  playerId: PlayerIdSchema,
  wordIndex: z.number().int().min(0).max(10),
});

export const StrokeBodySchema = z.object({
  playerId: PlayerIdSchema,
  id: z.string().min(1).max(64),
  tool: z.enum(['brush', 'eraser', 'fill']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  size: z.number().int().min(1).max(80),
  points: z.array(z.number().finite()).min(2).max(20000),
});

export const ChatBodySchema = z.object({
  playerId: PlayerIdSchema,
  text: z.string().min(1).max(CHAT_MAX_LENGTH),
  // Client-supplied stable id so the sender can render an optimistic copy
  // and dedupe (upsert) when the canonical Realtime echo arrives.
  id: z.string().min(1).max(64).optional(),
});

export const KickBodySchema = z.object({
  playerId: PlayerIdSchema,
  targetId: PlayerIdSchema,
});

export const CreateRoomBodySchema = JoinBodySchema; // same payload
