import { createServerFn } from "@tanstack/react-start";
import { db as supabase } from "@/lib/db";

export type WinOdds = {
  players: { user_id: string; name: string; current: number; winPct: number; topPct: number }[];
  remainingFixtures: number;
  simulations: number;
};

function pointsFor(ph: number, pa: number, fh: number, fa: number): number {
  if (ph === fh && pa === fa) return 40;
  const ps = Math.sign(ph - pa);
  const fs = Math.sign(fh - fa);
  return ps === fs ? 10 : 0;
}

export const getWinOdds = createServerFn({ method: "GET" })
  .inputValidator(
    (input?: { userIds?: string[]; fromKickoff?: string }) => input ?? {},
  )
  .handler(async ({ data }) => {
    const filterUserIds = data?.userIds;
    const fromKickoff = data?.fromKickoff;
    const [{ data: fixtures }, { data: preds }, { data: profiles }] = await Promise.all([
      supabase.from("fixtures").select("id, home_score, away_score, kickoff_at"),
      supabase.from("predictions").select("user_id, fixture_id, home_score, away_score"),
      supabase.from("profiles").select("id, display_name, show_on_leaderboard"),
    ]);

    const nameById = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => {
      if (!p.show_on_leaderboard) return;
      if (filterUserIds && !filterUserIds.includes(p.id)) return;
      nameById.set(p.id, p.display_name);
    });
    const userIds = Array.from(nameById.keys());

    const fromMs = fromKickoff ? new Date(fromKickoff).getTime() : null;
    const inWindow = (fixtures ?? []).filter((f: any) => {
      if (fromMs === null) return true;
      if (!f.kickoff_at) return false;
      return new Date(f.kickoff_at).getTime() >= fromMs;
    });
    const settled = inWindow.filter(
      (f: any) => f.home_score !== null && f.away_score !== null,
    );
    const remaining = inWindow.filter(
      (f: any) => f.home_score === null || f.away_score === null,
    );
    const settledById = new Map(settled.map((f: any) => [f.id, f]));
    // Distribution is always drawn from ALL settled fixtures for the user,
    // regardless of the window used to compute current/remaining points.
    const allSettled = (fixtures ?? []).filter(
      (f: any) => f.home_score !== null && f.away_score !== null,
    );
    const allSettledById = new Map(allSettled.map((f: any) => [f.id, f]));

    // Per-user historical points distribution across settled fixtures
    const perUserPts = new Map<string, number[]>();
    userIds.forEach((id) => perUserPts.set(id, []));
    const currentByUser = new Map<string, number>();
    userIds.forEach((id) => currentByUser.set(id, 0));

    (preds ?? []).forEach((p: any) => {
      if (!nameById.has(p.user_id)) return;
      // Historical distribution: use every settled fixture ever.
      const anyFx: any = allSettledById.get(p.fixture_id);
      if (anyFx) {
        const ptsAll = pointsFor(
          p.home_score,
          p.away_score,
          anyFx.home_score,
          anyFx.away_score,
        );
        perUserPts.get(p.user_id)!.push(ptsAll);
      }
      // Current score: only fixtures inside the window count.
      const fx: any = settledById.get(p.fixture_id);
      if (fx) {
        const pts = pointsFor(p.home_score, p.away_score, fx.home_score, fx.away_score);
        currentByUser.set(p.user_id, (currentByUser.get(p.user_id) ?? 0) + pts);
      }
    });

    // Laplace-smoothed distribution over {0, 10, 40} for each user
    const distByUser = new Map<string, [number, number, number]>();
    userIds.forEach((id) => {
      const arr = perUserPts.get(id) ?? [];
      let c0 = 1, c10 = 1, c40 = 1; // smoothing
      arr.forEach((v) => {
        if (v === 40) c40++;
        else if (v === 10) c10++;
        else c0++;
      });
      const total = c0 + c10 + c40;
      distByUser.set(id, [c0 / total, c10 / total, c40 / total]);
    });

    const N = 5000;
    const remainingCount = remaining.length;
    const winCounts = new Map<string, number>();
    const topCounts = new Map<string, number>(); // ties count as top
    userIds.forEach((id) => {
      winCounts.set(id, 0);
      topCounts.set(id, 0);
    });

    for (let sim = 0; sim < N; sim++) {
      const totals: [string, number][] = userIds.map((id) => [id, currentByUser.get(id) ?? 0]);
      for (let r = 0; r < remainingCount; r++) {
        for (let i = 0; i < totals.length; i++) {
          const [p0, p10] = distByUser.get(totals[i][0])!;
          const x = Math.random();
          const add = x < p0 ? 0 : x < p0 + p10 ? 10 : 40;
          totals[i][1] += add;
        }
      }
      let max = -Infinity;
      totals.forEach(([, v]) => {
        if (v > max) max = v;
      });
      const winners = totals.filter(([, v]) => v === max);
      winners.forEach(([id]) => topCounts.set(id, (topCounts.get(id) ?? 0) + 1));
      // Single winner credit split evenly for "winPct"
      winners.forEach(([id]) =>
        winCounts.set(id, (winCounts.get(id) ?? 0) + 1 / winners.length),
      );
    }

    const players = userIds
      .map((id) => ({
        user_id: id,
        name: nameById.get(id)!,
        current: currentByUser.get(id) ?? 0,
        winPct: ((winCounts.get(id) ?? 0) / N) * 100,
        topPct: ((topCounts.get(id) ?? 0) / N) * 100,
      }))
      .sort((a, b) => b.winPct - a.winPct);

    return { players, remainingFixtures: remainingCount, simulations: N } as WinOdds;
  });
