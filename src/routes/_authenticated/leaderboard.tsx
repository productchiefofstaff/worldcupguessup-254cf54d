import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { Crown } from "lucide-react";

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
  if (rank === 1) return { border: "border-yellow-500", text: "text-yellow-500", ring: "border-yellow-500/40", glow: true };
  if (rank === 2) return { border: "border-zinc-300", text: "text-zinc-300", ring: "border-zinc-300/40", glow: false };
  if (rank === 3) return { border: "border-amber-700", text: "text-amber-600", ring: "border-amber-700/40", glow: false };
  return { border: "border-zinc-700", text: "text-zinc-400", ring: "border-zinc-700", glow: false };
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
    <main className="min-h-screen bg-zinc-950">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        <div className="flex justify-between items-end border-b border-zinc-800 pb-2">
          <h1 className="text-3xl text-white tracking-wider italic" style={BEBAS}>
            LEADERBOARD
          </h1>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest pb-1">
            World Cup 2026
          </span>
        </div>

        {data && data.length > 0 && (
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 flex items-center gap-3">
            <Crown className="h-5 w-5 text-yellow-500 shrink-0" />
            <span className="text-sm font-bold text-white">
              1st place wins £{20 * data.length}
            </span>
          </div>
        )}

        {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
        {error && <p className="text-sm text-red-400">Failed to load leaderboard.</p>}

        <div className="space-y-4">
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

            return (
              <div key={row.user_id} className="relative group">
                {accent.glow && (
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-xl blur opacity-20 pointer-events-none" />
                )}
                <div
                  className={
                    "relative bg-zinc-900 border-l-4 rounded-r-xl overflow-hidden " +
                    accent.border
                  }
                >
                  <div className="p-4">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={
                            "w-14 h-14 bg-zinc-800 rounded-full border-2 flex flex-col items-center justify-center shrink-0 " +
                            accent.ring
                          }
                        >
                          <span
                            className={"text-xl leading-none " + accent.text}
                            style={BEBAS}
                          >
                            {ord}
                          </span>
                          {row.tied && (
                            <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 leading-none mt-0.5">
                              tied
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-2xl font-bold text-white leading-tight truncate">
                            {row.name}
                          </h2>
                          {isMe && (
                            <span className="inline-block mt-1 text-[10px] uppercase tracking-wider bg-white text-zinc-900 px-1.5 py-0.5 rounded-sm font-black">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="text-4xl text-white leading-none tabular-nums"
                          style={BEBAS}
                        >
                          {row.points}
                        </div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase mt-1">
                          Points
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-4 gap-2 border-t border-zinc-800/60 pt-3">
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
                    className="absolute top-0 right-0 text-7xl text-white/[0.03] select-none pointer-events-none -mr-2 -mt-4 leading-none"
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
          <div className="p-6 text-center text-sm text-zinc-500 bg-zinc-900 rounded-xl border border-zinc-800">
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
      <div className={"text-sm font-bold tabular-nums " + (valueClass ?? "text-zinc-200")}>
        {value}
      </div>
      <div className="text-[9px] text-zinc-500 uppercase font-semibold tracking-wide mt-0.5 leading-tight">
        {label}
      </div>
    </div>
  );
}