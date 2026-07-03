GRANT SELECT ON public.predictions TO anon;

CREATE POLICY "public can read predictions after kickoff or when locked"
ON public.predictions
FOR SELECT
TO anon
USING (
  locked_at IS NOT NULL
  OR EXISTS (
    SELECT 1 FROM public.fixtures f
    WHERE f.id = predictions.fixture_id
      AND f.kickoff_at <= now()
  )
);