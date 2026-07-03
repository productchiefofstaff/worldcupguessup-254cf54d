import { createServerFn } from "@tanstack/react-start";
import { db as supabase } from "@/lib/db";

export type HistoryPoint = { date: string } & Record<string, number | string>;

export type HistoryPlayer = { user_id: string; name: string };

export type LeaderboardHistory = {
  players: HistoryPlayer[];
  points: HistoryPoint[];
};

function pointsFor(ph: number, pa: number, fh: number, fa: number): number {
  if (ph === fh && pa === fa) return 40;
  const ps = Math.sign(ph - pa);
  const fs = Math.sign(fh - fa);
  return ps === fs ? 10 : 0;
}

// Tournament start: 14 June 2026. Snapshot taken at midday UK time each day.
// June/July UK is BST (UTC+1) so 12:00 BST = 11:00 UTC.
const START_ISO = "2026-06-15T11:00:00Z";

export const getLeaderboardHistory = createServerFn({ method: "GET" })
  .handler(async () => {
    const [{ data: fixtures, error: fxErr }, { data: preds, error: prErr }, { data: profiles, error: pfErr }] =
      await Promise.all([
        supabase
          .from("fixtures")
          .select("id, kickoff_at, home_score, away_score")
          .not("home_score", "is", null)
          .not("away_score", "is", null),
        supabase.from("predictions").select("user_id, fixture_id, home_score, away_score"),
        supabase.from("profiles").select("id, display_name, show_on_leaderboard"),
      ]);
    if (fxErr) throw fxErr;
    if (prErr) throw prErr;
    if (pfErr) throw pfErr;

    const nameById = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => {
      if (p.show_on_leaderboard) nameById.set(p.id, p.display_name);
    });

    type Fx = { id: string; kickoff_at: string; home_score: number; away_score: number; settledAt: number };
    const fxRows: Fx[] = (fixtures ?? []).map((f: any) => ({
      id: f.id,
      kickoff_at: f.kickoff_at,
      home_score: f.home_score,
      away_score: f.away_score,
      // Treat a match as settled ~2 hours after kickoff.
      settledAt: new Date(f.kickoff_at).getTime() + 2 * 60 * 60 * 1000,
    }));
    const fxById = new Map(fxRows.map((f) => [f.id, f]));

    // Per-player, per-fixture points
    type Entry = { user_id: string; settledAt: number; pts: number };
    const entries: Entry[] = [];
    (preds ?? []).forEach((p: any) => {
      if (!nameById.has(p.user_id)) return;
      const fx = fxById.get(p.fixture_id);
      if (!fx) return;
      entries.push({
        user_id: p.user_id,
        settledAt: fx.settledAt,
        pts: pointsFor(p.home_score, p.away_score, fx.home_score, fx.away_score),
      });
    });

    // Build day list (midday UTC-aligned to 11:00 each day from start to today)
    const startMs = new Date(START_ISO).getTime();
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const days: number[] = [];
    for (let t = startMs; t <= nowMs + dayMs; t += dayMs) {
      if (t > nowMs) {
        // Include "now" as final point if it's past start
        days.push(nowMs);
        break;
      }
      days.push(t);
    }

    const players: HistoryPlayer[] = Array.from(nameById.entries()).map(([user_id, name]) => ({
      user_id,
      name,
    }));
    players.sort((a, b) => a.name.localeCompare(b.name));

    const points: HistoryPoint[] = days.map((t) => {
      const row: HistoryPoint = { date: new Date(t).toISOString() };
      players.forEach((pl) => {
        let total = 0;
        for (const e of entries) {
          if (e.user_id === pl.user_id && e.settledAt <= t) total += e.pts;
        }
        row[pl.user_id] = total;
      });
      return row;
    });

    return { players, points } as LeaderboardHistory;
  });