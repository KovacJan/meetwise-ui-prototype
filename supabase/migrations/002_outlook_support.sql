-- MeetWise — Outlook support extension
-- Run this script in Supabase SQL Editor after 001_initial_schema.sql.
-- It adds columns needed for Microsoft Outlook integration.

-- 1) Store encrypted Microsoft refresh token on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS microsoft_refresh_token TEXT;

-- 2) Track Outlook event ID on meetings so we can upsert without duplicates
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS outlook_event_id TEXT;

-- Ensure Outlook event IDs are unique so ON CONFLICT (outlook_event_id) works
CREATE UNIQUE INDEX IF NOT EXISTS meetings_outlook_event_id_key
  ON meetings (outlook_event_id);

