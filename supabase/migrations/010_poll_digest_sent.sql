-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010 – Poll digest sent tracking
--
-- Ensures the same meeting is never sent to the same user more than once
-- (whether via cron or "Send email now"). Already-answered meetings are still
-- excluded via poll_responses; this table tracks "we already emailed this
-- meeting to this user" so duplicate digests are never sent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS poll_digest_sent (
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  meeting_id UUID        NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, meeting_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_digest_sent_meeting ON poll_digest_sent (meeting_id);
CREATE INDEX IF NOT EXISTS idx_poll_digest_sent_user ON poll_digest_sent (user_id);
