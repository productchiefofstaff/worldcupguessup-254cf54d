import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Medal } from "lucide-react";

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

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Failed to load leaderboard.</p>}

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="grid grid-cols-[2.5rem_1fr_3rem_3rem_3rem_3.5rem] px-3 py-2 bg-surface text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Pts</span>
          <span className="text-right">Res</span>
          <span className="text-right">Scr</span>
          <span className="text-right">Picks</span>
        </div>
        {(data ?? []).map((row, i) => {
          const isMe = user?.id === row.user_id;
          const rank = i + 1;
          return (
            <div
              key={row.user_id}
              className={
                "grid grid-cols-[2.5rem_1fr_3rem_3rem_3rem_3.5rem] px-3 py-3 items-center border-b border-border last:border-b-0 " +
                (isMe ? "bg-primary/5" : "")
              }
            >
              <span className="font-extrabold text-ink flex items-center gap-1">
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
              <span className="font-bold text-ink truncate">
                {row.name}
                {isMe && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm">
                    You
                  </span>
                )}
              </span>
              <span className="text-right font-extrabold text-ink">{row.points}</span>
              <span className="text-right text-sm text-muted-foreground">{row.correct_results}</span>
              <span className="text-right text-sm text-muted-foreground">{row.correct_scores}</span>
              <span className="text-right text-xs text-muted-foreground">
                {row.settled_predictions}/{row.total_predictions}
              </span>
            </div>
          );
        })}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No players yet — be the first to predict!
          </div>
        )}
      </div>
    </main>
  );
}