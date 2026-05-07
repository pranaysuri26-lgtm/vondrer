-- Add home_city and travel_scope to onboarding_responses
-- Run this in Supabase SQL Editor before deploying the new build

ALTER TABLE onboarding_responses
  ADD COLUMN IF NOT EXISTS home_city    TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS travel_scope TEXT    NOT NULL DEFAULT 'anywhere';
