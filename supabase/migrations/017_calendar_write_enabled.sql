-- Track whether the user granted Calendars.ReadWrite (required for create/edit meetings).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS calendar_write_enabled BOOLEAN NOT NULL DEFAULT false;
