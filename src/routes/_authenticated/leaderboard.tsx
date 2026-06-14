import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Medal, Crown } from "lucide-react";


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
              <th className="px-3 py-2 text-right">Correct %</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row, i) => {
              const isMe = user?.id === row.user_id;
              const rank = i + 1;
              return (
                <tr
                  key={row.user_id}
                  className={"border-b border-border last:border-b-0 " + (isMe ? "bg-primary/5" : "")}
                >
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
                    <span className="truncate">{row.name}</span>
                    {isMe && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm">
                        You
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-extrabold text-ink tabular-nums">{row.points}</td>
                  <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{row.correct_results}</td>
                  <td className="px-3 py-3 text-right text-muted-foreground tabular-nums">{row.correct_scores}</td>
                  <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {row.settled_predictions}/{row.total_predictions}
                  </td>
                </tr>
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