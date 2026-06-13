import { useEffect, useState } from "react";
import { db as supabase } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Lock, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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
  if (p.home_score === f.home_score && p.away_score === f.away_score) return 3;
  const pr = Math.sign(p.home_score - p.away_score);
  const ac = Math.sign(f.home_score - f.away_score);
  return pr === ac ? 1 : 0;
}

function kickoffLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function FixtureCard({
  fixture,
  prediction,
  playerId,
}: {
  fixture: Fixture;
  prediction: Prediction | null;
  playerId: string;
}) {
  const queryClient = useQueryClient();
  const [home, setHome] = useState<string>(prediction ? String(prediction.home_score) : "");
  const [away, setAway] = useState<string>(prediction ? String(prediction.away_score) : "");
  const [busy, setBusy] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const locked = new Date(fixture.kickoff_at).getTime() <= now;
  const hasResult = fixture.home_score !== null && fixture.away_score !== null;
  const pts = prediction ? pointsFor(prediction, fixture) : null;

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
        { player_id: playerId, fixture_id: fixture.id, home_score: h, away_score: a },
        { onConflict: "player_id,fixture_id" },
      );
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Prediction saved");
    queryClient.invalidateQueries({ queryKey: ["predictions", playerId] });
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
          <div className="text-right font-bold text-ink truncate text-sm sm:text-base">
            {fixture.team_home}
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
          <div className="text-left font-bold text-ink truncate text-sm sm:text-base">
            {fixture.team_away}
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
                        (pts === 3 ? "bg-success" : pts === 1 ? "bg-warning text-ink" : "bg-muted text-muted-foreground")
                      }
                    >
                      +{pts} pt{pts === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Awaiting result</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}