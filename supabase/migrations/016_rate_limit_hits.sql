-- Sliding-window rate limit hits (service-role only via RPC).

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_id text NOT NULL,
  identifier text NOT NULL,
  cost integer NOT NULL DEFAULT 1 CHECK (cost > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_hits_lookup_idx
  ON rate_limit_hits (policy_id, identifier, created_at DESC);

ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_policy_id text,
  p_identifier text,
  p_limit integer,
  p_window_seconds integer,
  p_cost integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_used integer;
  v_oldest timestamptz;
  v_remaining integer;
  v_cost integer;
BEGIN
  v_cost := GREATEST(1, COALESCE(p_cost, 1));

  PERFORM pg_advisory_xact_lock(
    hashtext(p_policy_id || ':' || p_identifier)
  );

  v_window_start := now() - make_interval(secs => p_window_seconds);

  DELETE FROM rate_limit_hits
  WHERE policy_id = p_policy_id
    AND identifier = p_identifier
    AND created_at < v_window_start;

  SELECT COALESCE(SUM(cost), 0), MIN(created_at)
  INTO v_used, v_oldest
  FROM rate_limit_hits
  WHERE policy_id = p_policy_id
    AND identifier = p_identifier
    AND created_at >= v_window_start;

  IF v_used + v_cost > p_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'retry_after_seconds', GREATEST(
        1,
        CEIL(
          EXTRACT(
            EPOCH FROM (
              v_oldest
              + make_interval(secs => p_window_seconds)
              - now()
            )
          )
        )
      ),
      'remaining', 0
    );
  END IF;

  INSERT INTO rate_limit_hits (policy_id, identifier, cost)
  VALUES (p_policy_id, p_identifier, v_cost);

  v_remaining := p_limit - v_used - v_cost;

  RETURN jsonb_build_object(
    'success', true,
    'remaining', GREATEST(0, v_remaining)
  );
END;
$$;

REVOKE ALL ON FUNCTION check_rate_limit(text, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, text, integer, integer, integer) TO service_role;
