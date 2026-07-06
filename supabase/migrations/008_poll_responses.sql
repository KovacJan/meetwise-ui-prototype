-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008 – Poll / Survey infrastructure
--
-- Adds the poll_responses table that records each team member's answer to the
-- post-meeting survey, and the four columns on meetings that the survey system
-- reads / writes:
--   poll_sent          – whether the email poll has been dispatched
--   poll_sent_at       – when the email poll was dispatched (for the 48h fallback)
--   ai_insight         – the GPT-generated one-sentence insight
--   efficiency_score   – 0–100 score produced by GPT alongside the insight
-- ─────────────────────────────────────────────────────────────────────────────

-- Survey responses (one row per user per meeting)
CREATE TABLE IF NOT EXISTS poll_responses (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id              UUID        NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  -- NULL when submitted anonymously via email link (no active session)
  user_id                 UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  was_useful              TEXT        NOT NULL CHECK (was_useful IN ('yes', 'partially', 'no')),
  actual_duration_minutes INT         NOT NULL CHECK (actual_duration_minutes > 0),
  submitted_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poll_responses_meeting ON poll_responses (meeting_id);
CREATE INDEX IF NOT EXISTS idx_poll_responses_user    ON poll_responses (user_id);

-- One authenticated response per meeting per user (email/anonymous rows are excluded)
CREATE UNIQUE INDEX IF NOT EXISTS uq_poll_responses_user_meeting
  ON poll_responses (meeting_id, user_id)
  WHERE user_id IS NOT NULL;

-- Missing columns on meetings (added here so they exist before the app code runs)
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS poll_sent       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS poll_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_insight      TEXT,
  ADD COLUMN IF NOT EXISTS efficiency_score NUMERIC;
