import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Crown } from "lucide-react";

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

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif" } as const;

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function rankAccent(rank: number) {
  if (rank === 1) return { border: "border-warning", text: "text-warning", ring: "border-warning/40", glow: true };
  if (rank === 2) return { border: "border-muted-foreground/30", text: "text-muted-foreground", ring: "border-muted-foreground/30", glow: false };
  if (rank === 3) return { border: "border-muted-foreground/30", text: "text-muted-foreground", ring: "border-muted-foreground/30", glow: false };
  return { border: "border-border", text: "text-muted-foreground", ring: "border-border", glow: false };
}

function LeaderboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaderboard")
        .select("*")
        .order("points", { ascending: false })
        .order("correct_scores", { ascending: false })
        .order("correct_results", { ascending: false })
        .order("settled_predictions", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as Row[];
    },
    refetchInterval: 30_000,
  });

  const ranked = React.useMemo(() => {
    if (!data) return [];
    const out: (Row & { rank: number; tied: boolean })[] = [];
    let currentRank = 0;
    for (let i = 0; i < data.length; i++) {
      const prev = data[i - 1];
      const row = data[i];
      if (
        i > 0 &&
        row.points === prev.points &&
        row.correct_scores === prev.correct_scores
      ) {
        // tied with previous
        out.push({ ...row, rank: currentRank, tied: true });
      } else {
        currentRank = i + 1;
        const next = data[i + 1];
        const tiedWithNext =
          next !== undefined &&
          row.points === next.points &&
          row.correct_scores === next.correct_scores;
        out.push({ ...row, rank: currentRank, tied: tiedWithNext });
      }
    }
    return out;
  }, [data]);

  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      <div className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          Leaderboard
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Updated automatically as results come in</p>
      </div>

        {data && data.length > 0 && (
          <div className="flex justify-end -mt-2 -mb-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 border border-warning/30 px-2.5 py-1">
              <Crown className="h-3.5 w-3.5 text-warning shrink-0" />
              <span className="text-[11px] font-bold text-foreground">1st place wins £80</span>
            </div>
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">Failed to load leaderboard.</p>}

        <div className="space-y-2">
          {ranked.map((row) => {
            const isMe = user?.id === row.user_id;
            const rank = row.rank;
            const accent = rankAccent(rank);
            const accuracy =
              row.settled_predictions > 0
                ? Math.round(
                    ((row.correct_results ?? 0) + (row.correct_scores ?? 0)) /
                      row.settled_predictions *
                      1000,
                  ) / 10
                : 0;
            const initial = (row.name || "?").trim().charAt(0).toUpperCase();
            const ord = ordinal(rank);
            const rankDisplay = row.tied ? `=${ord}` : ord;

            return (
              <div key={row.user_id} className="relative group">
                {accent.glow && (
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-warning to-warning/60 rounded-xl blur opacity-20 pointer-events-none" />
                )}
                <div
                  className={
                    "relative bg-card border border-border border-l-4 rounded-r-xl overflow-hidden " +
                    accent.border
                  }
                >
                  <div className="p-2.5">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={
                            "w-11 h-11 bg-muted rounded-full border-2 flex items-center justify-center shrink-0 " +
                            accent.ring
                          }
                        >
                          <span
                            className={"text-lg leading-none " + accent.text}
                            style={BEBAS}
                          >
                            {rankDisplay}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-bold text-ink leading-tight">
                            {row.name}
                          </h2>
                          {isMe && (
                            <span className="inline-block mt-0.5 text-[9px] uppercase tracking-wider bg-primary text-primary-foreground px-1 py-0 rounded-sm font-black">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="text-3xl text-ink leading-none tabular-nums"
                          style={BEBAS}
                        >
                          {row.points}
                        </div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5">
                          Points
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-4 gap-1 border-t border-border/60 pt-2">
                      <StatBox value={row.settled_predictions} label="Matches Predicted" />
                      <StatBox value={row.correct_scores} label="Correct Scores" />
                      <StatBox value={row.correct_results} label="Correct Results" />
                      <StatBox
                        value={`${accuracy}%`}
                        label="Total Accuracy"
                        valueClass={accent.text}
                      />
                    </div>
                  </div>
                  <span
                    className="absolute top-0 right-0 text-5xl text-foreground/[0.03] select-none pointer-events-none -mr-2 -mt-2 leading-none"
                    style={BEBAS}
                  >
                    {rank}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground bg-card rounded-xl border border-border">
            No players yet — be the first to predict!
          </div>
        )}
      </div>
    </main>
  );
}

function StatBox({
  value,
  label,
  valueClass,
}: {
  value: React.ReactNode;
  label: string;
  valueClass?: string;
}) {
  return (
    <div className="text-center">
      <div className={"text-sm font-bold tabular-nums " + (valueClass ?? "text-foreground")}>
        {value}
      </div>
      <div className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wide mt-0.5 leading-tight">
        {label}
      </div>
    </div>
  );
}