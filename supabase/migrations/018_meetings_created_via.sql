-- Track meetings created from MeetWise vs imported via calendar sync.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS created_via TEXT NOT NULL DEFAULT 'outlook_sync',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
