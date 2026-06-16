import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { FixtureCard, type Fixture, type Prediction } from "@/components/FixtureCard";
import { getAllTeamForms, type FormMatch } from "@/lib/team-form.functions";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lightbulb, CalendarDays, ChevronDown, Info } from "lucide-react";

const WHATS_NEW_KEY = "wcg-whats-new-dismissed-v1";
const FIXTURES_CACHE_KEY = "wcg-fixtures-cache-v1";
const TEAM_FORMS_CACHE_KEY = "wcg-team-forms-cache-v1";

// Returns a stable key that changes once per day at 09:00 Europe/London.
function fixturesCacheKey(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const h = parseInt(get("hour"), 10);
  // Before 9am UK, the cache day is still the previous calendar day.
  if (h < 9) {
    const prev = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    prev.setUTCDate(prev.getUTCDate() - 1);
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
  }
  return `${y}-${m}-${d}`;
}

function readFixturesCache(): Fixture[] | null {
  try {
    const raw = localStorage.getItem(FIXTURES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key: string; data: Fixture[] };
    if (parsed.key !== fixturesCacheKey()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeFixturesCache(data: Fixture[]) {
  try {
    localStorage.setItem(
      FIXTURES_CACHE_KEY,
      JSON.stringify({ key: fixturesCacheKey(), data }),
    );
  } catch {
    // ignore
  }
}

function readTeamFormsCache(): Record<string, FormMatch[]> | null {
  try {
    const raw = localStorage.getItem(TEAM_FORMS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key: string; data: Record<string, FormMatch[]> };
    if (parsed.key !== fixturesCacheKey()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeTeamFormsCache(data: Record<string, FormMatch[]>) {
  try {
    localStorage.setItem(
      TEAM_FORMS_CACHE_KEY,
      JSON.stringify({ key: fixturesCacheKey(), data }),
    );
  } catch {
    // ignore
  }
}

function hasDismissedWhatsNew() {
  try {
    return localStorage.getItem(WHATS_NEW_KEY) === "1";
  } catch {
    return false;
  }
}

function markWhatsNewDismissed() {
  try {
    localStorage.setItem(WHATS_NEW_KEY, "1");
  } catch {
    // ignore
  }
}

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
  const [whatsNewOpen, setWhatsNewOpen] = useState(!hasDismissedWhatsNew());
  const fetchAllForms = useServerFn(getAllTeamForms);

  const dismissWhatsNew = () => {
    markWhatsNewDismissed();
    setWhatsNewOpen(false);
  };

  const fixturesQ = useQuery({
    queryKey: ["fixtures", fixturesCacheKey()],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const cached = readFixturesCache();
      if (cached) return cached;
      const { data, error } = await supabase
        .from("fixtures")
        .select("*")
        .order("kickoff_at", { ascending: true })
        .order("match_number", { ascending: true });
      if (error) throw error;
      writeFixturesCache(data as Fixture[]);
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

  const formsQ = useQuery({
    queryKey: ["team-forms", fixturesCacheKey()],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const cached = readTeamFormsCache();
      if (cached) return cached;
      const data = await fetchAllForms();
      writeTeamFormsCache(data);
      return data;
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
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          Fixtures
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Enter your predictions below</p>
        <Collapsible className="mt-2">
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-ink">
            <Info className="h-3 w-3 text-muted-foreground" />
            Game Rules
            <ChevronDown className="h-3 w-3" />
          </CollapsibleTrigger>
          <CollapsibleContent className="text-xs text-muted-foreground mt-1 space-y-1">
            <p>
              <span className="font-bold text-success">40 pts</span> exact score ·{" "}
              <span className="font-bold text-warning">10 pts</span> correct result · predictions lock at kickoff
            </p>
            <p>Knockout scores are based on the 90-minute result (extra time and penalties do not count).</p>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap mb-4">
          {TABS.map((s) => (
            <TabsTrigger key={s} value={s} className="flex-1">
              {s}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
                  homeForm={formsQ.data?.[f.team_home] ?? []}
                  awayForm={formsQ.data?.[f.team_away] ?? []}
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

      <Dialog open={whatsNewOpen} onOpenChange={(open) => { if (!open) dismissWhatsNew(); }}>
        <DialogContent className="sm:max-w-md bg-white/70 backdrop-blur-xl border-white/40 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-ink">
              <Lightbulb className="h-5 w-5 text-warning" />
              What's new?
            </DialogTitle>
            <DialogDescription className="text-ink/80 pt-2 space-y-2">
              <p>We've added form to each of the fixture cards.</p>
              <p>You can click on any of the win, draw or loss icons to see more details too!</p>
              <p>Happy predicting 🔮</p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-2">
            <button
              onClick={dismissWhatsNew}
              className="text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Got it
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}