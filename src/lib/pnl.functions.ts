import { createServerFn } from "@tanstack/react-start";
import { db as supabase } from "@/lib/db";

export type PnlPoint = { label: string; kickoff: string } & Record<string, number | string>;
export type PnlPlayer = { user_id: string; name: string };
export type PnlHistory = { players: PnlPlayer[]; points: PnlPoint[] };

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

// Return decimal odds for the actual scoreline of a fixture, using
// fixtures.winning_odds if set, otherwise falling back to a matching
// historic_odds row (any vendor, prefer 'closing').
function pickOdds(
  fx: { winning_odds: number | null; team_home: string; team_away: string; home_score: number; away_score: number; kickoff_at: string },
  historic: Array<{ home_team: string; away_team: string; match_date: string; scoreline: string; decimal_odds: number | null; odds_type: string }>,
): number | null {
  if (fx.winning_odds && Number(fx.winning_odds) > 1) return Number(fx.winning_odds);
  const wantScore = `${fx.home_score}-${fx.away_score}`;
  const home = norm(fx.team_home);
  const away = norm(fx.team_away);
  const day = fx.kickoff_at.slice(0, 10);
  const matches = historic.filter((h) => {
    if (h.scoreline !== wantScore) return false;
    if (!h.decimal_odds) return false;
    if (h.match_date.slice(0, 10) !== day) return false;
    const hh = norm(h.home_team);
    const aa = norm(h.away_team);
    return (hh.includes(home) || home.includes(hh)) && (aa.includes(away) || away.includes(aa));
  });
  if (matches.length === 0) return null;
  const closing = matches.filter((m) => m.odds_type === "closing");
  const pool = closing.length ? closing : matches;
  const vals = pool.map((m) => Number(m.decimal_odds)).filter((v) => v > 1);
  if (!vals.length) return null;
  // Median
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

export const getPnlHistory = createServerFn({ method: "GET" }).handler(async () => {
  const [{ data: fixtures }, { data: preds }, { data: profiles }, { data: historic }] = await Promise.all([
    supabase
      .from("fixtures")
      .select("id, team_home, team_away, kickoff_at, home_score, away_score, winning_odds")
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .order("kickoff_at", { ascending: true }),
    supabase.from("predictions").select("user_id, fixture_id, home_score, away_score"),
    supabase.from("profiles").select("id, display_name, show_on_leaderboard"),
    supabase.from("historic_odds").select("home_team, away_team, match_date, scoreline, decimal_odds, odds_type"),
  ]);

  const nameById = new Map<string, string>();
  (profiles ?? []).forEach((p: any) => {
    if (p.show_on_leaderboard) nameById.set(p.id, p.display_name);
  });

  const players: PnlPlayer[] = Array.from(nameById.entries())
    .map(([user_id, name]) => ({ user_id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Index predictions by (user, fixture)
  const predByKey = new Map<string, { home: number; away: number }>();
  (preds ?? []).forEach((p: any) => {
    if (!nameById.has(p.user_id)) return;
    predByKey.set(`${p.user_id}|${p.fixture_id}`, { home: p.home_score, away: p.away_score });
  });

  const totals = new Map<string, number>();
  players.forEach((p) => totals.set(p.user_id, 0));
  const points: PnlPoint[] = [];

  // Starting point at zero
  if ((fixtures ?? []).length) {
    const first = (fixtures as any[])[0];
    const row: PnlPoint = {
      label: "Start",
      kickoff: new Date(new Date(first.kickoff_at).getTime() - 60_000).toISOString(),
    };
    players.forEach((p) => (row[p.user_id] = 0));
    points.push(row);
  }

  (fixtures ?? []).forEach((fx: any) => {
    const odds = pickOdds(fx, (historic ?? []) as any[]);
    // Skip fixtures we have no odds for — otherwise misses show as -£1 while
    // correct scores can't be paid out, which reads as "nobody ever wins".
    if (!odds) return;
    players.forEach((pl) => {
      const pred = predByKey.get(`${pl.user_id}|${fx.id}`);
      if (!pred) return; // no bet, no change
      const isExact = pred.home === fx.home_score && pred.away === fx.away_score;
      if (isExact) {
        totals.set(pl.user_id, (totals.get(pl.user_id) ?? 0) + (odds - 1));
      } else {
        totals.set(pl.user_id, (totals.get(pl.user_id) ?? 0) - 1);
      }
    });
    const row: PnlPoint = {
      label: new Date(fx.kickoff_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      kickoff: fx.kickoff_at,
    };
    players.forEach((p) => (row[p.user_id] = Math.round((totals.get(p.user_id) ?? 0) * 100) / 100));
    points.push(row);
  });

  return { players, points } as PnlHistory;
});