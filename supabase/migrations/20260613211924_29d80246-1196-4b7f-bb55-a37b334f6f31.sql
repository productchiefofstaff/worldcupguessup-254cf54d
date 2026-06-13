-- Players: name-only identity, anyone can register
CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.players TO anon, authenticated;
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read players" ON public.players FOR SELECT USING (true);
CREATE POLICY "anyone can create a player" ON public.players FOR INSERT WITH CHECK (true);

CREATE TABLE public.fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_number int NOT NULL UNIQUE,
  stage text NOT NULL,
  group_name text,
  team_home text NOT NULL,
  team_away text NOT NULL,
  kickoff_at timestamptz NOT NULL,
  home_score int,
  away_score int
);
GRANT SELECT ON public.fixtures TO anon, authenticated;
GRANT ALL ON public.fixtures TO service_role;
ALTER TABLE public.fixtures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read fixtures" ON public.fixtures FOR SELECT USING (true);

CREATE TABLE public.predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  fixture_id uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE CASCADE,
  home_score int NOT NULL CHECK (home_score BETWEEN 0 AND 30),
  away_score int NOT NULL CHECK (away_score BETWEEN 0 AND 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, fixture_id)
);
GRANT SELECT, INSERT, UPDATE ON public.predictions TO anon, authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read predictions" ON public.predictions FOR SELECT USING (true);
CREATE POLICY "predictions insert before kickoff" ON public.predictions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.fixtures f WHERE f.id = fixture_id AND f.kickoff_at > now())
  );
CREATE POLICY "predictions update before kickoff" ON public.predictions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.fixtures f WHERE f.id = fixture_id AND f.kickoff_at > now())
  );

CREATE INDEX predictions_player_idx ON public.predictions(player_id);
CREATE INDEX predictions_fixture_idx ON public.predictions(fixture_id);

CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  p.id AS player_id,
  p.name,
  COALESCE(SUM(
    CASE
      WHEN f.home_score IS NULL OR f.away_score IS NULL THEN 0
      WHEN pr.home_score = f.home_score AND pr.away_score = f.away_score THEN 3
      WHEN sign(pr.home_score - pr.away_score) = sign(f.home_score - f.away_score) THEN 1
      ELSE 0
    END
  ), 0)::int AS points,
  COUNT(pr.id) FILTER (WHERE f.home_score IS NOT NULL) AS settled_predictions,
  COUNT(pr.id) AS total_predictions
FROM public.players p
LEFT JOIN public.predictions pr ON pr.player_id = p.id
LEFT JOIN public.fixtures f ON f.id = pr.fixture_id
GROUP BY p.id, p.name;

GRANT SELECT ON public.leaderboard TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE TRIGGER predictions_touch BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.fixtures (match_number, stage, group_name, team_home, team_away, kickoff_at) VALUES
(1,'Group Stage','A','Mexico','Poland','2026-06-11T20:00:00+00'),
(2,'Group Stage','A','Saudi Arabia','South Africa','2026-06-11T23:00:00+00'),
(3,'Group Stage','A','Mexico','Saudi Arabia','2026-06-12T02:00:00+00'),
(4,'Group Stage','A','Poland','South Africa','2026-06-12T05:00:00+00'),
(5,'Group Stage','A','Mexico','South Africa','2026-06-12T08:00:00+00'),
(6,'Group Stage','A','Poland','Saudi Arabia','2026-06-12T11:00:00+00'),
(7,'Group Stage','B','Canada','Belgium','2026-06-12T14:00:00+00'),
(8,'Group Stage','B','Egypt','Uzbekistan','2026-06-12T17:00:00+00'),
(9,'Group Stage','B','Canada','Egypt','2026-06-12T20:00:00+00'),
(10,'Group Stage','B','Belgium','Uzbekistan','2026-06-12T23:00:00+00'),
(11,'Group Stage','B','Canada','Uzbekistan','2026-06-13T02:00:00+00'),
(12,'Group Stage','B','Belgium','Egypt','2026-06-13T05:00:00+00'),
(13,'Group Stage','C','USA','Croatia','2026-06-13T08:00:00+00'),
(14,'Group Stage','C','Iran','Tunisia','2026-06-13T11:00:00+00'),
(15,'Group Stage','C','USA','Iran','2026-06-13T14:00:00+00'),
(16,'Group Stage','C','Croatia','Tunisia','2026-06-13T17:00:00+00'),
(17,'Group Stage','C','USA','Tunisia','2026-06-13T20:00:00+00'),
(18,'Group Stage','C','Croatia','Iran','2026-06-13T23:00:00+00'),
(19,'Group Stage','D','Argentina','Australia','2026-06-14T02:00:00+00'),
(20,'Group Stage','D','Morocco','New Zealand','2026-06-14T05:00:00+00'),
(21,'Group Stage','D','Argentina','Morocco','2026-06-14T08:00:00+00'),
(22,'Group Stage','D','Australia','New Zealand','2026-06-14T11:00:00+00'),
(23,'Group Stage','D','Argentina','New Zealand','2026-06-14T14:00:00+00'),
(24,'Group Stage','D','Australia','Morocco','2026-06-14T17:00:00+00'),
(25,'Group Stage','E','Brazil','Switzerland','2026-06-14T20:00:00+00'),
(26,'Group Stage','E','Ghana','Jordan','2026-06-14T23:00:00+00'),
(27,'Group Stage','E','Brazil','Ghana','2026-06-15T02:00:00+00'),
(28,'Group Stage','E','Switzerland','Jordan','2026-06-15T05:00:00+00'),
(29,'Group Stage','E','Brazil','Jordan','2026-06-15T08:00:00+00'),
(30,'Group Stage','E','Switzerland','Ghana','2026-06-15T11:00:00+00'),
(31,'Group Stage','F','France','Senegal','2026-06-15T14:00:00+00'),
(32,'Group Stage','F','Ecuador','Qatar','2026-06-15T17:00:00+00'),
(33,'Group Stage','F','France','Ecuador','2026-06-15T20:00:00+00'),
(34,'Group Stage','F','Senegal','Qatar','2026-06-15T23:00:00+00'),
(35,'Group Stage','F','France','Qatar','2026-06-16T02:00:00+00'),
(36,'Group Stage','F','Senegal','Ecuador','2026-06-16T05:00:00+00'),
(37,'Group Stage','G','England','Netherlands','2026-06-16T08:00:00+00'),
(38,'Group Stage','G','Japan','Cape Verde','2026-06-16T11:00:00+00'),
(39,'Group Stage','G','England','Japan','2026-06-16T14:00:00+00'),
(40,'Group Stage','G','Netherlands','Cape Verde','2026-06-16T17:00:00+00'),
(41,'Group Stage','G','England','Cape Verde','2026-06-16T20:00:00+00'),
(42,'Group Stage','G','Netherlands','Japan','2026-06-16T23:00:00+00'),
(43,'Group Stage','H','Spain','Denmark','2026-06-17T02:00:00+00'),
(44,'Group Stage','H','Ivory Coast','Curacao','2026-06-17T05:00:00+00'),
(45,'Group Stage','H','Spain','Ivory Coast','2026-06-17T08:00:00+00'),
(46,'Group Stage','H','Denmark','Curacao','2026-06-17T11:00:00+00'),
(47,'Group Stage','H','Spain','Curacao','2026-06-17T14:00:00+00'),
(48,'Group Stage','H','Denmark','Ivory Coast','2026-06-17T17:00:00+00'),
(49,'Group Stage','I','Germany','Uruguay','2026-06-17T20:00:00+00'),
(50,'Group Stage','I','South Korea','Panama','2026-06-17T23:00:00+00'),
(51,'Group Stage','I','Germany','South Korea','2026-06-18T02:00:00+00'),
(52,'Group Stage','I','Uruguay','Panama','2026-06-18T05:00:00+00'),
(53,'Group Stage','I','Germany','Panama','2026-06-18T08:00:00+00'),
(54,'Group Stage','I','Uruguay','South Korea','2026-06-18T11:00:00+00'),
(55,'Group Stage','J','Portugal','Colombia','2026-06-18T14:00:00+00'),
(56,'Group Stage','J','Norway','Jamaica','2026-06-18T17:00:00+00'),
(57,'Group Stage','J','Portugal','Norway','2026-06-18T20:00:00+00'),
(58,'Group Stage','J','Colombia','Jamaica','2026-06-18T23:00:00+00'),
(59,'Group Stage','J','Portugal','Jamaica','2026-06-19T02:00:00+00'),
(60,'Group Stage','J','Colombia','Norway','2026-06-19T05:00:00+00'),
(61,'Group Stage','K','Italy','Serbia','2026-06-19T08:00:00+00'),
(62,'Group Stage','K','Algeria','Haiti','2026-06-19T11:00:00+00'),
(63,'Group Stage','K','Italy','Algeria','2026-06-19T14:00:00+00'),
(64,'Group Stage','K','Serbia','Haiti','2026-06-19T17:00:00+00'),
(65,'Group Stage','K','Italy','Haiti','2026-06-19T20:00:00+00'),
(66,'Group Stage','K','Serbia','Algeria','2026-06-19T23:00:00+00'),
(67,'Group Stage','L','Austria','Wales','2026-06-20T02:00:00+00'),
(68,'Group Stage','L','Nigeria','Honduras','2026-06-20T05:00:00+00'),
(69,'Group Stage','L','Austria','Nigeria','2026-06-20T08:00:00+00'),
(70,'Group Stage','L','Wales','Honduras','2026-06-20T11:00:00+00'),
(71,'Group Stage','L','Austria','Honduras','2026-06-20T14:00:00+00'),
(72,'Group Stage','L','Wales','Nigeria','2026-06-20T17:00:00+00'),
(73,'Round of 32',NULL,'R32 Team 1','R32 Team 2','2026-07-10T20:00:00+00'),
(74,'Round of 32',NULL,'R32 Team 3','R32 Team 4','2026-07-10T23:00:00+00'),
(75,'Round of 32',NULL,'R32 Team 5','R32 Team 6','2026-07-11T02:00:00+00'),
(76,'Round of 32',NULL,'R32 Team 7','R32 Team 8','2026-07-11T05:00:00+00'),
(77,'Round of 32',NULL,'R32 Team 9','R32 Team 10','2026-07-11T08:00:00+00'),
(78,'Round of 32',NULL,'R32 Team 11','R32 Team 12','2026-07-11T11:00:00+00'),
(79,'Round of 32',NULL,'R32 Team 13','R32 Team 14','2026-07-11T14:00:00+00'),
(80,'Round of 32',NULL,'R32 Team 15','R32 Team 16','2026-07-11T17:00:00+00'),
(81,'Round of 32',NULL,'R32 Team 17','R32 Team 18','2026-07-11T20:00:00+00'),
(82,'Round of 32',NULL,'R32 Team 19','R32 Team 20','2026-07-11T23:00:00+00'),
(83,'Round of 32',NULL,'R32 Team 21','R32 Team 22','2026-07-12T02:00:00+00'),
(84,'Round of 32',NULL,'R32 Team 23','R32 Team 24','2026-07-12T05:00:00+00'),
(85,'Round of 32',NULL,'R32 Team 25','R32 Team 26','2026-07-12T08:00:00+00'),
(86,'Round of 32',NULL,'R32 Team 27','R32 Team 28','2026-07-12T11:00:00+00'),
(87,'Round of 32',NULL,'R32 Team 29','R32 Team 30','2026-07-12T14:00:00+00'),
(88,'Round of 32',NULL,'R32 Team 31','R32 Team 32','2026-07-12T17:00:00+00'),
(89,'Round of 16',NULL,'R16 Winner 1','R16 Winner 2','2026-07-12T20:00:00+00'),
(90,'Round of 16',NULL,'R16 Winner 3','R16 Winner 4','2026-07-12T23:00:00+00'),
(91,'Round of 16',NULL,'R16 Winner 5','R16 Winner 6','2026-07-13T02:00:00+00'),
(92,'Round of 16',NULL,'R16 Winner 7','R16 Winner 8','2026-07-13T05:00:00+00'),
(93,'Round of 16',NULL,'R16 Winner 9','R16 Winner 10','2026-07-13T08:00:00+00'),
(94,'Round of 16',NULL,'R16 Winner 11','R16 Winner 12','2026-07-13T11:00:00+00'),
(95,'Round of 16',NULL,'R16 Winner 13','R16 Winner 14','2026-07-13T14:00:00+00'),
(96,'Round of 16',NULL,'R16 Winner 15','R16 Winner 16','2026-07-13T17:00:00+00'),
(97,'Quarter-final',NULL,'QF Winner 1','QF Winner 2','2026-07-13T20:00:00+00'),
(98,'Quarter-final',NULL,'QF Winner 3','QF Winner 4','2026-07-13T23:00:00+00'),
(99,'Quarter-final',NULL,'QF Winner 5','QF Winner 6','2026-07-14T02:00:00+00'),
(100,'Quarter-final',NULL,'QF Winner 7','QF Winner 8','2026-07-14T05:00:00+00'),
(101,'Semi-final',NULL,'SF Winner 1','SF Winner 2','2026-07-14T08:00:00+00'),
(102,'Semi-final',NULL,'SF Winner 3','SF Winner 4','2026-07-14T11:00:00+00'),
(103,'Third-place Play-off',NULL,'SF Loser 1','SF Loser 2','2026-07-14T14:00:00+00'),
(104,'Final',NULL,'Final Team 1','Final Team 2','2026-07-14T17:00:00+00');