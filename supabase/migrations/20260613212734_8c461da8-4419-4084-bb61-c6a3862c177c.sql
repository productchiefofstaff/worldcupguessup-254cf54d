CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  p.id AS player_id,
  p.name,
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
FROM public.players p
LEFT JOIN public.predictions pr ON pr.player_id = p.id
LEFT JOIN public.fixtures f ON f.id = pr.fixture_id
GROUP BY p.id, p.name;