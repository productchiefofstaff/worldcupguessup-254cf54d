
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS locked_at timestamptz;

DROP POLICY IF EXISTS "users update own predictions before kickoff" ON public.predictions;
CREATE POLICY "users update own predictions before kickoff"
ON public.predictions
FOR UPDATE
USING (
  auth.uid() = user_id
  AND locked_at IS NULL
  AND EXISTS (SELECT 1 FROM fixtures f WHERE f.id = predictions.fixture_id AND f.kickoff_at > now())
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM fixtures f WHERE f.id = predictions.fixture_id AND f.kickoff_at > now())
);
