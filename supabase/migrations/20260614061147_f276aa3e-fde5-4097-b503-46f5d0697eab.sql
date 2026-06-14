
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_on_leaderboard boolean NOT NULL DEFAULT true;

CREATE OR REPLACE VIEW public.leaderboard
WITH (security_invoker=true) AS
 SELECT p.id AS user_id,
    p.display_name AS name,
    COALESCE(sum(
        CASE
            WHEN f.home_score IS NULL OR f.away_score IS NULL THEN 0
            WHEN pr.home_score = f.home_score AND pr.away_score = f.away_score THEN 40
            WHEN sign((pr.home_score - pr.away_score)::double precision) = sign((f.home_score - f.away_score)::double precision) THEN 10
            ELSE 0
        END), 0::bigint)::integer AS points,
    count(pr.id) FILTER (WHERE f.home_score IS NOT NULL AND f.away_score IS NOT NULL AND pr.home_score = f.home_score AND pr.away_score = f.away_score) AS correct_scores,
    count(pr.id) FILTER (WHERE f.home_score IS NOT NULL AND f.away_score IS NOT NULL AND (pr.home_score <> f.home_score OR pr.away_score <> f.away_score) AND sign((pr.home_score - pr.away_score)::double precision) = sign((f.home_score - f.away_score)::double precision)) AS correct_results,
    count(pr.id) FILTER (WHERE f.home_score IS NOT NULL) AS settled_predictions,
    count(pr.id) AS total_predictions
   FROM profiles p
     LEFT JOIN predictions pr ON pr.user_id = p.id
     LEFT JOIN fixtures f ON f.id = pr.fixture_id
  WHERE p.show_on_leaderboard = true
  GROUP BY p.id, p.display_name;
