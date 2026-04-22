-- Optional focus signal for AI insights.
-- Adds a nullable focus_level column to poll_responses so we can store the
-- answer to "How focused was this meeting?" without changing existing rows.

ALTER TABLE poll_responses
  ADD COLUMN IF NOT EXISTS focus_level TEXT
  CHECK (focus_level IN ('high', 'medium', 'low'));

