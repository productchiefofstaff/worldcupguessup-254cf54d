GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.fixture_goals TO anon;
GRANT SELECT ON public.leaderboard TO anon;

CREATE POLICY "profiles readable by anon"
  ON public.profiles FOR SELECT TO anon USING (true);

CREATE POLICY "fixture_goals readable by anon"
  ON public.fixture_goals FOR SELECT TO anon USING (true);