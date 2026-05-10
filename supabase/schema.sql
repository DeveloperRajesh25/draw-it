-- =====================================================================
-- Draw It — full Postgres schema
-- Run this in the Supabase SQL editor on a fresh project.
-- After running, in Database → Replication, confirm `supabase_realtime`
-- includes: rooms, players, strokes, chat_messages, hint_reveals.
-- =====================================================================

-- =====================================================================
-- ROOMS
-- =====================================================================
CREATE TABLE IF NOT EXISTS rooms (
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
  hint_schedule     JSONB NOT NULL DEFAULT '[]',
  hint_letters_pending JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS rooms_last_activity_idx ON rooms (last_activity_at);

-- =====================================================================
-- PLAYERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS players (
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

CREATE INDEX IF NOT EXISTS players_room_idx ON players (room_code);
CREATE INDEX IF NOT EXISTS players_last_seen_idx ON players (last_seen_at) WHERE connected = false;

-- =====================================================================
-- STROKES (current turn's drawing)
-- =====================================================================
CREATE TABLE IF NOT EXISTS strokes (
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

CREATE INDEX IF NOT EXISTS strokes_room_turn_idx ON strokes (room_code, turn_key, seq);

-- =====================================================================
-- CHAT
-- =====================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id           TEXT PRIMARY KEY,
  room_code    TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  player_id    TEXT,
  player_name  TEXT,
  text         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'normal',  -- normal | system | correct-guess | close-guess | join | leave
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_room_created_idx ON chat_messages (room_code, created_at DESC);

-- =====================================================================
-- HINT REVEALS
-- =====================================================================
CREATE TABLE IF NOT EXISTS hint_reveals (
  room_code     TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  round         INT NOT NULL,
  turn          INT NOT NULL,
  letter_index  INT NOT NULL,
  letter        TEXT NOT NULL,
  revealed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_code, round, turn, letter_index)
);

-- =====================================================================
-- ENABLE REALTIME
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='rooms') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='players') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE players;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='strokes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE strokes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='hint_reveals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE hint_reveals;
  END IF;
END $$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
-- Disabled for v1: API routes use the service role and validate every write.
-- Clients only READ via Realtime, scoped to a room code which is the security boundary.
ALTER TABLE rooms          DISABLE ROW LEVEL SECURITY;
ALTER TABLE players        DISABLE ROW LEVEL SECURITY;
ALTER TABLE strokes        DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages  DISABLE ROW LEVEL SECURITY;
ALTER TABLE hint_reveals   DISABLE ROW LEVEL SECURITY;

-- =====================================================================
-- JANITOR
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
