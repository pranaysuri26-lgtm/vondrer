-- Add dietary_preferences column to onboarding_responses
-- Used by recommendation engine and guide food section

ALTER TABLE onboarding_responses
  ADD COLUMN IF NOT EXISTS dietary_preferences TEXT[] DEFAULT '{}';
