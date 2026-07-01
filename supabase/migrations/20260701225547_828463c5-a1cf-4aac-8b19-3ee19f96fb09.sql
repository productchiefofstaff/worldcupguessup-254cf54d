
ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS home_1x2 numeric,
  ADD COLUMN IF NOT EXISTS draw_1x2 numeric,
  ADD COLUMN IF NOT EXISTS away_1x2 numeric,
  ADD COLUMN IF NOT EXISTS cs_odds numeric,
  ADD COLUMN IF NOT EXISTS cs_odds_computed_at timestamptz;
