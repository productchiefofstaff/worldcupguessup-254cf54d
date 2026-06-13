DROP VIEW IF EXISTS public.leaderboard;

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
  COUNT(pr.id) FILTER (WHERE f.home_score IS NOT NULL AND f.away_score IS NOT NULL AND (pr.home_score = f.home_score AND pr.away_score = f.away_score)) AS correct_scores,
  COUNT(pr.id) FILTER (WHERE f.home_score IS NOT NULL AND f.away_score IS NOT NULL AND (pr.home_score <> f.home_score OR pr.away_score <> f.away_score) AND sign(pr.home_score - pr.away_score) = sign(f.home_score - f.away_score)) AS correct_results,
  COUNT(pr.id) FILTER (WHERE f.home_score IS NOT NULL) AS settled_predictions,
  COUNT(pr.id) AS total_predictions
FROM public.profiles p
LEFT JOIN public.predictions pr ON pr.user_id = p.id
LEFT JOIN public.fixtures f ON f.id = pr.fixture_id
GROUP BY p.id, p.display_name;

GRANT SELECT ON public.leaderboard TO authenticated;