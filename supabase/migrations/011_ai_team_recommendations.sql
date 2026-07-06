-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 011 – AI team recommendations (persisted per team + period)
-- Stores generated AI recommendations and generated_at for the AI Insights page.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_team_recommendations (
  team_id       UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  period_key    TEXT        NOT NULL,
  recommendations JSONB     NOT NULL DEFAULT '[]',
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_team_recommendations_team
  ON ai_team_recommendations (team_id);

ALTER TABLE ai_team_recommendations ENABLE ROW LEVEL SECURITY;

-- Team members can read their team's recommendations
CREATE POLICY "ai_team_recommendations: team members can read"
  ON ai_team_recommendations FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid() AND team_id IS NOT NULL
    )
  );

-- Only service role can insert/update (API uses admin client)
-- No INSERT/UPDATE policy for auth.uid() so app backend must use service role.

COMMENT ON TABLE ai_team_recommendations IS 'Stored AI recommendations per team and period (week, month, year, or custom:from:to)';
