-- Allow managers to hide individual team members and meetings from all cost calculations.
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS is_excluded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS is_excluded BOOLEAN NOT NULL DEFAULT FALSE;
