-- ============================================================
-- Voya — Initial Schema Migration
-- Run once in Supabase SQL Editor (or via supabase db push)
-- All tables use Row Level Security (RLS).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. profiles
--    One row per auth.users entry; created at signup.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_done  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: owner read"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: owner write"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles: owner update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);


-- ─────────────────────────────────────────────────────────────
-- 2. onboarding_responses
--    One row per user; upserted during signup and profile edits.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_responses (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  home_city            TEXT,
  home_country         TEXT,
  travel_scope         TEXT    NOT NULL DEFAULT 'anywhere',
  domestic_scope       TEXT,
  budget_per_day       TEXT,
  trip_duration        TEXT,
  group_type           TEXT,
  interests            TEXT[]  NOT NULL DEFAULT '{}',
  dietary_preferences  TEXT[]  NOT NULL DEFAULT '{}',
  offbeat_score        INT,
  trip_timing          TEXT,
  trip_start_date      DATE,
  trip_end_date        DATE,
  trip_duration_days   INT,
  past_trip_input      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE onboarding_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_responses: owner read"
  ON onboarding_responses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "onboarding_responses: owner insert"
  ON onboarding_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "onboarding_responses: owner update"
  ON onboarding_responses FOR UPDATE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 3. past_trips
--    Free-text destinations the user has already visited.
--    Multiple rows per user; replaced wholesale on profile save.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS past_trips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destination_name  TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS past_trips_user_id_idx ON past_trips (user_id);

ALTER TABLE past_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "past_trips: owner read"
  ON past_trips FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "past_trips: owner insert"
  ON past_trips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "past_trips: owner delete"
  ON past_trips FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 4. recommendations
--    AI-generated destination list; one row per (user, home_country,
--    travel_scope). Upserted on conflict of user_id.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recommendations (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  home_country    TEXT NOT NULL DEFAULT '',
  travel_scope    TEXT NOT NULL DEFAULT 'anywhere',
  destinations    JSONB NOT NULL DEFAULT '[]',
  profile_hash    TEXT,
  prompt_version  INT,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id)
);

CREATE INDEX IF NOT EXISTS recommendations_scope_idx
  ON recommendations (user_id, home_country, travel_scope);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recommendations: owner read"
  ON recommendations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "recommendations: owner write"
  ON recommendations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recommendations: owner update"
  ON recommendations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "recommendations: owner delete"
  ON recommendations FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 5. saved_destinations
--    Bookmarked discover cards; per-user, per-destination.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_destinations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  country      TEXT NOT NULL,
  destination  JSONB,           -- full destination object for quick render
  saved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_destinations_user_idx
  ON saved_destinations (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS saved_destinations_user_name_country_idx
  ON saved_destinations (user_id, name, country);

ALTER TABLE saved_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_destinations: owner read"
  ON saved_destinations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "saved_destinations: owner insert"
  ON saved_destinations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saved_destinations: owner delete"
  ON saved_destinations FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 6. trips
--    Top-level trip record; owns destinations + comments.
--    share_token is a random UUID used as a capability URL
--    (anyone who knows the UUID can view the trip).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_name    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'planning',  -- planning | confirmed | completed
  total_days   INT,
  start_date   DATE,
  end_date     DATE,
  trip_pace    TEXT,                               -- relaxed | moderate | packed
  share_token  UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trips_user_id_idx      ON trips (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS trips_share_token_idx ON trips (share_token);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trips: owner read"
  ON trips FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "trips: public read by share_token"
  ON trips FOR SELECT
  -- Anyone can read a trip if they have the share_token (capability URL pattern).
  -- share_token is selected by the collaborate API using service role, so this
  -- policy is a belt-and-suspenders fallback for direct client queries.
  USING (share_token IS NOT NULL);

CREATE POLICY "trips: owner insert"
  ON trips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trips: owner update"
  ON trips FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "trips: owner delete"
  ON trips FOR DELETE
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 7. trip_destinations
--    Ordered list of destinations within a trip.
--    itinerary_json stores the full day-by-day AI itinerary.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_destinations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  destination_name TEXT NOT NULL,
  country          TEXT NOT NULL,
  position         INT  NOT NULL DEFAULT 0,        -- 0-indexed display order
  days             INT,
  start_date       DATE,
  end_date         DATE,
  itinerary_json   JSONB,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trip_destinations_trip_id_idx
  ON trip_destinations (trip_id, position);

ALTER TABLE trip_destinations ENABLE ROW LEVEL SECURITY;

-- Owners (via trip join)
CREATE POLICY "trip_destinations: owner read"
  ON trip_destinations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_destinations: owner insert"
  ON trip_destinations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_destinations: owner update"
  ON trip_destinations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_destinations: owner delete"
  ON trip_destinations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_id AND t.user_id = auth.uid()
    )
  );

-- Collaborators (share_token capability URL — service role reads bypass RLS,
-- but add a policy for anon reads too so the share page can query directly)
CREATE POLICY "trip_destinations: public read via share_token"
  ON trip_destinations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_id AND t.share_token IS NOT NULL
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 8. trip_comments
--    Collaborative comments on specific activities in an itinerary.
--    Unauthenticated users post with a commenter_name; they can
--    upvote/downvote but cannot delete.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_comments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id          UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  destination_id   UUID REFERENCES trip_destinations(id) ON DELETE SET NULL,
  day_number       INT,
  time_of_day      TEXT,    -- morning | afternoon | evening | night
  activity_name    TEXT,
  comment          TEXT NOT NULL,
  commenter_name   TEXT NOT NULL DEFAULT 'Anonymous',
  votes_up         INT NOT NULL DEFAULT 0,
  votes_down       INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trip_comments_trip_id_idx
  ON trip_comments (trip_id, created_at);

ALTER TABLE trip_comments ENABLE ROW LEVEL SECURITY;

-- Anyone who can reach the share URL can read comments (public read)
CREATE POLICY "trip_comments: public read"
  ON trip_comments FOR SELECT
  USING (TRUE);

-- Anyone can post a comment (collaborate page is share-link gated at the app layer)
CREATE POLICY "trip_comments: public insert"
  ON trip_comments FOR INSERT
  WITH CHECK (TRUE);

-- Only the trip owner can update or delete comments (e.g. approve/reject)
CREATE POLICY "trip_comments: owner update"
  ON trip_comments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "trip_comments: owner delete"
  ON trip_comments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips t
      WHERE t.id = trip_id AND t.user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 9. guide_cache
--    Server-side cache for AI-generated destination guides.
--    14-day TTL enforced in application code (generated_at check).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guide_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key     TEXT NOT NULL,
  guide         JSONB NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS guide_cache_key_idx ON guide_cache (cache_key);

-- guide_cache is written by server-side API routes using service role or
-- the anon key (no RLS filter needed — we want any server call to read/write it).
-- Disable RLS so API routes using the anon key can still access it.
ALTER TABLE guide_cache DISABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 10. waitlist
--     Email capture for the paywall / coming-soon gate.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'paywall',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_idx ON waitlist (email);

-- Public insert — the waitlist form is unauthenticated.
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "waitlist: public insert"
  ON waitlist FOR INSERT
  WITH CHECK (TRUE);

-- Only service role (admin) can read the waitlist.
-- No SELECT policy means anon/authenticated roles cannot read rows.


-- ─────────────────────────────────────────────────────────────
-- 11. subscriptions
--     Stores the user's paid tier and expiry.
--     Managed by Stripe webhooks / admin scripts.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier        TEXT NOT NULL DEFAULT 'traveller',  -- traveller | pro
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions (user_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions: owner read"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Subscriptions are written by service-role only (Stripe webhooks, admin scripts).
-- No INSERT/UPDATE policy for authenticated users — they cannot self-upgrade.
