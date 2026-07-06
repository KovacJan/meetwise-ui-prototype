-- Phase 7: team scheduling preferences + audit trail for leader actions

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS scheduling_timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS scheduling_work_start TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS scheduling_work_end TEXT NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS scheduling_work_days INT[] NOT NULL DEFAULT '{1,2,3,4,5}';

CREATE TABLE IF NOT EXISTS meeting_scheduling_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  occurrence_id UUID REFERENCES meeting_occurrences(id) ON DELETE SET NULL,
  outlook_event_id TEXT,
  scope TEXT,
  payload JSONB,
  result TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_scheduling_audit_team_created_idx
  ON meeting_scheduling_audit (team_id, created_at DESC);

ALTER TABLE meeting_scheduling_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheduling_audit: team managers read"
  ON meeting_scheduling_audit FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid() AND is_manager = true
    )
  );
