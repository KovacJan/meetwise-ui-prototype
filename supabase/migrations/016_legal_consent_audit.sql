-- MeetWise — Legal consent audit
-- Stores immutable acceptance events for Terms of Use and Privacy Policy.

CREATE TABLE IF NOT EXISTS legal_consent_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('terms_of_use', 'privacy_policy')),
  policy_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acceptance_source TEXT NOT NULL DEFAULT 'register_form',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_consent_audit_user_id_idx
  ON legal_consent_audit (user_id, accepted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS legal_consent_audit_unique_version_idx
  ON legal_consent_audit (user_id, policy_type, policy_version, acceptance_source);

ALTER TABLE legal_consent_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_consent_audit: own read"
  ON legal_consent_audit FOR SELECT
  USING (auth.uid() = user_id);
