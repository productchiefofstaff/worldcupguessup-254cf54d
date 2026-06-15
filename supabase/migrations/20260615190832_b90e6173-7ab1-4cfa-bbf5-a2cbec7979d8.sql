CREATE TABLE public.prediction_edits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_id uuid,
  user_id uuid NOT NULL,
  fixture_id uuid NOT NULL,
  editor_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update')),
  old_home integer,
  old_away integer,
  new_home integer NOT NULL,
  new_away integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT ON public.prediction_edits TO authenticated;
GRANT ALL ON public.prediction_edits TO service_role;
ALTER TABLE public.prediction_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins can read prediction edits"
  ON public.prediction_edits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX prediction_edits_created_at_idx ON public.prediction_edits (created_at DESC);