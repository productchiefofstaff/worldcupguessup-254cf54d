-- 1) Add winning_odds to fixtures
ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS winning_odds numeric;

-- 2) Historic odds table
CREATE TABLE IF NOT EXISTS public.historic_odds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id bigint NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  match_date timestamptz NOT NULL,
  stage text,
  final_home_score integer,
  final_away_score integer,
  vendor text NOT NULL,
  odds_type text NOT NULL CHECK (odds_type IN ('opening','closing')),
  scoreline text NOT NULL,
  american_odds integer,
  decimal_odds numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, vendor, odds_type, scoreline)
);

CREATE INDEX IF NOT EXISTS historic_odds_match_id_idx ON public.historic_odds(match_id);
CREATE INDEX IF NOT EXISTS historic_odds_teams_date_idx ON public.historic_odds(home_team, away_team, match_date);

GRANT SELECT ON public.historic_odds TO anon, authenticated;
GRANT ALL ON public.historic_odds TO service_role;

ALTER TABLE public.historic_odds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historic_odds readable by everyone"
  ON public.historic_odds FOR SELECT
  USING (true);