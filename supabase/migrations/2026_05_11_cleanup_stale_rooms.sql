-- Run this in Supabase SQL editor.
-- Adds a 3-hour hard-delete sweep to the janitor so abandoned rooms
-- (with or without lingering players) are removed instead of piling up.
CREATE OR REPLACE FUNCTION cleanup_disconnected_players() RETURNS void AS $$
BEGIN
  DELETE FROM players
  WHERE connected = false
    AND last_seen_at < NOW() - INTERVAL '60 seconds';

  DELETE FROM rooms
  WHERE NOT EXISTS (SELECT 1 FROM players WHERE players.room_code = rooms.code)
    AND last_activity_at < NOW() - INTERVAL '30 minutes';

  DELETE FROM rooms
  WHERE last_activity_at < NOW() - INTERVAL '3 hours';
END;
$$ LANGUAGE plpgsql;

-- One-off backfill: wipe anything already older than 3 hours.
DELETE FROM rooms WHERE last_activity_at < NOW() - INTERVAL '3 hours';
