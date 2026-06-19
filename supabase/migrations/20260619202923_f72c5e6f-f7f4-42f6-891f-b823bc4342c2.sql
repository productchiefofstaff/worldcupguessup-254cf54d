ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS live_home_score integer,
  ADD COLUMN IF NOT EXISTS live_away_score integer,
  ADD COLUMN IF NOT EXISTS live_status_label text,
  ADD COLUMN IF NOT EXISTS live_updated_at timestamptz;