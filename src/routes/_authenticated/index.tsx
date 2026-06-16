import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { FixtureCard, type Fixture, type Prediction } from "@/components/FixtureCard";
import { useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
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

const TABS = ["Upcoming", "Completed"] as const;

function FixturesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Upcoming");
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("wc2026-whats-new-seen-v1");
    if (!seen) {
      setWhatsNewOpen(true);
    }
  }, []);

  const dismissWhatsNew = () => {
    localStorage.setItem("wc2026-whats-new-seen-v1", "1");
    setWhatsNewOpen(false);
  };

  const fixturesQ = useQuery({
    queryKey: ["fixtures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fixtures")
        .select("*")
        .order("kickoff_at", { ascending: true })
        .order("match_number", { ascending: true });
      if (error) throw error;
      return data as Fixture[];
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
    return all.filter((f) => {
      const hasResult = f.home_score !== null;
      if (tab === "Upcoming") return !hasResult;
      if (tab === "Completed") return hasResult;
      return true;
    });
  }, [fixturesQ.data, tab]);

  const grouped = useMemo(() => {
    const map = new Map<string, Fixture[]>();
    filtered.forEach((f) => {
      const k = dayKey(f.kickoff_at);
      const arr = map.get(k) ?? [];
      arr.push(f);
      map.set(k, arr);
    });
    const entries = Array.from(map.entries());
    if (tab === "Completed") {
      entries.forEach(([, arr]) => arr.reverse());
      entries.reverse();
    }
    return entries;
  }, [filtered, tab]);

  if (!user) return null;

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
        {TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={
              "shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors " +
              (tab === s
                ? "bg-ink text-primary-foreground border-ink"
                : "bg-card text-ink border-border hover:bg-surface")
            }
          >
            {s}
          </button>
        ))}
      </div>

      {(fixturesQ.isLoading || (!!user && predsQ.isLoading)) && (
        <p className="text-sm text-muted-foreground">Loading fixtures…</p>
      )}
      {fixturesQ.error && <p className="text-sm text-destructive">Failed to load fixtures.</p>}

      {!fixturesQ.isLoading && !predsQ.isLoading && (
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
                  userId={user.id}
                />
              ))}
            </div>
          </section>
        ))}
        {!fixturesQ.isLoading && grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">No fixtures match this filter.</p>
        )}
      </div>
      )}
    </main>
  );
}