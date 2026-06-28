ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS home_score_aet integer,
  ADD COLUMN IF NOT EXISTS away_score_aet integer,
  ADD COLUMN IF NOT EXISTS pens_home integer,
  ADD COLUMN IF NOT EXISTS pens_away integer,
  ADD COLUMN IF NOT EXISTS decided_by text CHECK (decided_by IN ('AET','PENS')),
  ADD COLUMN IF NOT EXISTS winner_team text;