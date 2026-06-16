CREATE TABLE public.team_form_cache (
  team_name text PRIMARY KEY,
  external_team_id integer,
  matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.team_form_cache TO authenticated;
GRANT SELECT ON public.team_form_cache TO anon;
GRANT ALL ON public.team_form_cache TO service_role;

ALTER TABLE public.team_form_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team form cache readable by everyone"
  ON public.team_form_cache FOR SELECT
  USING (true);

CREATE TRIGGER team_form_cache_touch
  BEFORE UPDATE ON public.team_form_cache
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();