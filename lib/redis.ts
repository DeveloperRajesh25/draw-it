import 'server-only';
import { Redis } from '@upstash/redis';

/**
 * Hot-path cache for the chat verdict path.
 *
 * The bottleneck for a correct guess used to be ~800-1200ms of Supabase
 * round-trips: load room, load player, count guessers, count progress, update
 * player score, insert chat row, check for round-end, re-read phase. The
 * guesser couldn't see their message turn green until all of that finished.
 *
 * With Upstash Redis caching the turn-scoped state (word, drawer, deadlines,
 * guess-order claim hash), the chat route can verify a correct guess and
 * respond in ~30-80ms. The actual Supabase writes are deferred to `after()`
 * so they don't sit on the critical path.
 *
 * If Upstash env vars are not configured (e.g. local dev), every helper
 * returns null/undefined and the chat route silently falls back to Supabase.
 */

let _client: Redis | null = null;

function client(): Redis | null {
  if (_client) return _client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _client = new Redis({ url, token });
  return _client;
}

export type TurnCache = {
  round: number;
  turn: number;
  word: string;
  drawerId: string | null;
  phaseEndsAtMs: number;
  drawTimeSeconds: number;
  totalGuessers: number;
};

// 10 minutes — comfortably longer than the longest draw phase (4 min) plus
// word-pick and round-end windows. Stale entries auto-evict.
const TURN_TTL_SECONDS = 600;

function turnKey(code: string) {
  return `r:${code}:turn`;
}

function guessHashKey(code: string, round: number, turn: number) {
  return `r:${code}:guess:${round}-${turn}`;
}

function orderCounterKey(code: string, round: number, turn: number) {
  return `r:${code}:order:${round}-${turn}`;
}

export async function setTurnCache(code: string, data: TurnCache): Promise<void> {
  const r = client();
  if (!r) return;
  try {
    await r.set(turnKey(code), data, { ex: TURN_TTL_SECONDS });
  } catch (e) {
    console.error('[redis] setTurnCache failed', e);
  }
}

export async function getTurnCache(code: string): Promise<TurnCache | null> {
  const r = client();
  if (!r) return null;
  try {
    return await r.get<TurnCache>(turnKey(code));
  } catch (e) {
    console.error('[redis] getTurnCache failed', e);
    return null;
  }
}

export async function clearTurnCache(code: string, round?: number, turn?: number): Promise<void> {
  const r = client();
  if (!r) return;
  try {
    const keys: string[] = [turnKey(code)];
    if (typeof round === 'number' && typeof turn === 'number') {
      keys.push(guessHashKey(code, round, turn), orderCounterKey(code, round, turn));
    }
    await r.del(...keys);
  } catch (e) {
    console.error('[redis] clearTurnCache failed', e);
  }
}

// Atomic "claim a guess slot" — checks the player hasn't already guessed this
// turn AND assigns their guess order in a single Lua call. Returns the
// 1-based order on success, 0 if the player had already guessed, or null if
// Redis is unavailable (caller should fall back to the Supabase slow path).
const CLAIM_GUESS_SCRIPT = `
local hash_key = KEYS[1]
local counter_key = KEYS[2]
local player_id = ARGV[1]
local ttl = tonumber(ARGV[2])
if redis.call('HEXISTS', hash_key, player_id) == 1 then
  return 0
end
local order = redis.call('INCR', counter_key)
redis.call('HSET', hash_key, player_id, order)
redis.call('EXPIRE', hash_key, ttl)
redis.call('EXPIRE', counter_key, ttl)
return order
`;

export async function tryClaimGuess(
  code: string,
  round: number,
  turn: number,
  playerId: string,
): Promise<number | null> {
  const r = client();
  if (!r) return null;
  try {
    const result = await r.eval(
      CLAIM_GUESS_SCRIPT,
      [guessHashKey(code, round, turn), orderCounterKey(code, round, turn)],
      [playerId, String(TURN_TTL_SECONDS)],
    );
    const n = typeof result === 'number' ? result : Number(result);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    console.error('[redis] tryClaimGuess failed', e);
    return null;
  }
}
