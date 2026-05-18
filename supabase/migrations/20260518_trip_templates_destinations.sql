ALTER TABLE trip_templates ADD COLUMN IF NOT EXISTS destinations JSONB DEFAULT '[]';
