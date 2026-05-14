-- Add Stripe billing columns to teams table
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT,
  ADD COLUMN IF NOT EXISTS plan_expires_at          TIMESTAMPTZ;

-- Index for fast webhook lookups by subscription id
CREATE INDEX IF NOT EXISTS idx_teams_stripe_subscription
  ON teams (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
