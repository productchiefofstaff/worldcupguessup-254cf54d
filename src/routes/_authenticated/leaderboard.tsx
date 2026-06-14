import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Medal, Crown, ChevronDown, Radio } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { flagFor } from "@/lib/flags";
import { useState } from "react";


export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard – World Cup 2026 Predictor" },
      { name: "description", content: "See who's topping the World Cup prediction leaderboard." },
    ],
  }),
  component: LeaderboardPage,
});

type Row = {
  user_id: string;
  name: string;
  points: number;
  correct_results: number;
  correct_scores: number;
  settled_predictions: number;
  total_predictions: number;
};

function LeaderboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaderboard")
        .select("*")
        .order("points", { ascending: false })
        .order("settled_predictions", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as Row[];
    },
    refetchInterval: 30_000,
  });

  return (
    <main className="max-w-3xl mx-auto px-4 py-4 sm:py-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="bg-primary text-primary-foreground p-2 rounded-sm">
          <Trophy className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-none">
            Leaderboard
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Updated automatically as results come in</p>
        </div>
      </div>

      {data && data.length > 0 && (
        <div className="mb-4 rounded-md bg-warning/15 border border-warning/30 p-3 flex items-center gap-3">
          <Crown className="h-5 w-5 text-warning shrink-0" />
          <span className="text-sm font-bold text-ink">
            🏆 1st place wins £{20 * data.length}
          </span>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Failed to load leaderboard.</p>}

      <div className="bg-card border border-border rounded-md overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-surface text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="px-3 py-2 text-left w-10">#</th>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">Points</th>
              <th className="px-3 py-2 text-right">Correct Results</th>
              <th className="px-3 py-2 text-right">Correct Scores</th>
              <th className="px-3 py-2 text-right">Predictions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row, i) => {
              const isMe = user?.id === row.user_id;
              const rank = i + 1;
              return (
                <PlayerRow
                  key={row.user_id}
                  row={row}
                  rank={rank}
                  isMe={isMe}
                />
              );
            })}
          </tbody>
        </table>
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No players yet — be the first to predict!
          </div>
        )}
      </div>
    </main>
  );
}

type FixtureLite = {
  id: string;
  team_home: string;
  team_away: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
};

type PredLite = {
  fixture_id: string;
  home_score: number;
  away_score: number;
};

function pointsFor(ph: number, pa: number, fh: number, fa: number): number {
  if (ph === fh && pa === fa) return 40;
  return Math.sign(ph - pa) === Math.sign(fh - fa) ? 10 : 0;
}

function PlayerRow({ row, rank, isMe }: { row: Row; rank: number; isMe: boolean }) {
  const [open, setOpen] = useState(false);

  const predsQ = useQuery({
    queryKey: ["leaderboard-player-preds", row.user_id],
    enabled: open,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data: preds, error } = await supabase
        .from("predictions")
        .select("fixture_id, home_score, away_score")
        .eq("user_id", row.user_id);
      if (error) throw error;
      const predRows = (preds ?? []) as PredLite[];
      if (predRows.length === 0) return [] as Array<{ f: FixtureLite; p: PredLite }>;
      const ids = predRows.map((p) => p.fixture_id);
      const { data: fixtures, error: fErr } = await supabase
        .from("fixtures")
        .select("id, team_home, team_away, kickoff_at, home_score, away_score")
        .in("id", ids)
        .lte("kickoff_at", nowIso)
        .order("kickoff_at", { ascending: true });
      if (fErr) throw fErr;
      const fixtureRows = (fixtures ?? []) as FixtureLite[];
      const byId = new Map(predRows.map((p) => [p.fixture_id, p]));
      return fixtureRows
        .map((f) => ({ f, p: byId.get(f.id)! }))
        .filter((x) => x.p);
    },
  });

  return (
    <>
      <tr className={"border-b border-border " + (isMe ? "bg-primary/5" : "")}>
        <td className="px-3 py-3 font-extrabold text-ink">
          <span className="inline-flex items-center gap-1">
            {rank}
            {rank <= 3 && (
              <Medal
                className={
                  "h-4 w-4 " +
                  (rank === 1 ? "text-warning" : rank === 2 ? "text-muted-foreground" : "text-primary/70")
                }
              />
            )}
          </span>
        </td>
        <td className="px-3 py-3 font-bold text-ink">
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 text-left hover:text-primary transition-colors"
          >
            <span className="truncate">{row.name}</span>
            {isMe && (
              <span className="text-[10px] uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm">
                You
              </span>
            )}
            <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-180" : "")} />
          </button>
        </td>
        <td className="px-3 py-3 text-right font-extrabold text-ink tabular-nums">{row.points}</td>
        <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{row.correct_results}</td>
        <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{row.correct_scores}</td>
        <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
          {row.settled_predictions}/{row.total_predictions}
        </td>
      </tr>
      <tr className={"border-b border-border last:border-b-0 " + (isMe ? "bg-primary/5" : "")}>
        <td colSpan={6} className="p-0">
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleContent className="px-3 pb-3">
              {predsQ.isLoading && <p className="text-xs text-muted-foreground py-2">Loading…</p>}
              {predsQ.error && <p className="text-xs text-destructive py-2">Failed to load predictions.</p>}
              {predsQ.data && predsQ.data.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No predictions for played matches yet.</p>
              )}
              {predsQ.data && predsQ.data.length > 0 && (
                <ul className="divide-y divide-border">
                  {predsQ.data.map(({ f, p }) => {
                    const hasResult = f.home_score !== null && f.away_score !== null;
                    const pts = hasResult
                      ? pointsFor(p.home_score, p.away_score, f.home_score as number, f.away_score as number)
                      : null;
                    return (
                      <li
                        key={f.id}
                        className="flex items-center justify-between py-1.5 px-2 -mx-2 text-sm rounded-sm"
                      >
                        <span className="flex items-center gap-1.5 text-ink truncate">
                          <span aria-hidden>{flagFor(f.team_home)}</span>
                          <span className="text-muted-foreground text-xs">v</span>
                          <span aria-hidden>{flagFor(f.team_away)}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="font-bold tabular-nums">{p.home_score}-{p.away_score}</span>
                          {pts !== null ? (
                            <span
                              className={
                                "text-[10px] font-bold px-1.5 py-0.5 rounded-sm " +
                                (pts === 40
                                  ? "bg-success text-primary-foreground"
                                  : pts === 10
                                    ? "bg-warning text-ink"
                                    : "bg-muted text-muted-foreground")
                              }
                            >
                              +{pts}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-destructive font-semibold">
                              <Radio className="h-3 w-3" /> Live
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CollapsibleContent>
          </Collapsible>
        </td>
      </tr>
    </>
  );
}