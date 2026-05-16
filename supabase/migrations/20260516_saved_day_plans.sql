-- saved_day_plans: stores Plan a Day results per user
CREATE TABLE IF NOT EXISTS saved_day_plans (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place            text        NOT NULL,            -- as typed by user
  date             date        NOT NULL,
  location_display text,                            -- Nominatim display_name
  plan             jsonb       NOT NULL,            -- DayPlan JSON
  weather          jsonb,                           -- DayWeather JSON
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS saved_day_plans_user_id_idx
  ON saved_day_plans (user_id, created_at DESC);

-- RLS — users can only see and manage their own plans
ALTER TABLE saved_day_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own saved_day_plans"
  ON saved_day_plans FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
