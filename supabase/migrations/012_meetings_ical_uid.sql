-- MeetWise — add iCalUId support for cross-user canonical meetings
-- Non-destructive migration: only adds nullable column + index.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS ical_uid TEXT;

-- Lookup index used for dedupe and canonical grouping.
CREATE INDEX IF NOT EXISTS meetings_team_ical_uid_start_idx
  ON meetings (team_id, ical_uid, start_time);
