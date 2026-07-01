
-- Correct knockout kickoff times to match BBC schedule (UK BST = UTC+1)
-- Last 16
UPDATE public.fixtures SET kickoff_at = '2026-07-04 21:00:00+00' WHERE match_number = 89; -- Paraguay v France Sat 4 Jul 22:00 UK
UPDATE public.fixtures SET kickoff_at = '2026-07-04 17:00:00+00' WHERE match_number = 90; -- Canada v Morocco Sat 4 Jul 18:00 UK
UPDATE public.fixtures SET kickoff_at = '2026-07-06 19:00:00+00' WHERE match_number = 91; -- W83 v W84 Mon 6 Jul 20:00 UK
UPDATE public.fixtures SET kickoff_at = '2026-07-07 00:00:00+00' WHERE match_number = 92; -- W81 v W82 Tue 7 Jul 01:00 UK
UPDATE public.fixtures SET kickoff_at = '2026-07-05 20:00:00+00' WHERE match_number = 93; -- Brazil v Norway Sun 5 Jul 21:00 UK
-- 94 already correct (Mon 6 Jul 01:00 UK)
-- 95, 96 already correct times (Tue 7 Jul 17:00 & 21:00 UK)

-- Quarter-finals
UPDATE public.fixtures SET kickoff_at = '2026-07-11 21:00:00+00' WHERE match_number = 99; -- Sat 11 Jul 22:00 UK
