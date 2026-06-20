import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { FixtureCard, type Fixture, type Prediction } from "@/components/FixtureCard";
import type { FormMatch } from "@/lib/team-form.functions";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Lightbulb, CalendarDays, Info } from "lucide-react";
import { PillNav, type PillNavItem } from "@/components/PillNav";

const WHATS_NEW_KEY = "wcg-whats-new-dismissed-v2-lock";

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

// Group fixtures by New York calendar date (handles DST automatically).
function nyDayKey(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function FixturesPage() {
  const { user } = useAuth();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [whatsNewOpen, setWhatsNewOpen] = useState(!hasDismissedWhatsNew());
  const [rulesOpen, setRulesOpen] = useState(false);

  const dismissWhatsNew = () => {
    markWhatsNewDismissed();
    setWhatsNewOpen(false);
  };

  const fixturesQ = useQuery({
    queryKey: ["fixtures"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fixtures")
        .select("*")
        .order("kickoff_at", { ascending: true })
        .order("match_number", { ascending: true });
      if (error) throw error;
      return data as Fixture[];
    },
    // Tick more often while any match is live so live scores update on screen
    // without forcing a manual refresh. The query stays idle otherwise.
    refetchInterval: (q) => {
      const data = q.state.data as Fixture[] | undefined;
      if (!data) return false;
      const now = Date.now();
      const anyLive = data.some((f) => {
        const ko = new Date(f.kickoff_at).getTime();
        const mins = (now - ko) / 60000;
        const hasResult = f.home_score !== null && f.away_score !== null;
        return !hasResult && mins >= 0 && mins <= 150;
      });
      return anyLive ? 30_000 : false;
    },
    refetchIntervalInBackground: false,
  });

  const predsQ = useQuery({
    queryKey: ["predictions", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, fixture_id, home_score, away_score, locked_at")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as Prediction[];
    },
  });

  const formQ = useQuery({
    queryKey: ["team-form-all"],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_form_cache")
        .select("team_name, matches");
      if (error) throw error;
      const map = new Map<string, FormMatch[]>();
      ((data ?? []) as Array<{ team_name: string; matches: FormMatch[] }>).forEach((r) =>
        map.set(r.team_name, r.matches ?? []),
      );
      return map;
    },
  });

  const predByFixture = useMemo(() => {
    const map = new Map<string, Prediction>();
    (predsQ.data ?? []).forEach((p) => map.set(p.fixture_id, p));
    return map;
  }, [predsQ.data]);

  const isLive = (f: Fixture) => {
    const ko = new Date(f.kickoff_at).getTime();
    const mins = (Date.now() - ko) / 60000;
    const hasResult = f.home_score !== null && f.away_score !== null;
    return !hasResult && mins >= 0 && mins <= 150;
  };

  const isUpcoming = (f: Fixture) => {
    const ko = new Date(f.kickoff_at).getTime();
    return Date.now() < ko;
  };

  const isCompleted = (f: Fixture) => {
    return f.home_score !== null && f.away_score !== null;
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Fixture[]>();
    (fixturesQ.data ?? []).forEach((f) => {
      const k = nyDayKey(f.kickoff_at);
      const arr = map.get(k) ?? [];
      arr.push(f);
      map.set(k, arr);
    });
    // Sort live games to the top within each day.
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const la = isLive(a) ? 0 : 1;
        const lb = isLive(b) ? 0 : 1;
        if (la !== lb) return la - lb;
        return new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
      });
    }
    return Array.from(map.entries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixturesQ.data]);

  const dayItems: PillNavItem[] = useMemo(
    () =>
      grouped.map(([k], i) => ({
        id: k,
        top: "Match",
        bottom: String(i + 1),
      })),
    [grouped],
  );

  // Default selected day: day of any live game, otherwise today, otherwise the first available day.
  const defaultDayId = useMemo(() => {
    if (grouped.length === 0) return null;
    const liveDay = grouped.find(([, arr]) => arr.some(isLive))?.[0];
    if (liveDay) return liveDay;
    const todayKey = nyDayKey(new Date().toISOString());
    return grouped.find(([k]) => k === todayKey)?.[0] ?? grouped[0][0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped]);

  const activeDay = selectedDay && dayItems.some((d) => d.id === selectedDay)
    ? selectedDay
    : defaultDayId;

  const visibleGroups = useMemo(
    () => (activeDay ? grouped.filter(([k]) => k === activeDay) : []),
    [grouped, activeDay],
  );

  if (!user) return null;

  return (
    <main className="max-w-3xl mx-auto px-4 py-4 sm:py-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Fixtures
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Enter your predictions below</p>
        </div>
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-ink rounded-full hover:bg-muted px-2 py-1.5 transition-colors shrink-0 mt-0.5"
          aria-label="Game rules"
        >
          <Info className="h-4 w-4" />
          <span>Rules</span>
        </button>
      </div>

      {dayItems.length > 0 && (
        <div className="mb-4">
          <PillNav
            items={dayItems}
            value={activeDay ?? ""}
            onChange={setSelectedDay}
            ariaLabel="Filter fixtures by day"
          />
        </div>
      )}

      {(fixturesQ.isLoading || (!!user && predsQ.isLoading)) && (
        <p className="text-sm text-muted-foreground">Loading fixtures…</p>
      )}
      {fixturesQ.error && <p className="text-sm text-destructive">Failed to load fixtures.</p>}

      {!fixturesQ.isLoading && !predsQ.isLoading && (
        <div className="space-y-6">
          {visibleGroups.map(([k, fixtures]) => {
            const live = fixtures.filter(isLive);
            const upcoming = fixtures.filter(isUpcoming);
            const completed = fixtures.filter(isCompleted);

            return (
              <section key={k} className="space-y-4">
                {live.length > 0 && (
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-destructive mb-2">Live</h2>
                    <div className="space-y-2">
                      {live.map((f) => (
                        <FixtureCard
                          key={f.id}
                          fixture={f}
                          prediction={predByFixture.get(f.id) ?? null}
                          userId={user.id}
                          avatarUrl={user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null}
                          homeForm={formQ.data?.get(f.team_home) ?? []}
                          awayForm={formQ.data?.get(f.team_away) ?? []}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {upcoming.length > 0 && (
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Upcoming</h2>
                    <div className="space-y-2">
                      {upcoming.map((f) => (
                        <FixtureCard
                          key={f.id}
                          fixture={f}
                          prediction={predByFixture.get(f.id) ?? null}
                          userId={user.id}
                          avatarUrl={user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null}
                          homeForm={formQ.data?.get(f.team_home) ?? []}
                          awayForm={formQ.data?.get(f.team_away) ?? []}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {completed.length > 0 && (
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Completed</h2>
                    <div className="space-y-2">
                      {completed.map((f) => (
                        <FixtureCard
                          key={f.id}
                          fixture={f}
                          prediction={predByFixture.get(f.id) ?? null}
                          userId={user.id}
                          avatarUrl={user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null}
                          homeForm={formQ.data?.get(f.team_home) ?? []}
                          awayForm={formQ.data?.get(f.team_away) ?? []}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
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
              <span className="block">You can now lock in your predictions ahead of kickoff to see what everyone else has predicted earlier.</span>
              <span className="block">Just toggle the lock switch on a fixture once you're happy with your score — once locked, it can't be changed.</span>
              <span className="block">Happy predicting 🔮</span>
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

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="sm:max-w-sm bg-white/70 backdrop-blur-xl border-white/40 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-ink">Game Rules</DialogTitle>
            <DialogDescription className="text-ink/80 pt-2 space-y-2">
              <span className="block">
                <span className="font-bold text-success">40 pts</span> exact score ·{" "}
                <span className="font-bold text-warning">10 pts</span> correct result · predictions lock at kickoff
              </span>
              <span className="block">Knockout scores are based on the 90-minute result (extra time and penalties do not count).</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-2">
            <button
              onClick={() => setRulesOpen(false)}
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