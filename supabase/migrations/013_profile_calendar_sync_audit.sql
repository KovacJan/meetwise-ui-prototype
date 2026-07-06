-- MeetWise — Per-profile calendar sync audit columns
-- Run after previous migrations.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_calendar_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_calendar_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS last_calendar_sync_error TEXT;

CREATE INDEX IF NOT EXISTS profiles_last_calendar_sync_at_idx
  ON profiles (last_calendar_sync_at DESC);
