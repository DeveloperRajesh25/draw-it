# Draw It — Build Plan & Technical Spec

> A drawing-and-guessing game in the Skribbl.io tradition, built entirely on Next.js 16 + Supabase + Vercel, with the one fix everyone has been waiting for: **your room survives a mobile browser refresh**.

---

## 0. The Pitch

Skribbl.io is the canonical browser pictionary game: rooms, rounds, a drawer who picks one of 3 words, guessers who type into chat, points scaled by speed, a winner at the end. It works fine on desktop. On mobile, sharing the invite link to WhatsApp triggers a tab unload; the browser kills the WebSocket and forgets the player; coming back drops them on the homepage and the room often dies with them. We're building a **single Next.js 16 application** (frontend + API routes in one codebase) backed by **Supabase Postgres + Realtime** for state and live sync, deployed entirely on **Vercel**. Because room state lives in Postgres — not in a transient server process — a tab can be backgrounded, reloaded, killed, or restarted and the player is auto-rejoined to the same room with the same identity and score.

---

## 1. The Persistence Problem (the headline feature)

### What goes wrong in skribbl.io on mobile

1. User on phone taps **Create Room** → gets a room code and an invite link.
2. User taps **Copy** and switches to WhatsApp to paste the link.
3. iOS Safari / mobile Chrome aggressively unloads backgrounded tabs to save memory.
4. User comes back. The page reloads from scratch.
5. The WebSocket is gone. The client had no persisted state. The client lands on the homepage as a new visitor.
6. On the server, the original player is still considered "in the room" briefly, then either kicked for inactivity or — worse — was the host, and the room dies entirely.
7. Friends clicking the invite link get "Room not found."

### The four-layer fix

| Layer | Mechanism | Purpose |
|---|---|---|
| **L1: URL** | Room code in path: `/r/ABC123` | Fresh load knows which room to look for |
| **L2: Local identity** | `localStorage.skribl.player = { id, name, avatar }` | Stable player ID across reloads — your "passport" |
| **L3: Local session** | `localStorage.skribl.session = { roomId, role, lastActiveAt }` | "You were in room X — try to rejoin first thing" |
| **L4: Server-side persistence** | Room rows in Postgres, players have a 60-second grace period before removal | The room exists independent of any client connection. Reconnect within 60s slots back into the same seat with the same score |

### Why this stack makes L4 trivial

In a traditional Node + Socket.IO setup, room state lives in the server process's memory. If the process dies (deploy, crash, scaling event), every active room dies with it. Worse, the server has no way to distinguish "Alice is unreachable for 5 seconds because she's switching apps" from "Alice closed the tab forever."

With **Postgres-as-source-of-truth**:
- Rooms are rows. They survive Vercel deploys. They survive Supabase maintenance.
- Players are rows with a `last_seen_at` timestamp. A heartbeat updates it.
- A simple `WHERE last_seen_at < NOW() - INTERVAL '60 seconds'` query identifies disconnected players for cleanup.
- Supabase **Presence** layered on top gives instant "who's online right now" without us writing heartbeat code.

### The reconnection flow (client boot)

```
on page load:
  1. parse URL → if /r/{code}, target room = code
  2. read localStorage.skribl.player → if missing, generate new
  3. read localStorage.skribl.session
  4. if target room && session.roomId === target room:
       POST /api/rooms/{code}/rejoin { playerId }
       on success → straight into game; subscribe to Realtime
       on fail → fall through to step 5
  5. if target room (URL has code, no session match):
       show "Join {ROOM}" screen with name pre-filled
       POST /api/rooms/{code}/join → subscribe to Realtime
  6. else: home screen
```

### Server-side rules

- **Rooms are Postgres rows, never tied to a connection.** `DELETE` only happens via the janitor.
- **Player rows have `connected: bool` and `last_seen_at: timestamptz`.** When Supabase Presence detects a disconnect, we do NOT delete — we set `connected = false`.
- **Heartbeat:** every connected client `POST /api/rooms/{code}/heartbeat` every 20 seconds, updating `last_seen_at`.
- **Janitor:** a Postgres function (or Supabase scheduled function) running every 60s removes players where `connected = false AND last_seen_at < NOW() - 60 seconds`. Removes rooms with 0 players and `last_activity_at < NOW() - 30 minutes`.
- **Host transfer is sticky to player ID, not connection.** If host disconnects, do NOT transfer immediately. After 60s grace, transfer to the next-longest-connected player.
- **Drawer disconnect during their turn:** if they don't return within 15 seconds, end the round early with reason `drawer-left`.

### Mobile-specific extras

- **Page Visibility API:** when `document.hidden` flips false, immediately ping `/api/rooms/{code}/heartbeat` and re-subscribe to the Realtime channel. Don't wait for the next interval.
- **`beforeunload`:** fire a `navigator.sendBeacon` to `/api/rooms/{code}/leave-soft` so the server can start the grace timer immediately rather than waiting for Realtime to time out.

### Test scenarios the build must pass

1. ✅ Create room on mobile → switch to Messages app → return after 5 seconds → still in room.
2. ✅ Hard refresh during lobby → auto-rejoin in <1s, all data intact.
3. ✅ Hard refresh during drawing (as drawer) → canvas restored from DB, can continue drawing.
4. ✅ Hard refresh during drawing (as guesser) → see current canvas + word hints + chat scrollback.
5. ✅ Lock phone for 30s, unlock → reconnect with no data loss.
6. ✅ Lock phone for 5 minutes → reconnect if room still alive.
7. ✅ Force-quit browser app → reopen URL → auto-rejoin.
8. ✅ Three friends share invite link → all in same room with unique seats.

---

## 2. Tech Stack (locked in)

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router, React 19.2, Turbopack) |
| Language | **TypeScript 5.5+** strict mode |
| Styling | **Tailwind CSS 4** |
| UI primitives | **shadcn/ui** (Radix-based, drop-in components) |
| Icons | **lucide-react** |
| Animation | **framer-motion** for transitions, CSS-only for micro-interactions |
| Database | **Supabase Postgres** |
| Real-time | **Supabase Realtime** (Broadcast + Postgres Changes + Presence) |
| State | **Zustand** for client-side game state (mirrors server) |
| Validation | **Zod** for API input schemas |
| Rate limiting | **Upstash Redis** + `@upstash/ratelimit` (optional, can defer) |
| Hosting | **Vercel** (frontend + API routes), **Supabase Cloud** (DB + Realtime), **Upstash** (Redis) |
| ID generation | **nanoid** |
| Fuzzy matching | `fast-levenshtein` |

### Why this works on Vercel (the constraint that killed the previous plan)

Vercel runs Next.js API routes as serverless functions — short-lived processes that don't keep WebSocket connections open. That's a problem for traditional multiplayer games that rely on `socket.io` server-side.

**The trick:** clients connect to **Supabase Realtime** (a separately hosted, persistent WebSocket cluster) directly. Vercel functions only handle one-shot HTTP requests: writes to Postgres, validation, scoring. Real-time fan-out is Supabase's job.

```
┌─────────────────┐   HTTPS    ┌─────────────────┐
│ Browser         │◄──────────►│ Vercel Function │  (writes to DB)
│  (Next.js app)  │            │ (Next.js API)   │
└─────────────────┘            └─────────────────┘
        │                               │
        │ WebSocket                     │ Postgres protocol
        ▼                               ▼
┌─────────────────────────────────────────────────┐
│            Supabase                              │
│  - Postgres (room state, players, chat, strokes)│
│  - Realtime (fanout via WebSocket cluster)      │
│  - Auth (anonymous user sessions, optional)     │
└─────────────────────────────────────────────────┘
        ▲
        │ HTTPS (rate limit checks)
        │
┌─────────────────┐
│ Upstash Redis   │  (optional - rate limiting only)
└─────────────────┘
```

This is a well-proven pattern; Supabase's docs explicitly call out multiplayer games as a use case.

### What NOT to use

- ❌ **socket.io** — incompatible with Vercel's serverless model
- ❌ **A second Node.js backend** — defeats the purpose of going Vercel-only
- ❌ **Heavy canvas libraries (Fabric.js, Konva)** — overkill, slow on mid-range Android
- ❌ **GraphQL** — REST + Realtime is simpler here
- ❌ **Vercel KV** — fine for KV needs, but Postgres is already where the data lives

---

## 3. Architecture

### Three pieces of real-time machinery

Supabase Realtime exposes three modes. We use all three:

| Mode | Used for | Why |
|---|---|---|
| **Postgres Changes** | Room state, chat, players, strokes (committed) | Source-of-truth events. Slower (~100-200ms) but reliable and persistent |
| **Broadcast** | Live drawing strokes in progress, ephemeral signals | Low-latency (~30-80ms), no DB round-trip. Doesn't persist |
| **Presence** | Who's online right now | Auto-handles disconnect detection; gives us heartbeat for free |

### Drawing data flow (the high-frequency part)

```
DRAWER                                 OTHER PLAYERS
  │                                       │
  │ pointer move                          │
  │ ─────────────────────────► Broadcast: "stroke-update"
  │                            (30fps batched)
  │                                       │
  │ pointer up                            │
  │                                       │
  │ ─► POST /api/rooms/{code}/strokes ────►
  │    (commit full stroke)               │
  │                                       │
  │                            Postgres Changes: new stroke row
  │                            ──────────────────────────────►
  │                                       (idempotent — drop dups by stroke ID)
```

- **Live preview:** Broadcast carries each batch of 5-10 points to all viewers within ~50ms. Their canvas updates immediately.
- **Persistence:** When the stroke is complete, the drawer commits it via API. The stroke row in DB is the source of truth for late-joiners and reconnects.
- **Dedup:** Each stroke has a `nanoid()` ID. Clients keep a Set of seen IDs and ignore both Broadcast updates and Postgres Changes for IDs they already rendered.

### Game phase transitions (without a persistent server process)

The hard part of serverless real-time is **timed events**: who advances the game from "drawing" to "round-end" when the 80-second timer hits zero?

We use a **pull-based ticking** pattern:

1. When a phase begins, the API writes `phase_ends_at` to the room row.
2. Every connected client computes `secondsRemaining = phase_ends_at - now()` locally and renders the timer.
3. When ANY client's local timer hits 0, it calls `POST /api/rooms/{code}/tick`.
4. The API uses **optimistic locking** to advance the phase exactly once:
   ```sql
   UPDATE rooms
   SET phase = 'round-end', phase_ends_at = NOW() + INTERVAL '5 seconds', ...
   WHERE code = $1 AND phase = 'drawing' AND phase_ends_at < NOW();
   -- If RETURNING * is empty, someone else already did it.
   ```
5. Postgres Changes broadcasts the new phase to everyone.

For **hint reveals during drawing**, the same pattern: `hint_schedule` is a JSON array of revealAt timestamps. The first client to notice a missed reveal calls `POST /api/rooms/{code}/reveal-hint` which inserts the next hint via optimistic locking. (Letters are inserted server-side from the secret word; clients never see the schedule of letters.)

This works because:
- ✅ Multiple players are usually connected → some client will tick.
- ✅ Optimistic locking prevents double-fires.
- ✅ If everyone's offline, the room hangs harmlessly until someone returns and triggers the catch-up tick.

For full reliability under all-offline scenarios, you can layer **Upstash QStash** later: when a phase starts, schedule an HTTP webhook to fire at the deadline. Belt-and-braces. **Defer this to v2.**

---

## 4. Database Schema

Run this SQL in Supabase. Save as `supabase/schema.sql` in the repo.

```sql
-- =====================================================================
-- ROOMS
-- =====================================================================
CREATE TABLE rooms (
  code              TEXT PRIMARY KEY,
  host_id           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- settings
  language          TEXT NOT NULL DEFAULT 'en',
  max_players       INT  NOT NULL DEFAULT 8,
  draw_time_seconds INT  NOT NULL DEFAULT 80,
  rounds            INT  NOT NULL DEFAULT 3,
  word_count        INT  NOT NULL DEFAULT 3,
  hints             INT  NOT NULL DEFAULT 2,
  word_mode         TEXT NOT NULL DEFAULT 'normal',
  custom_words      TEXT[] NOT NULL DEFAULT '{}',
  use_only_custom   BOOLEAN NOT NULL DEFAULT false,

  -- game state
  phase             TEXT NOT NULL DEFAULT 'lobby',
  round             INT  NOT NULL DEFAULT 0,
  turn_in_round     INT  NOT NULL DEFAULT 0,
  drawer_id         TEXT,
  word              TEXT,
  word_pattern      TEXT,
  word_options      TEXT[],
  phase_started_at  TIMESTAMPTZ,
  phase_ends_at     TIMESTAMPTZ,
  used_words        TEXT[] NOT NULL DEFAULT '{}',
  hint_schedule     JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX rooms_last_activity_idx ON rooms (last_activity_at);

-- =====================================================================
-- PLAYERS
-- =====================================================================
CREATE TABLE players (
  id                 TEXT NOT NULL,
  room_code          TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  avatar             JSONB NOT NULL DEFAULT '{}',
  score              INT  NOT NULL DEFAULT 0,
  is_host            BOOLEAN NOT NULL DEFAULT false,
  joined_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connected          BOOLEAN NOT NULL DEFAULT true,
  has_guessed        BOOLEAN NOT NULL DEFAULT false,
  guess_order        INT,
  points_this_round  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id, room_code)
);

CREATE INDEX players_room_idx ON players (room_code);
CREATE INDEX players_last_seen_idx ON players (last_seen_at) WHERE connected = false;

-- =====================================================================
-- STROKES (current turn's drawing)
-- =====================================================================
CREATE TABLE strokes (
  id          TEXT PRIMARY KEY,
  room_code   TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  turn_key    TEXT NOT NULL,                -- e.g. "1-2" for round 1 turn 2
  seq         BIGSERIAL,                    -- ordering within turn
  tool        TEXT NOT NULL,                -- 'brush' | 'eraser' | 'fill'
  color       TEXT NOT NULL,
  size        INT  NOT NULL,
  points      JSONB NOT NULL,               -- compact [x1,y1,x2,y2,...]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX strokes_room_turn_idx ON strokes (room_code, turn_key, seq);

-- =====================================================================
-- CHAT
-- =====================================================================
CREATE TABLE chat_messages (
  id           TEXT PRIMARY KEY,
  room_code    TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  player_id    TEXT,
  player_name  TEXT,
  text         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'normal',  -- normal | system | correct-guess | close-guess | join | leave
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX chat_room_created_idx ON chat_messages (room_code, created_at DESC);

-- =====================================================================
-- HINT REVEALS
-- =====================================================================
CREATE TABLE hint_reveals (
  room_code     TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  round         INT NOT NULL,
  turn          INT NOT NULL,
  letter_index  INT NOT NULL,
  letter        TEXT NOT NULL,
  revealed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_code, round, turn, letter_index)
);

-- =====================================================================
-- ENABLE REALTIME for the tables we want clients to subscribe to.
-- =====================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE strokes;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE hint_reveals;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
-- We disable RLS for v1 because the API routes use the service role and
-- handle all validation. Clients only READ via Realtime; the table data
-- is room-scoped and the room code is the security boundary.
-- ENABLE LATER if you add accounts.
ALTER TABLE rooms          DISABLE ROW LEVEL SECURITY;
ALTER TABLE players        DISABLE ROW LEVEL SECURITY;
ALTER TABLE strokes        DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages  DISABLE ROW LEVEL SECURITY;
ALTER TABLE hint_reveals   DISABLE ROW LEVEL SECURITY;

-- =====================================================================
-- JANITOR (cleanup)
-- =====================================================================
CREATE OR REPLACE FUNCTION cleanup_disconnected_players() RETURNS void AS $$
BEGIN
  -- Remove players disconnected for >60s
  DELETE FROM players
  WHERE connected = false
    AND last_seen_at < NOW() - INTERVAL '60 seconds';

  -- Delete empty rooms older than 30 minutes
  DELETE FROM rooms
  WHERE NOT EXISTS (SELECT 1 FROM players WHERE players.room_code = rooms.code)
    AND last_activity_at < NOW() - INTERVAL '30 minutes';
END;
$$ LANGUAGE plpgsql;

-- Schedule via Supabase Cron (in dashboard) every minute, or call from a Vercel Cron job.
```

### Realtime subscription pattern (client-side)

```ts
const channel = supabase.channel(`room:${code}`);

channel
  // postgres CDC
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
      handleRoomChange)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${code}` },
      handlePlayerChange)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'chat_messages', filter: `room_code=eq.${code}` },
      handleChatChange)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'strokes', filter: `room_code=eq.${code}` },
      handleStrokeChange)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'hint_reveals', filter: `room_code=eq.${code}` },
      handleHintReveal)

  // broadcast for live drawing
  .on('broadcast', { event: 'stroke-preview' }, handleStrokePreview)

  // presence for connection tracking
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    handlePresenceSync(state);
  })

  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ playerId, name, joinedAt: Date.now() });
    }
  });
```

---

## 5. API Routes

All under `app/api/` (Next.js App Router Route Handlers). Bodies validated with Zod.

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/api/rooms` | `{ name, avatar, playerId }` | Create new room, host joins |
| POST | `/api/rooms/[code]/join` | `{ name, avatar, playerId }` | Join existing room |
| POST | `/api/rooms/[code]/rejoin` | `{ playerId }` | Fast path on reload — assumes player already exists |
| POST | `/api/rooms/[code]/leave` | `{ playerId }` | Voluntary leave |
| POST | `/api/rooms/[code]/leave-soft` | `{ playerId }` | Soft leave from `beforeunload` (mark disconnected) |
| POST | `/api/rooms/[code]/heartbeat` | `{ playerId }` | Update `last_seen_at`, set `connected = true` |
| GET  | `/api/rooms/[code]` | — | Snapshot of full room state |
| PUT  | `/api/rooms/[code]/settings` | `Partial<Settings>` | Host updates settings |
| POST | `/api/rooms/[code]/start` | `{ playerId }` | Host starts game |
| POST | `/api/rooms/[code]/select-word` | `{ playerId, wordIndex }` | Drawer picks word |
| POST | `/api/rooms/[code]/strokes` | `Stroke` | Drawer commits a complete stroke |
| DELETE | `/api/rooms/[code]/strokes/last` | `{ playerId }` | Undo |
| DELETE | `/api/rooms/[code]/strokes` | `{ playerId }` | Clear |
| POST | `/api/rooms/[code]/chat` | `{ playerId, text }` | Send chat or guess |
| POST | `/api/rooms/[code]/tick` | `{ playerId }` | Trigger phase transition (any client when local timer hits 0) |
| POST | `/api/rooms/[code]/reveal-hint` | `{ playerId }` | Trigger hint reveal (any client) |
| POST | `/api/rooms/[code]/kick` | `{ playerId, targetId }` | Host kick |

**All write endpoints use the Supabase service role key** (server-side only) and validate `playerId` is a member of the room.

---

## 6. Game Mechanics & Rules

### Turn structure

```
For each round (1 to settings.rounds):
  For each player (in join order):
    1. WORD-PICK PHASE (15s)
       - Server picks N random words (settings.wordCount, default 3) from
         language pool + custom words.
       - Sets word_options on the room row. Drawer's client filters & shows.
       - Others see "{Drawer} is choosing…" with placeholder pills.
       - If timer hits 0 without selection, server auto-picks word_options[0].
    2. DRAWING PHASE (settings.drawTimeSeconds, default 80)
       - phase = 'drawing'. word, word_pattern, hint_schedule populated.
       - Drawer draws → strokes table fills.
       - Guessers chat → chat_messages fills.
       - On exact match: insert chat_message type='correct-guess', update
         player score, update has_guessed.
       - When ALL non-drawer players have guessed: end early.
       - Timer hits 0: end normally.
       - Drawer disconnects 15s+ : end with reason='drawer-left'.
    3. ROUND-END PHASE (5s)
       - Reveal word in chat (system message).
       - Show scoreboard.
       - Increment turn_in_round (or round if last player).
       - Reset has_guessed, points_this_round.
       - Clear strokes for the next turn (DELETE WHERE turn_key = previous).
```

### Hint reveal timing

- Total hints to reveal = `min(settings.hints, floor(word_length / 2) - 1)`. Words ≤4 letters get 0 hints.
- Letters revealed at evenly-spaced points during the drawing phase.
- For 80s draw time and 2 hints: reveal at t=53s remaining and t=27s remaining.
- Reveal **random non-space indices**, not always the first letter.
- Server stores `hint_schedule` as `[{ revealAt: ISO, letterIndex: number }]` plus a separate, server-only column `hint_letters_pending` that holds the actual letters to reveal in order. (Letters are NOT sent to clients in the schedule — only revealed via `hint_reveals` rows.)

### Scoring formula

```ts
const MAX_GUESS_POINTS  = 250;
const MIN_GUESS_POINTS  = 50;
const FIRST_GUESS_BONUS = 50;
const DRAWER_PER_GUESS  = 50;

function guesserPoints(opts: {
  timeRemaining: number;
  totalDrawTime: number;
  guessOrder: number;       // 1 = first
  totalGuessers: number;    // non-drawer count
}) {
  const timeFraction  = opts.timeRemaining / opts.totalDrawTime;       // 1.0 → 0.0
  const orderFraction = 1 - (opts.guessOrder - 1) / opts.totalGuessers;
  const weight = 0.6 * timeFraction + 0.4 * orderFraction;
  let pts = MIN_GUESS_POINTS + Math.floor(weight * (MAX_GUESS_POINTS - MIN_GUESS_POINTS));
  if (opts.guessOrder === 1) pts += FIRST_GUESS_BONUS;
  return pts;
}

function drawerPoints(opts: {
  correctCount: number;
  totalGuessers: number;
  averageGuessTimeFraction: number;  // 0..1
}) {
  if (opts.correctCount === 0) return 0;
  return Math.floor(
    DRAWER_PER_GUESS * opts.correctCount * (0.5 + 0.5 * opts.averageGuessTimeFraction)
  );
}
```

Edge cases:
- Drawer disconnects mid-round → no points awarded that turn.
- Nobody guesses → drawer 0, guessers 0.
- 2-player game with drawer: only 1 guesser, formula still works (`totalGuessers = 1`).

### Word matching

```ts
function normalize(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

function isExactMatch(guess: string, word: string): boolean {
  return normalize(guess) === normalize(word);
}

function isCloseMatch(guess: string, word: string): boolean {
  const g = normalize(guess), w = normalize(word);
  if (g === w) return false;
  if (Math.abs(g.length - w.length) > 2) return false;
  return levenshtein(g, w) <= 1;
}
```

When a guess is close (Levenshtein 1), insert a chat message of type `close-guess` visible only to that guesser (filter client-side based on `player_id`).

### Anti-spoiler / anti-cheat

- **Hide the word in chat** — when a guesser sends the exact word, in everyone else's chat replace their message with `{Name} guessed the word!` (insert message of type `correct-guess` with `text = ''`).
- **Drawer can't chat during their turn** — server-side reject.
- **Once you've guessed correctly, you can only chat with other correct guessers** — filter client-side on `type === 'correct-guess'` and message metadata, or send a system message visible to drawer + correct-guessers only.
- **Word never appears in any URL or in DOM for non-drawers.**
- **Rate-limit chat** to ~3 messages/second per player via Upstash Ratelimit.

---

## 7. Drawing System

### Canvas
- **Logical size: 800 × 600.** All coordinates flow through this normalized space.
- Render at `devicePixelRatio` for sharpness on retina/mobile.
- `touch-action: none` on the canvas element.

### Tools, sizes, colors
```ts
export const BRUSH_SIZES = [4, 10, 20, 32, 40] as const;

export const COLORS = [
  '#FFFFFF', '#000000', '#C1C1C1', '#4C4C4C',
  '#EF130B', '#740B07',
  '#FF7100', '#C23800',
  '#FFE400', '#E8A200',
  '#00CC00', '#005510',
  '#00FF91', '#00B5AD',
  '#00B2FF', '#00569E',
  '#231FD3', '#0E0865',
  '#A300BA', '#550069',
  '#DF69A7', '#873554',
  '#FFAC8E', '#CC774D',
  '#A0613C', '#63300D',
] as const;
```

### Pointer Events + 30fps batching
- Single API for mouse/touch/pen.
- Buffer points client-side; flush via Broadcast every 33ms while drawing.
- On `pointerup`: send the full stroke via `POST /api/rooms/[code]/strokes` (commits to DB).
- Optimistic local render: drawer sees their own stroke instantly without waiting for server roundtrip.
- Other clients render Broadcast preview immediately; the eventual DB-via-Realtime arrival is deduped by stroke ID.

### Flood fill (paint bucket)
Stack-based scanline fill on `ImageData`. Send as a single `{ tool: 'fill', color, points: [[x, y]] }` stroke. Other clients replay the same algorithm locally — never send the result bitmap.

### Reconnection / late-join
On join, `GET /api/rooms/[code]` returns full state including all `strokes` for the current `turn_key`. Client renders them in `seq` order onto the canvas.

---

## 8. Word System

- Bundle `data/words/en.json` with ~1500 words (write your own; safer than borrowing skribbl's list).
- Categories: animals, food, household, sports, places, abstract, simple verbs, etc.
- Custom words: host pastes comma-separated. If `useOnlyCustomWords`, restrict pool. Refuse to start if pool < `wordCount × players × rounds`.
- Track `used_words` per game so words don't repeat in one match.

---

## 9. UI / Screen Plan

### Routes (Next.js App Router)

| Path | Purpose |
|---|---|
| `/` | Home — name input, Create / Join |
| `/r/[code]` | Room page — lobby & game in one client component |
| `/about` | (optional) what the game is, the persistence story |
| `/api/...` | Route handlers per §5 |

### Screen states (within `/r/[code]`)

1. **Connecting** — full-page loader (~500ms) while subscribing + rejoin runs.
2. **Joining** — name + avatar form if no session and URL has a code.
3. **Lobby** — host: settings + Start; everyone: player list + room code + big Copy Invite.
4. **Word-pick** — drawer: 3 word cards; others: "{Name} is choosing…" with length pills.
5. **Drawing** — canvas, toolbar, chat, players, timer, word display.
6. **Round-end** — modal with word, who guessed, points awarded, current scores.
7. **Game-end** — podium, "Play Again" (host) / "Back to Lobby."

### Mobile-first layout

- **< 768px:** top bar (code + timer + word + dot), canvas (100% width, 4:3), collapsible chat sheet, horizontal scrolling toolbar, players in drawer.
- **≥ 768px:** three-column [players | canvas+toolbar | chat]. Toolbar to the left of canvas.

### Visual identity

Lean in. Two viable directions; pick one and commit:

- **A. Paper-and-ink doodle** — cream bg, ink-black borders with hard offset shadows, handwritten display font (Caveat / Patrick Hand), clean body font (Outfit / DM Sans), accents in coral, mustard, mint, sky.
- **B. Late-90s neon arcade** — black bg, neon strokes, chunky display sans (Space Grotesk / VT323), CRT scanline overlay on canvas frame.

---

## 10. Build Phases

**Phase 1 — Setup & schema** (½ day)
Create Next.js project, Supabase project, run migrations, env vars wired.

**Phase 2 — Identity & rooms** (1 day)
Home page, Create/Join, `localStorage` identity, `/api/rooms` POST, lobby UI, Realtime subscription showing player joins/leaves.

**Phase 3 — Game state machine** (1 day)
Settings, Start button, phase transitions (`/api/rooms/[code]/tick`), word selection, turn rotation, multi-round, game-end.

**Phase 4 — Drawing** (1-2 days)
Canvas component, Pointer Events, brush + sizes + colors, Broadcast preview, `/api/rooms/[code]/strokes` commit, undo, clear, eraser, fill.

**Phase 5 — Guessing & scoring** (1 day)
Chat, exact + close matching, correct-guess hiding, points awarding, scoreboards.

**Phase 6 — Persistence (THE FEATURE)** (1 day)
PlayerId localStorage, session localStorage, rejoin path, heartbeat, Page Visibility API, `beforeunload` soft leave, Supabase Presence, run all 8 test scenarios from §1.

**Phase 7 — Polish** (1-2 days)
Avatar picker, hint reveals, hidden/combination word modes, custom words, mobile chat sheet, sound effects + mute, like/dislike, kick.

**Phase 8 — Launch** (½ day)
Vercel deploy, Vercel-Supabase Integration, custom domain, Vercel Cron for janitor, basic profanity filter, name length limits.

---

## 11. Environment Variables

```bash
# .env.local

# Public (sent to browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Server-only (API routes)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Optional - Upstash for rate limiting
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...
```

The Vercel-Supabase Integration auto-syncs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

---

## 12. NPM Packages

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@supabase/supabase-js": "^2.45.0",
    "@supabase/ssr": "^0.5.0",
    "tailwindcss": "^4.0.0",
    "zustand": "^5.0.0",
    "zod": "^3.23.0",
    "nanoid": "^5.0.0",
    "fast-levenshtein": "^3.0.0",
    "framer-motion": "^11.11.0",
    "lucide-react": "^0.450.0",
    "clsx": "^2.1.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-slider": "^1.2.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "@upstash/redis": "^1.34.0",
    "@upstash/ratelimit": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/fast-levenshtein": "^0.0.4"
  }
}
```

---

## 13. Deployment Checklist

1. **Supabase project** — created, schema run, Realtime enabled on the 5 tables, service role key copied.
2. **Vercel project** — connected to GitHub repo.
3. **Vercel Marketplace → Supabase Integration** — installed, linking the two projects. Env vars auto-sync.
4. **(Optional) Upstash Redis** — created, REST URL + token added as Vercel env vars.
5. **Vercel Cron** — `vercel.json` schedules `GET /api/cron/cleanup` every minute to call `cleanup_disconnected_players()`.
6. **Custom domain** — pointed at the Vercel project.
7. **Run all 8 mobile test scenarios** on real devices.

---

## 14. Out of Scope for v1

- Public lobbies / matchmaking
- Avatar special items beyond skin/eyes/mouth
- Multilingual word lists (English only)
- Pressure sensitivity for drawing
- Voice chat
- Persistent accounts / cross-game stats
- Mod tools / abuse dashboard

All can be added later without changing the architecture.

---

## 15. Open Decisions

- **Visual identity:** A (paper-doodle) or B (neon-arcade)?
- **Default game length:** 3 rounds × 80s (≈ 5min for 4 players) — confirm.
- **Public lobbies in v1?** Recommend: no.

---

## 16. References

- skribbl.io homepage — UI features, settings ranges
- skribbl.io Wiki (Fandom) — points, timer, hints
- skribbl.io protocol gist (MrDiamond64) — full websocket message structure, all packet IDs, color/brush enums, game state IDs
- scribble.rs (BSD-3, Go) — popular open clone using cookie-based usersession
- Supabase Realtime docs — Broadcast, Presence, Postgres Changes patterns
- Next.js 16 docs — App Router, async params, Cache Components