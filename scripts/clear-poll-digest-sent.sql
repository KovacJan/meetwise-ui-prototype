-- Remove all rows from poll_digest_sent.
-- Run in Supabase SQL Editor or: psql $DATABASE_URL -f scripts/clear-poll-digest-sent.sql

TRUNCATE TABLE poll_digest_sent;
