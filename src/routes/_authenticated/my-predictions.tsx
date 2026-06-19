import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { flagFor } from "@/lib/flags";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { PillNav, type PillNavItem } from "@/components/PillNav";

export const Route = createFileRoute("/_authenticated/my-predictions")({
  head: () => ({
    meta: [
      { title: "Predictions – World Cup 2026 Predictor" },
      { name: "description", content: "Review World Cup 2026 predictions from you and other players." },
    ],
  }),
  component: MyPredictionsPage,
});

type FixtureRow = {
  id: string;
  match_number: number;
  stage: string;
  team_home: string;
  team_away: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
};

type PredRow = {
  id: string;
  fixture_id: string;
  home_score: number;
  away_score: number;
};

function pointsFor(p: PredRow, f: FixtureRow): number | null {
  if (f.home_score === null || f.away_score === null) return null;
  if (p.home_score === f.home_score && p.away_score === f.away_score) return 40;
  const pr = Math.sign(p.home_score - p.away_score);
  const ac = Math.sign(f.home_score - f.away_score);
  return pr === ac ? 10 : 0;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MyPredictionsPage() {
  const { user } = useAuth();

  const fixturesQ = useQuery({
    queryKey: ["fixtures", "prediction-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fixtures")
        .select("id, match_number, stage, team_home, team_away, kickoff_at, home_score, away_score")
        .order("match_number");
      if (error) throw error;
      return (data ?? []) as FixtureRow[];
    },
  });

  const leaderboardQ = useQuery({
    queryKey: ["leaderboard", "summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaderboard")
        .select("user_id, name, points")
        .order("points", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ user_id: string; name: string; points: number }>;
    },
  });

  const allPredsQ = useQuery({
    queryKey: ["predictions", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, user_id, fixture_id, home_score, away_score");
      if (error) throw error;
      return (data ?? []) as Array<PredRow & { user_id: string }>;
    },
  });

  const [activeTab, setActiveTab] = useState<string>("you");

  if (!user) return null;

  const fixtureMap = new Map<string, FixtureRow>();
  (fixturesQ.data ?? []).forEach((f) => fixtureMap.set(f.id, f));

  const players = leaderboardQ.data ?? [];
  const others = players.filter((p) => p.user_id !== user.id);

  function rowsFor(userId: string) {
    const now = new Date();
    return (allPredsQ.data ?? [])
      .filter((p) => p.user_id === userId)
      .map((p) => {
        const f = fixtureMap.get(p.fixture_id);
        if (!f) return null;
        const kickoff = new Date(f.kickoff_at);
        if (kickoff > now) return null;
        return { f, p, pts: pointsFor(p, f) };
      })
      .filter(Boolean) as Array<{ f: FixtureRow; p: PredRow; pts: number | null }>;
  }
  
  function sortRows(rows: Array<{ f: FixtureRow; p: PredRow; pts: number | null }>) {
    return [...rows].sort((a, b) => new Date(b.f.kickoff_at).getTime() - new Date(a.f.kickoff_at).getTime());
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-4 sm:py-6">
      <div className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Predictions
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Every prediction made so far
        </p>
      </div>

      {(allPredsQ.isLoading || leaderboardQ.isLoading) && (
        <p className="text-sm text-muted-foreground">Loading predictions…</p>
      )}
      {(allPredsQ.error || leaderboardQ.error) && (
        <p className="text-sm text-destructive">Failed to load predictions.</p>
      )}

      <div className="mb-4">
        <PillNav
          items={[
            { id: "you", top: "You" } as PillNavItem,
            ...others.map((p) => ({ id: p.user_id, top: p.name }) as PillNavItem),
          ]}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="Select player"
        />
      </div>

      {activeTab === "you" ? (
        <PredictionsTable rows={sortRows(rowsFor(user.id))} isOther={false} loading={allPredsQ.isLoading} />
      ) : (
        <PredictionsTable
          rows={sortRows(rowsFor(activeTab))}
          isOther={true}
          loading={allPredsQ.isLoading}
        />
      )}
    </main>
  );
}

function PredictionsTable({
  rows,
  isOther,
  loading,
}: {
  rows: Array<{ f: FixtureRow; p: PredRow; pts: number | null }>;
  isOther: boolean;
  loading: boolean;
}) {
  const pickedLabel = "Predicted";
  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      <div className="grid grid-cols-[1fr_4.5rem_4.5rem_3rem] sm:grid-cols-[1fr_5.5rem_5.5rem_4rem] px-3 py-2 bg-surface text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
        <span>Match</span>
        <span className="text-right">Result</span>
        <span className="text-right whitespace-nowrap">{pickedLabel}</span>
        <span className="text-right">Pts</span>
      </div>
      {rows.map(({ f, p, pts }) => {
        const hasResult = f.home_score !== null && f.away_score !== null;
        return (
          <div
            key={p.id}
            className="grid grid-cols-[1fr_4.5rem_4.5rem_3rem] sm:grid-cols-[1fr_5.5rem_5.5rem_4rem] px-3 py-3 items-center border-b border-border last:border-b-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-bold text-ink truncate">
                <span>{flagFor(f.team_home)}</span>
                <span className="text-muted-foreground font-normal">v</span>
                <span>{flagFor(f.team_away)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {formatDate(f.kickoff_at)} · {formatTime(f.kickoff_at)} · {f.stage}
              </div>
            </div>
            <span className="text-right text-sm text-muted-foreground">
              {hasResult ? `${f.home_score} – ${f.away_score}` : "—"}
            </span>
            <span className="text-right text-sm font-bold text-ink">
              {p.home_score} – {p.away_score}
            </span>
            {pts === null ? (
              <span className="text-right text-sm font-extrabold text-ink">—</span>
            ) : (
              <span className="text-right">
                <span
                  className={
                    "inline-block text-xs font-bold px-0 py-0.5 rounded-sm " +
                    (pts === 40
                      ? "bg-success text-primary-foreground"
                      : pts === 10
                        ? "bg-warning text-white"
                        : "bg-muted text-muted-foreground")
                  }
                >
                  +{pts}
                </span>
              </span>
            )}
          </div>
        );
      })}
      {!loading && rows.length === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No predictions yet.
        </div>
      )}
    </div>
  );
}
