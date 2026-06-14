import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { flagFor } from "@/lib/flags";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/my-predictions")({
  head: () => ({
    meta: [
      { title: "My Predictions – World Cup 2026 Predictor" },
      { name: "description", content: "Review all your World Cup 2026 predictions." },
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
    queryKey: ["fixtures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fixtures")
        .select("id, match_number, stage, team_home, team_away, kickoff_at, home_score, away_score")
        .order("match_number");
      if (error) throw error;
      return (data ?? []) as FixtureRow[];
    },
  });

  const predsQ = useQuery({
    queryKey: ["predictions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, fixture_id, home_score, away_score")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as PredRow[];
    },
  });

  const fixtureMap = new Map<string, FixtureRow>();
  (fixturesQ.data ?? []).forEach((f) => fixtureMap.set(f.id, f));

  const rows = (predsQ.data ?? [])
    .map((p) => {
      const f = fixtureMap.get(p.fixture_id);
      if (!f) return null;
      return { f, p, pts: pointsFor(p, f) };
    })
    .filter(Boolean) as Array<{ f: FixtureRow; p: PredRow; pts: number | null }>;

  if (!user) return null;

  return (
    <main className="max-w-3xl mx-auto px-4 py-4 sm:py-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="bg-primary text-primary-foreground p-2 rounded-sm">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-none">
            My Predictions
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Every prediction you have made so far
          </p>
        </div>
      </div>

      {predsQ.isLoading && <p className="text-sm text-muted-foreground">Loading predictions…</p>}
      {predsQ.error && <p className="text-sm text-destructive">Failed to load predictions.</p>}

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem_3rem] sm:grid-cols-[1fr_5.5rem_5.5rem_4rem] px-3 py-2 bg-surface text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
          <span>Match</span>
          <span className="text-right">Result</span>
          <span className="text-right">You picked</span>
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
                          ? "bg-warning text-ink"
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
        {!predsQ.isLoading && rows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            You have not made any predictions yet. Head to Fixtures to get started!
          </div>
        )}
      </div>
    </main>
  );
}
