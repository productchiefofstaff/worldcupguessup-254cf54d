
-- Tear down old name-based system
DROP VIEW IF EXISTS public.leaderboard;
DROP TABLE IF EXISTS public.predictions;
DROP TABLE IF EXISTS public.players;

-- Profiles tied to auth.users
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles readable by authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile on signup, pulling display_name from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dn text;
BEGIN
  dn := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );
  dn := left(dn, 40);
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, dn)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Predictions keyed on auth user
CREATE TABLE public.predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fixture_id uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
  home_score int NOT NULL CHECK (home_score BETWEEN 0 AND 30),
  away_score int NOT NULL CHECK (away_score BETWEEN 0 AND 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fixture_id)
);
GRANT SELECT, INSERT, UPDATE ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "predictions readable by authenticated"
  ON public.predictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own predictions before kickoff"
  ON public.predictions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.fixtures f WHERE f.id = fixture_id AND f.kickoff_at > now())
  );
CREATE POLICY "users update own predictions before kickoff"
  ON public.predictions FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.fixtures f WHERE f.id = fixture_id AND f.kickoff_at > now())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.fixtures f WHERE f.id = fixture_id AND f.kickoff_at > now())
  );

CREATE INDEX predictions_user_idx ON public.predictions(user_id);
CREATE INDEX predictions_fixture_idx ON public.predictions(fixture_id);

CREATE TRIGGER predictions_touch BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Leaderboard view (40 exact / 10 result)
CREATE VIEW public.leaderboard
WITH (security_invoker = true)
AS
SELECT
  p.id AS user_id,
  p.display_name AS name,
  COALESCE(SUM(
    CASE
      WHEN f.home_score IS NULL OR f.away_score IS NULL THEN 0
      WHEN pr.home_score = f.home_score AND pr.away_score = f.away_score THEN 40
      WHEN sign(pr.home_score - pr.away_score) = sign(f.home_score - f.away_score) THEN 10
      ELSE 0
    END
  ), 0)::int AS points,
  COUNT(pr.id) FILTER (WHERE f.home_score IS NOT NULL) AS settled_predictions,
  COUNT(pr.id) AS total_predictions
FROM public.profiles p
LEFT JOIN public.predictions pr ON pr.user_id = p.id
LEFT JOIN public.fixtures f ON f.id = pr.fixture_id
GROUP BY p.id, p.display_name;

GRANT SELECT ON public.leaderboard TO authenticated;
