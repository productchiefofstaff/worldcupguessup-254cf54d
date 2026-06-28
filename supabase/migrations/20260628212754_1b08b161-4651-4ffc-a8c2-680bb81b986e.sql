
CREATE TABLE public.fixture_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
  minute integer NOT NULL,
  minute_display text NOT NULL,
  side text NOT NULL CHECK (side IN ('home','away')),
  scorer text,
  scoring_play_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, scoring_play_id)
);
CREATE INDEX fixture_goals_fixture_idx ON public.fixture_goals(fixture_id);

GRANT SELECT ON public.fixture_goals TO authenticated;
GRANT ALL ON public.fixture_goals TO service_role;

ALTER TABLE public.fixture_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixture_goals readable by authenticated"
  ON public.fixture_goals FOR SELECT
  TO authenticated USING (true);

-- Mark fixtures we've already pulled goal-timing data for (so the sync is idempotent and skips them).
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS goals_synced_at timestamptz;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS espn_event_id text;

-- Schedule the goals sync alongside the existing scoreboard sync (every 30 min).
SELECT cron.schedule(
  'sync-fixture-goals',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--1abd5d8a-28e8-4c2a-8f87-104d70a651ad.lovable.app/api/public/hooks/sync-fixture-goals',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
