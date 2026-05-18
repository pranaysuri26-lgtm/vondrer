CREATE TABLE IF NOT EXISTS trip_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  destination_name TEXT NOT NULL,
  country          TEXT NOT NULL,
  days             INT  NOT NULL,
  category         TEXT[] DEFAULT '{}',
  itinerary_json   JSONB,
  views            INT  DEFAULT 0,
  copies           INT  DEFAULT 0,
  is_public        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trip_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public templates are readable by all"
  ON trip_templates FOR SELECT USING (is_public = true);

CREATE POLICY "Users manage their own templates"
  ON trip_templates FOR ALL USING (auth.uid() = user_id);
