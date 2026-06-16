import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { FixtureCard, type Fixture, type Prediction } from "@/components/FixtureCard";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTeamFormBatch, type FormMatch } from "@/lib/team-form.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Lightbulb, CalendarDays, ChevronDown, Info } from "lucide-react";

const WHATS_NEW_KEY = "wcg-whats-new-dismissed-v1";

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
  const activeTabValue = tab.toLowerCase();
  const [whatsNewOpen, setWhatsNewOpen] = useState(!hasDismissedWhatsNew());

  const dismissWhatsNew = () => {
    markWhatsNewDismissed();
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

  const teamNames = useMemo(() => {
    const set = new Set<string>();
    (fixturesQ.data ?? []).forEach((f) => {
      set.add(f.team_home);
      set.add(f.team_away);
    });
    return Array.from(set).sort();
  }, [fixturesQ.data]);

  const fetchFormBatch = useServerFn(getTeamFormBatch);
  const formsQ = useQuery({
    queryKey: ["team-form-batch", teamNames],
    enabled: teamNames.length > 0,
    queryFn: () => fetchFormBatch({ data: { teamNames } }),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
  const formsByTeam: Record<string, FormMatch[]> = formsQ.data ?? {};

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

      <Tabs value={activeTabValue} onValueChange={(v) => setTab(v === "upcoming" ? "Upcoming" : "Completed")}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap mb-4">
          <TabsTrigger value="upcoming" className="flex-1">Upcoming</TabsTrigger>
          <TabsTrigger value="completed" className="flex-1">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          <FixtureList
            grouped={grouped}
            fixturesQ={fixturesQ}
            predByFixture={predByFixture}
            user={user}
            formsByTeam={formsByTeam}
            tab={tab}
          />
        </TabsContent>

        <TabsContent value="completed">
          <FixtureList
            grouped={grouped}
            fixturesQ={fixturesQ}
            predByFixture={predByFixture}
            user={user}
            formsByTeam={formsByTeam}
            tab={tab}
          />
        </TabsContent>
      </Tabs>

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