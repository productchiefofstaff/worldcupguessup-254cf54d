import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { usePlayer } from "@/hooks/use-player";
import { FixtureCard, type Fixture, type Prediction } from "@/components/FixtureCard";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fixtures – World Cup 2026 Predictor" },
      { name: "description", content: "Predict the score of every 2026 World Cup match. 40 points for the exact score, 10 for the result." },
    ],
  }),
  component: FixturesPage,
});

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const STAGES = ["All", "Group Stage", "Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Third-place Play-off", "Final"] as const;

function FixturesPage() {
  const { player } = usePlayer();
  const [stage, setStage] = useState<(typeof STAGES)[number]>("All");
  const [showUpcoming, setShowUpcoming] = useState(true);

  const fixturesQ = useQuery({
    queryKey: ["fixtures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fixtures")
        .select("*")
        .order("match_number");
      if (error) throw error;
      return data as Fixture[];
    },
  });

  const predsQ = useQuery({
    queryKey: ["predictions", player?.id],
    enabled: !!player,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, fixture_id, home_score, away_score")
        .eq("player_id", player!.id);
      if (error) throw error;
      return data as Prediction[];
    },
  });

  const predByFixture = useMemo(() => {
    const map = new Map<string, Prediction>();
    (predsQ.data ?? []).forEach((p) => map.set(p.fixture_id, p));
    return map;
  }, [predsQ.data]);

  const filtered = useMemo(() => {
    const all = fixturesQ.data ?? [];
    const nowTs = Date.now();
    return all.filter((f) => {
      if (stage !== "All" && f.stage !== stage) return false;
      if (showUpcoming) {
        // upcoming = kickoff in future OR not yet resulted
        if (new Date(f.kickoff_at).getTime() < nowTs && f.home_score !== null) return false;
      }
      return true;
    });
  }, [fixturesQ.data, stage, showUpcoming]);

  const grouped = useMemo(() => {
    const map = new Map<string, Fixture[]>();
    filtered.forEach((f) => {
      const k = dayKey(f.kickoff_at);
      const arr = map.get(k) ?? [];
      arr.push(f);
      map.set(k, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-4 sm:py-6">
      <div className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">Fixtures</h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-bold text-success">40 pts</span> exact score ·{" "}
          <span className="font-bold text-warning">10 pts</span> correct result · predictions lock at kickoff
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Knockout scores are based on the 90-minute result (extra time and penalties do not count).
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={
              "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors " +
              (stage === s
                ? "bg-ink text-primary-foreground border-ink"
                : "bg-card text-ink border-border hover:bg-surface")
            }
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => setShowUpcoming((v) => !v)}
          className={
            "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border ml-auto " +
            (showUpcoming
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-ink border-border")
          }
        >
          {showUpcoming ? "Upcoming only" : "Show all"}
        </button>
      </div>

      {fixturesQ.isLoading && <p className="text-sm text-muted-foreground">Loading fixtures…</p>}
      {fixturesQ.error && <p className="text-sm text-destructive">Failed to load fixtures.</p>}

      <div className="space-y-6">
        {grouped.map(([k, fixtures]) => (
          <section key={k}>
            <h2 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">
              {formatDay(fixtures[0].kickoff_at)}
            </h2>
            <div className="space-y-2">
              {fixtures.map((f) => (
                <FixtureCard
                  key={f.id}
                  fixture={f}
                  prediction={predByFixture.get(f.id) ?? null}
                  playerId={player!.id}
                />
              ))}
            </div>
          </section>
        ))}
        {!fixturesQ.isLoading && grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">No fixtures match this filter.</p>
        )}
      </div>
    </main>
  );
}