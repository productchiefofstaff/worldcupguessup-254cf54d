import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PnlPlayer = {
  user_id: string;
  name: string;
  pnl: number;          // net £ from £1 stake on their predicted score per match
  wins: number;         // number of correct-score wins
  bets: number;         // matches settled with a prediction
  biggest_win: { score: string; odds: number; pnl: number; teams: string } | null;
};

export type PnlResult = {
  players: PnlPlayer[];
  settled_with_odds: number;
  settled_without_odds: number;
};

export const getPnl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: fixtures }, { data: preds }, { data: profiles }] = await Promise.all([
      supabase
        .from("fixtures")
        .select("id, team_home, team_away, home_score, away_score, cs_odds"),
      supabase.from("predictions").select("user_id, fixture_id, home_score, away_score"),
      supabase.from("profiles").select("id, display_name, show_on_leaderboard"),
    ]);

    const nameById = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => {
      if (p.show_on_leaderboard) nameById.set(p.id, p.display_name);
    });

    const settled = (fixtures ?? []).filter(
      (f: any) => f.home_score !== null && f.away_score !== null,
    );
    const settledWithOdds = settled.filter((f: any) => f.cs_odds !== null);
    const settledWithOddsById = new Map(settledWithOdds.map((f: any) => [f.id, f]));

    const acc = new Map<string, PnlPlayer>();
    nameById.forEach((name, id) =>
      acc.set(id, { user_id: id, name, pnl: 0, wins: 0, bets: 0, biggest_win: null }),
    );

    (preds ?? []).forEach((p: any) => {
      const row = acc.get(p.user_id);
      if (!row) return;
      const fx: any = settledWithOddsById.get(p.fixture_id);
      if (!fx) return;
      row.bets += 1;
      const correct = p.home_score === fx.home_score && p.away_score === fx.away_score;
      if (correct) {
        const win = Number(fx.cs_odds) - 1;
        row.pnl += win;
        row.wins += 1;
        if (!row.biggest_win || win > row.biggest_win.pnl) {
          row.biggest_win = {
            score: `${fx.home_score}-${fx.away_score}`,
            odds: Number(fx.cs_odds),
            pnl: win,
            teams: `${fx.team_home} v ${fx.team_away}`,
          };
        }
      } else {
        row.pnl -= 1;
      }
    });

    const players = Array.from(acc.values()).sort((a, b) => b.pnl - a.pnl);
    return {
      players,
      settled_with_odds: settledWithOdds.length,
      settled_without_odds: settled.length - settledWithOdds.length,
    } as PnlResult;
  });