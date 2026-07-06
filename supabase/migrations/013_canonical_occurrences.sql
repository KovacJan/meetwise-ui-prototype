-- MeetWise — canonical meeting occurrences (phase 1 scaffold)
-- Non-destructive: creates new table and adds nullable FK on meetings.

CREATE TABLE IF NOT EXISTS meeting_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  canonical_key TEXT NOT NULL,
  ical_uid TEXT,
  title TEXT NOT NULL DEFAULT 'Untitled Meeting',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INT NOT NULL DEFAULT 0,
  participant_count INT NOT NULL DEFAULT 0,
  attendees JSONB,
  event_type TEXT,
  series_master_id TEXT,
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  source_count INT NOT NULL DEFAULT 0,
  team_cost NUMERIC,
  cost_breakdown JSONB,
  matched_member_count INT NOT NULL DEFAULT 0,
  unmatched_attendee_count INT NOT NULL DEFAULT 0,
  is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
  efficiency_score INT,
  ai_insight TEXT,
  last_merged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, canonical_key)
);

CREATE INDEX IF NOT EXISTS meeting_occurrences_team_start_idx
  ON meeting_occurrences (team_id, start_time DESC);

CREATE INDEX IF NOT EXISTS meeting_occurrences_team_ical_start_idx
  ON meeting_occurrences (team_id, ical_uid, start_time);

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS occurrence_id UUID REFERENCES meeting_occurrences(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meetings_occurrence_id_idx
  ON meetings (occurrence_id);

ALTER TABLE meeting_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_occurrences: members can read"
  ON meeting_occurrences FOR SELECT
  USING (
    team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "meeting_occurrences: manager can insert"
  ON meeting_occurrences FOR INSERT
  WITH CHECK (
    team_id IN (SELECT id FROM teams WHERE manager_id = auth.uid())
  );

CREATE POLICY "meeting_occurrences: manager can update"
  ON meeting_occurrences FOR UPDATE
  USING (
    team_id IN (SELECT id FROM teams WHERE manager_id = auth.uid())
  );

CREATE POLICY "meeting_occurrences: manager can delete"
  ON meeting_occurrences FOR DELETE
  USING (
    team_id IN (SELECT id FROM teams WHERE manager_id = auth.uid())
  );
