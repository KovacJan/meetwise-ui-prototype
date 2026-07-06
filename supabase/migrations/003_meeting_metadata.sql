-- MeetWise — Additional meeting metadata for Outlook sync
-- Run this after 001_initial_schema.sql and 002_outlook_support.sql.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN,
  ADD COLUMN IF NOT EXISTS original_start_timezone TEXT,
  ADD COLUMN IF NOT EXISTS original_end_timezone TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS series_master_id TEXT,
  ADD COLUMN IF NOT EXISTS recurrence JSONB,
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN,
  ADD COLUMN IF NOT EXISTS attendees JSONB;

