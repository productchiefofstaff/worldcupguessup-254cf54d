ALTER VIEW public.leaderboard SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP POLICY "anyone can create a player" ON public.players;
CREATE POLICY "anyone can create a player" ON public.players
  FOR INSERT WITH CHECK (char_length(trim(name)) > 0);