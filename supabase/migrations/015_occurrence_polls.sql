-- MeetWise — poll tracking on canonical occurrences

ALTER TABLE meeting_occurrences
  ADD COLUMN IF NOT EXISTS poll_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS poll_sent_at TIMESTAMPTZ;

ALTER TABLE poll_digest_sent
  ADD COLUMN IF NOT EXISTS occurrence_id UUID REFERENCES meeting_occurrences(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_poll_digest_sent_user_occurrence
  ON poll_digest_sent (user_id, occurrence_id)
  WHERE occurrence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poll_digest_sent_occurrence
  ON poll_digest_sent (occurrence_id);
