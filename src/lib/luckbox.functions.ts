import { createServerFn } from "@tanstack/react-start";
import { db as supabase } from "@/lib/db";

export type LuckGameDetail = {
  fixture_id: string;
  match_number: number;
  team_home: string;
  team_away: string;
  kickoff_at: string;
  ft_home: number;
  ft_away: number;
  ninety_home: number;
  ninety_away: number;
  prediction_home: number;
  prediction_away: number;
  actual_points: number;
  pre_stoppage_points: number;
  delta: number;
  stoppage_goals: Array<{ minute: number; minute_display: string; side: "home" | "away"; scorer: string | null }>;
};

export type LuckPlayer = {
  user_id: string;
  name: string;
  points_won: number;
  points_lost: number;
  net: number;
  affected_games: number;
  actual_points?: number;
  games: LuckGameDetail[];
};

function pointsFor(ph: number, pa: number, fh: number, fa: number): number {
  if (ph === fh && pa === fa) return 40;
  const ps = Math.sign(ph - pa);
  const fs = Math.sign(fh - fa);
  return ps === fs ? 10 : 0;
}

export const getLuckBox = createServerFn({ method: "GET" })
  .handler(async () => {
    // Pull settled fixtures (90-min score locked).
    const { data: fixtures, error: fxErr } = await supabase
      .from("fixtures")
      .select("id, match_number, team_home, team_away, kickoff_at, home_score, away_score")
      .not("home_score", "is", null)
      .not("away_score", "is", null);
    if (fxErr) throw fxErr;

    const fxRows = (fixtures ?? []) as Array<{
      id: string;
      match_number: number;
      team_home: string;
      team_away: string;
      kickoff_at: string;
      home_score: number;
      away_score: number;
    }>;
    const fxIds = fxRows.map((f) => f.id);
    if (!fxIds.length) return { players: [] as LuckPlayer[] };

    const [{ data: goals }, { data: preds }, { data: profiles }] = await Promise.all([
      supabase
        .from("fixture_goals")
        .select("fixture_id, minute, minute_display, side, scorer")
        .in("fixture_id", fxIds),
      supabase
        .from("predictions")
        .select("user_id, fixture_id, home_score, away_score")
        .in("fixture_id", fxIds),
      supabase.from("profiles").select("id, display_name, show_on_leaderboard"),
    ]);

    // Group goals by fixture.
    const goalsByFx = new Map<string, Array<{ minute: number; minute_display: string; side: "home" | "away"; scorer: string | null }>>();
    (goals ?? []).forEach((g: any) => {
      const arr = goalsByFx.get(g.fixture_id) ?? [];
      arr.push({
        minute: g.minute,
        minute_display: g.minute_display,
        side: g.side as "home" | "away",
        scorer: g.scorer,
      });
      goalsByFx.set(g.fixture_id, arr);
    });

    // Compute pre-stoppage score per fixture (subtract goals with minute > 90,
    // capped at 105 to ignore extra time goals, though our score columns
    // already exclude ET).
    const ninetyByFx = new Map<string, { home: number; away: number; stoppage: typeof goalsByFx extends Map<string, infer V> ? V : never }>();
    fxRows.forEach((f) => {
      const fxGoals = goalsByFx.get(f.id) ?? [];
      // Only consider regulation goals (≤ 105' covers 2nd-half stoppage).
      // Anything > 105 is extra-time and already excluded from f.home_score.
      const stoppage = fxGoals.filter((g) => g.minute > 90 && g.minute <= 105);
      let nineHome = f.home_score;
      let nineAway = f.away_score;
      stoppage.forEach((g) => {
        if (g.side === "home") nineHome -= 1;
        else nineAway -= 1;
      });
      if (nineHome < 0) nineHome = 0;
      if (nineAway < 0) nineAway = 0;
      ninetyByFx.set(f.id, { home: nineHome, away: nineAway, stoppage });
    });

    const fxById = new Map(fxRows.map((f) => [f.id, f]));
    const nameById = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => {
      const row = p as { id: string; display_name: string | null; show_on_leaderboard: boolean | null };
      if (row.show_on_leaderboard === false) return;
      nameById.set(row.id, row.display_name ?? "Player");
    });

    const byUser = new Map<string, LuckPlayer>();

    (preds ?? []).forEach((p: any) => {
      const f = fxById.get(p.fixture_id);
      if (!f) return;
      const name = nameById.get(p.user_id);
      if (!name) return; // hidden from leaderboard
      const ninety = ninetyByFx.get(f.id)!;
      if (!ninety.stoppage.length) return; // no stoppage goals → no luck swing possible
      const actual = pointsFor(p.home_score, p.away_score, f.home_score, f.away_score);
      const preStop = pointsFor(p.home_score, p.away_score, ninety.home, ninety.away);
      const delta = actual - preStop;
      if (delta === 0) return;

      const detail: LuckGameDetail = {
        fixture_id: f.id,
        match_number: f.match_number,
        team_home: f.team_home,
        team_away: f.team_away,
        kickoff_at: f.kickoff_at,
        ft_home: f.home_score,
        ft_away: f.away_score,
        ninety_home: ninety.home,
        ninety_away: ninety.away,
        prediction_home: p.home_score,
        prediction_away: p.away_score,
        actual_points: actual,
        pre_stoppage_points: preStop,
        delta,
        stoppage_goals: ninety.stoppage,
      };

      const existing = byUser.get(p.user_id) ?? {
        user_id: p.user_id,
        name,
        points_won: 0,
        points_lost: 0,
        net: 0,
        affected_games: 0,
        games: [] as LuckGameDetail[],
      };
      if (delta > 0) existing.points_won += delta;
      else existing.points_lost += -delta;
      existing.net += delta;
      existing.affected_games += 1;
      existing.games.push(detail);
      byUser.set(p.user_id, existing);
    });

    // Include every visible player even if they had no swings, so the
    // leaderboard-style list isn't empty for fortunate predictors.
    nameById.forEach((name, user_id) => {
      if (!byUser.has(user_id)) {
        byUser.set(user_id, {
          user_id,
          name,
          points_won: 0,
          points_lost: 0,
          net: 0,
          affected_games: 0,
          games: [],
        });
      }
    });

    const players = Array.from(byUser.values()).map((p) => ({
      ...p,
      games: p.games.sort(
        (a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime(),
      ),
    }));
    players.sort((a, b) => b.net - a.net || b.points_won - a.points_won || a.name.localeCompare(b.name));

    // Pull actual leaderboard points so downstream pages can compute adjusted scores.
    const { data: lbData } = await supabase
      .from("leaderboard")
      .select("user_id, points");
    const lbMap = new Map<string, number>();
    (lbData ?? []).forEach((r: any) => lbMap.set(r.user_id, r.points));
    players.forEach((p) => {
      p.actual_points = lbMap.get(p.user_id) ?? 0;
    });

    return { players };
  });