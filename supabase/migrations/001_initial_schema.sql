-- MeetWise — Initial Schema
-- Run this entire script in the Supabase SQL Editor:
--   Dashboard → SQL Editor → New query → paste → Run

-- ─────────────────────────────────────────────
-- 1. teams (created first so profiles can FK it)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  manager_id    UUID,                     -- FK to profiles added after profiles is created
  hourly_rate   NUMERIC     NOT NULL DEFAULT 60,
  team_code     TEXT        NOT NULL UNIQUE,
  plan          TEXT        NOT NULL DEFAULT 'free',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 2. profiles  (one row per auth.users row)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT        NOT NULL,
  team_id           UUID        REFERENCES teams(id) ON DELETE SET NULL,
  is_manager        BOOLEAN     NOT NULL DEFAULT false,
  locale            TEXT        NOT NULL DEFAULT 'en',
  outlook_connected BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add the FK from teams.manager_id → profiles.id now that profiles exists
ALTER TABLE teams
  ADD CONSTRAINT teams_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- 3. meetings
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meetings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL DEFAULT 'Untitled Meeting',
  team_id           UUID        NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ,
  duration_minutes  INT         NOT NULL DEFAULT 0,
  participant_count INT         NOT NULL DEFAULT 1,
  cost              NUMERIC     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 4. Indexes for common queries
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS meetings_team_id_idx       ON meetings (team_id);
CREATE INDEX IF NOT EXISTS meetings_user_id_idx       ON meetings (user_id);
CREATE INDEX IF NOT EXISTS meetings_start_time_idx    ON meetings (start_time DESC);
CREATE INDEX IF NOT EXISTS profiles_team_id_idx       ON profiles (team_id);

-- ─────────────────────────────────────────────
-- 5. Row Level Security
-- ─────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams    ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- profiles: users can only read/write their own row
CREATE POLICY "profiles: own row"
  ON profiles FOR ALL
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- teams: members of a team can read it; managers can update/delete
CREATE POLICY "teams: members can read"
  ON teams FOR SELECT
  USING (
    id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "teams: manager can insert"
  ON teams FOR INSERT
  WITH CHECK (manager_id = auth.uid());

CREATE POLICY "teams: manager can update"
  ON teams FOR UPDATE
  USING (manager_id = auth.uid());

CREATE POLICY "teams: manager can delete"
  ON teams FOR DELETE
  USING (manager_id = auth.uid());

-- meetings: team members can read; team members can insert for themselves
CREATE POLICY "meetings: team members can read"
  ON meetings FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "meetings: team members can insert"
  ON meetings FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND team_id IN (
      SELECT team_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "meetings: manager can update"
  ON meetings FOR UPDATE
  USING (
    team_id IN (
      SELECT id FROM teams WHERE manager_id = auth.uid()
    )
  );

CREATE POLICY "meetings: manager can delete"
  ON meetings FOR DELETE
  USING (
    team_id IN (
      SELECT id FROM teams WHERE manager_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 6. Auto-create profile on sign-up (optional trigger)
--    Alternatively, the app calls ensureProfile() on first login.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
