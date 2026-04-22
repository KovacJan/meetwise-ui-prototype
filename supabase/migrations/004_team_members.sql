-- MeetWise — Team members table + meeting cost breakdown columns
-- Run after 001, 002, 003 migrations.

-- ─────────────────────────────────────────────────────────────────
-- 1. team_members
--    Manager-controlled list of people who belong to a team.
--    Members may or may not have a MeetWise account (profile_id = NULL
--    until they actually join the app).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID        NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  profile_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  email         TEXT        NOT NULL,
  display_name  TEXT        NOT NULL,
  hourly_rate   NUMERIC     NOT NULL DEFAULT 0,
  -- 'pending'  = added by manager, not yet joined the app
  -- 'invited'  = invite email sent (same as pending for now)
  -- 'active'   = profile_id is linked, user has joined
  status        TEXT        NOT NULL DEFAULT 'pending',
  invited_at    TIMESTAMPTZ,
  joined_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, email)
);

-- ─────────────────────────────────────────────────────────────────
-- 2. Row-Level Security for team_members
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members: members can read"
  ON team_members FOR SELECT
  USING (
    team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "team_members: manager can insert"
  ON team_members FOR INSERT
  WITH CHECK (
    team_id IN (SELECT id FROM teams WHERE manager_id = auth.uid())
  );

CREATE POLICY "team_members: manager can update"
  ON team_members FOR UPDATE
  USING (
    team_id IN (SELECT id FROM teams WHERE manager_id = auth.uid())
  );

CREATE POLICY "team_members: manager can delete"
  ON team_members FOR DELETE
  USING (
    team_id IN (SELECT id FROM teams WHERE manager_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────
-- 3. Extend meetings with accurate team-based cost columns
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS team_cost               NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_breakdown          JSONB,
  ADD COLUMN IF NOT EXISTS matched_member_count    INT,
  ADD COLUMN IF NOT EXISTS unmatched_attendee_count INT;
