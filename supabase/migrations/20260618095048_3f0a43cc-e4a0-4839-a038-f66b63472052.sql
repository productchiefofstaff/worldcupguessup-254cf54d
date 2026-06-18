ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS highlights_url text,
  ADD COLUMN IF NOT EXISTS highlights_checked_at timestamptz;