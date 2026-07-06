-- MeetWise — link poll responses to canonical meeting occurrences.
-- Non-destructive: keeps legacy meeting_id path intact.

ALTER TABLE poll_responses
  ADD COLUMN IF NOT EXISTS occurrence_id UUID REFERENCES meeting_occurrences(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_poll_responses_occurrence
  ON poll_responses (occurrence_id);

-- Prevent duplicate authenticated submissions per canonical occurrence.
CREATE UNIQUE INDEX IF NOT EXISTS uq_poll_responses_user_occurrence
  ON poll_responses (occurrence_id, user_id)
  WHERE user_id IS NOT NULL AND occurrence_id IS NOT NULL;
