import { useEffect, useState } from "react";
import { db as supabase } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Lock, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { flagFor } from "@/lib/flags";

export type Fixture = {
  id: string;
  match_number: number;
  stage: string;
  group_name: string | null;
  team_home: string;
  team_away: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
};

export type Prediction = {
  id: string;
  fixture_id: string;
  home_score: number;
  away_score: number;
};

function pointsFor(p: Prediction, f: Fixture): number | null {
  if (f.home_score === null || f.away_score === null) return null;
  if (p.home_score === f.home_score && p.away_score === f.away_score) return 40;
  const pr = Math.sign(p.home_score - p.away_score);
  const ac = Math.sign(f.home_score - f.away_score);
  return pr === ac ? 10 : 0;
}

function kickoffLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function FixtureCard({
  fixture,
  prediction,
  userId,
}: {
  fixture: Fixture;
  prediction: Prediction | null;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [home, setHome] = useState<string>(prediction ? String(prediction.home_score) : "");
  const [away, setAway] = useState<string>(prediction ? String(prediction.away_score) : "");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const locked = new Date(fixture.kickoff_at).getTime() <= now;
  const hasResult = fixture.home_score !== null && fixture.away_score !== null;
  const pts = prediction ? pointsFor(prediction, fixture) : null;

  type PredRow = { name: string; home: number; away: number; userId: string };
  const allPredsQ = useQuery<PredRow[]>({
    queryKey: ["fixture-predictions", fixture.id],
    enabled: open && locked,
    queryFn: async () => {
      const { data: preds, error } = await supabase
        .from("predictions")
        .select("user_id, home_score, away_score")
        .eq("fixture_id", fixture.id);
      if (error) throw error;
      const predRows = (preds ?? []) as Array<{ user_id: string; home_score: number; away_score: number }>;
      const ids = Array.from(new Set(predRows.map((p) => p.user_id)));
      if (ids.length === 0) return [] as Array<{ name: string; home: number; away: number; userId: string }>;
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      if (pErr) throw pErr;
      const profileRows = (profiles ?? []) as Array<{ id: string; display_name: string }>;
      const nameById = new Map<string, string>();
      profileRows.forEach((pr) => nameById.set(pr.id, pr.display_name));
      return predRows
        .map((p) => ({
          userId: p.user_id,
          name: nameById.get(p.user_id) ?? "Player",
          home: p.home_score,
          away: p.away_score,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  async function submit() {
    const h = Number(home);
    const a = Number(away);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 30 || a > 30) {
      toast.error("Enter valid scores (0–30)");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("predictions")
      .upsert(
        { user_id: userId, fixture_id: fixture.id, home_score: h, away_score: a },
        { onConflict: "user_id,fixture_id" },
      );
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Prediction saved");
    queryClient.invalidateQueries({ queryKey: ["predictions", userId] });
  }

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface text-xs text-muted-foreground border-b border-border">
        <span className="font-semibold">
          {fixture.group_name ? `Group ${fixture.group_name}` : fixture.stage}
        </span>
        <span>{kickoffLabel(fixture.kickoff_at)}</span>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center justify-end gap-1.5 font-bold text-ink truncate text-sm sm:text-base">
            <span className="truncate">{fixture.team_home}</span>
            <span className="text-lg leading-none shrink-0" aria-hidden>{flagFor(fixture.team_home)}</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              value={locked ? (prediction ? prediction.home_score : "—") : home}
              onChange={(e) => setHome(e.target.value)}
              disabled={locked}
              placeholder="-"
              className="w-10 h-10 text-center font-extrabold text-lg border border-input rounded-sm bg-background disabled:bg-muted disabled:text-ink disabled:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={`${fixture.team_home} predicted score`}
            />
            <span className="text-muted-foreground font-bold">v</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              value={locked ? (prediction ? prediction.away_score : "—") : away}
              onChange={(e) => setAway(e.target.value)}
              disabled={locked}
              placeholder="-"
              className="w-10 h-10 text-center font-extrabold text-lg border border-input rounded-sm bg-background disabled:bg-muted disabled:text-ink disabled:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={`${fixture.team_away} predicted score`}
            />
          </div>
          <div className="flex items-center justify-start gap-1.5 font-bold text-ink truncate text-sm sm:text-base">
            <span className="text-lg leading-none shrink-0" aria-hidden>{flagFor(fixture.team_away)}</span>
            <span className="truncate">{fixture.team_away}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 min-h-[2rem]">
          {!locked ? (
            <>
              <span className="text-xs text-muted-foreground">
                {prediction ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <Check className="h-3 w-3" /> Saved – update before kickoff
                  </span>
                ) : (
                  "Enter your prediction"
                )}
              </span>
              <Button size="sm" onClick={submit} disabled={busy} className="font-bold h-8">
                {prediction ? "Update" : "Submit"}
              </Button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> Locked
              </span>
              {hasResult ? (
                <span className="text-xs font-semibold">
                  Result <span className="text-ink font-extrabold">{fixture.home_score}-{fixture.away_score}</span>
                  {prediction && pts !== null && (
                    <span
                      className={
                        "ml-2 px-1.5 py-0.5 rounded-sm text-primary-foreground " +
                        (pts === 40 ? "bg-success" : pts === 10 ? "bg-warning text-ink" : "bg-muted text-muted-foreground")
                      }
                    >
                      +{pts} pts
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Awaiting result</span>
              )}
            </>
          )}
        </div>

        <Collapsible open={open} onOpenChange={setOpen} className="mt-2 border-t border-border -mx-3 -mb-3">
          <CollapsibleTrigger
            disabled={!locked}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{locked ? "See the predictions" : "Predictions visible after kickoff"}</span>
            <ChevronDown className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3">
            {allPredsQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
            {allPredsQ.error && <p className="text-xs text-destructive">Failed to load predictions.</p>}
            {allPredsQ.data && allPredsQ.data.length === 0 && (
              <p className="text-xs text-muted-foreground">No one predicted this match.</p>
            )}
            {allPredsQ.data && allPredsQ.data.length > 0 && (
              <ul className="divide-y divide-border">
                {allPredsQ.data.map((row) => {
                  const rowPts = hasResult ? pointsFor({ id: "", fixture_id: fixture.id, home_score: row.home, away_score: row.away }, fixture) : null;
                  return (
                    <li key={row.userId} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="truncate text-ink">{row.name}{row.userId === userId ? " (you)" : ""}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="font-bold tabular-nums">{row.home}-{row.away}</span>
                        {rowPts !== null && (
                          <span
                            className={
                              "text-[10px] font-bold px-1.5 py-0.5 rounded-sm " +
                              (rowPts === 40 ? "bg-success text-primary-foreground" : rowPts === 10 ? "bg-warning text-ink" : "bg-muted text-muted-foreground")
                            }
                          >
                            +{rowPts}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}