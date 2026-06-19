import { useEffect, useState } from "react";
import { db as supabase } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Lock, ChevronDown, Radio, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { flagFor } from "@/lib/flags";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FormMatch } from "@/lib/team-form.functions";

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
  highlights_url?: string | null;
  live_home_score?: number | null;
  live_away_score?: number | null;
  live_status_label?: string | null;
  live_updated_at?: string | null;
};

export type Prediction = {
  id: string;
  fixture_id: string;
  home_score: number;
  away_score: number;
  locked_at?: string | null;
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

function formatMatchDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function displayLiveLabel(label: string | null, updatedAt: string | null | undefined, now: number) {
  if (!label) return null;
  const match = label.trim().match(/^(\d+)'(?:\+(\d+)')?$/);
  if (!match || !updatedAt) return label;

  const updated = new Date(updatedAt).getTime();
  if (!Number.isFinite(updated)) return label;

  const base = Number(match[1]);
  const extra = match[2] ? Number(match[2]) : 0;
  const elapsed = Math.max(0, Math.floor((now - updated) / 60000));
  const total = Math.min(base + extra + elapsed, 130);

  if (match[2]) return `${base}'+${Math.max(0, total - base)}'`;
  if (total > 90) return `90'+${total - 90}'`;
  return `${total}'`;
}

function FormBadge({ match }: { match: FormMatch }) {
  const [open, setOpen] = useState(false);
  const cls =
    match.result === "W"
      ? "bg-emerald-100 text-emerald-700"
      : match.result === "D"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";
  const openCls = open ? " outline-2 outline-offset-[-2px] outline-ring" : "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-sm ${cls}${openCls} focus:outline-none focus:ring-2 focus:ring-ring`}
          aria-label={`${match.result} vs ${match.opponent} ${match.scoreFor}-${match.scoreAgainst}`}
        >
          {match.result}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 text-xs" align="center">
        <div className="font-semibold text-ink mb-1 inline-flex items-center gap-1">
          <span>vs {match.opponent}</span>
          {flagFor(match.opponent) && (
            <span className="text-base leading-none" aria-hidden>{flagFor(match.opponent)}</span>
          )}
        </div>
        <div className="text-base font-extrabold tabular-nums mb-1">
          {match.scoreFor}-{match.scoreAgainst}
        </div>
        <div className="text-muted-foreground">{match.competition}</div>
        <div className="text-muted-foreground">{formatMatchDate(match.date)}</div>
      </PopoverContent>
    </Popover>
  );
}

function FormRow({ matches }: { matches: FormMatch[] }) {
  if (matches.length === 0) return <div className="h-5" />;
  // Render oldest -> newest (left to right)
  const ordered = [...matches].reverse();
  return (
    <div className="flex items-center gap-0.5">
      {ordered.map((m, i) => (
        <FormBadge key={i} match={m} />
      ))}
    </div>
  );
}

export function FixtureCard({
  fixture,
  prediction,
  userId,
  homeForm,
  awayForm,
  avatarUrl,
}: {
  fixture: Fixture;
  prediction: Prediction | null;
  userId: string;
  homeForm: FormMatch[];
  awayForm: FormMatch[];
  avatarUrl?: string | null;
}) {
  const queryClient = useQueryClient();
  const [home, setHome] = useState<string>(prediction ? String(prediction.home_score) : "");
  const [away, setAway] = useState<string>(prediction ? String(prediction.away_score) : "");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (prediction) {
      setHome(String(prediction.home_score));
      setAway(String(prediction.away_score));
    }
  }, [prediction?.id, prediction?.home_score, prediction?.away_score]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const locked = new Date(fixture.kickoff_at).getTime() <= now;
  const hasResult = fixture.home_score !== null && fixture.away_score !== null;
  const isLive =
    !hasResult &&
    locked &&
    (fixture.live_home_score !== null && fixture.live_home_score !== undefined &&
     fixture.live_away_score !== null && fixture.live_away_score !== undefined);
  const liveLabel = displayLiveLabel(fixture.live_status_label ?? null, fixture.live_updated_at, now);
  const userLocked = Boolean(prediction?.locked_at);
  const editable = !locked && !userLocked;
  const canSeeOthers = locked || userLocked;
  const pts = prediction ? pointsFor(prediction, fixture) : null;
  const showStatusRow = !locked || !hasResult || Boolean(prediction);
  const isSaved = Boolean(prediction) && home === String(prediction!.home_score) && away === String(prediction!.away_score);

  type PredRow = { name: string; home: number; away: number; userId: string; locked: boolean };
  const allPredsQ = useQuery<PredRow[]>({
    queryKey: ["fixture-predictions", fixture.id],
    enabled: open && canSeeOthers,
    queryFn: async () => {
      const { data: preds, error } = await supabase
        .from("predictions")
        .select("user_id, home_score, away_score, locked_at")
        .eq("fixture_id", fixture.id);
      if (error) throw error;
      const predRows = (preds ?? []) as Array<{ user_id: string; home_score: number; away_score: number; locked_at: string | null }>;
      const ids = Array.from(new Set(predRows.map((p) => p.user_id)));
      if (ids.length === 0) return [] as Array<{ name: string; home: number; away: number; userId: string; locked: boolean }>;
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
          locked: !!p.locked_at,
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

  async function lockIn() {
    if (!prediction) {
      toast.error("Submit a prediction first");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("predictions")
      .update({ locked_at: new Date().toISOString() })
      .eq("id", prediction.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Prediction locked");
    queryClient.invalidateQueries({ queryKey: ["predictions", userId] });
  }

  return (
    <div
      className={
        "bg-card rounded-md overflow-hidden flex flex-col h-full " +
        (isLive
          ? "border-2 border-destructive"
          : "border border-border")
      }
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface text-xs text-muted-foreground border-b border-border">
        <span className="font-semibold">
          {fixture.group_name ? "Group stage" : fixture.stage}
        </span>
        <span className="font-semibold">Match {fixture.match_number}/104</span>
        <span>{kickoffLabel(fixture.kickoff_at)}</span>
      </div>
      {(() => {
        const hm = homeForm;
        const am = awayForm;
        if (hm.length === 0 && am.length === 0) return null;
        return (
          <div className="flex items-center justify-between px-3 py-1 bg-surface/50 border-b border-border">
            <FormRow matches={hm} />
            <FormRow matches={am} />
          </div>
        );
      })()}

      <div className="p-3 flex-1 flex flex-col">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 flex-1">
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
              value={
                hasResult
                  ? (fixture.home_score as number)
                  : isLive
                    ? (fixture.live_home_score as number)
                    : !editable
                    ? (prediction ? prediction.home_score : "—")
                    : home
              }
              onChange={(e) => setHome(e.target.value)}
              disabled={!editable}
              placeholder="-"
              className={
                "w-10 h-10 text-center font-extrabold text-lg border rounded-sm leading-10 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-100 " +
                (hasResult || isLive
                  ? "bg-ink text-background border-ink"
                  : "bg-background border-input disabled:bg-muted disabled:text-ink")
              }
              aria-label={`${fixture.team_home} predicted score`}
            />
            <span className="text-muted-foreground font-bold">v</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              value={
                hasResult
                  ? (fixture.away_score as number)
                  : isLive
                    ? (fixture.live_away_score as number)
                    : !editable
                    ? (prediction ? prediction.away_score : "—")
                    : away
              }
              onChange={(e) => setAway(e.target.value)}
              disabled={!editable}
              placeholder="-"
              className={
                "w-10 h-10 text-center font-extrabold text-lg border rounded-sm leading-10 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-100 " +
                (hasResult || isLive
                  ? "bg-ink text-background border-ink"
                  : "bg-background border-input disabled:bg-muted disabled:text-ink")
              }
              aria-label={`${fixture.team_away} predicted score`}
            />
          </div>
          <div className="flex items-center justify-start gap-1.5 font-bold text-ink truncate text-sm sm:text-base">
            <span className="text-lg leading-none shrink-0" aria-hidden>{flagFor(fixture.team_away)}</span>
            <span className="truncate">{fixture.team_away}</span>
          </div>
        </div>

        {showStatusRow && (
          <div className="mt-3 flex items-center justify-between gap-2 min-h-[2rem]">
            {!locked ? (
              <>
                {prediction ? (
                  <label className={"inline-flex items-center gap-1.5 text-xs font-semibold " + (userLocked ? "text-muted-foreground" : "text-muted-foreground")}>
                    <Lock className="h-3 w-3" />
                    <span>{userLocked ? "Locked" : "Lock"}</span>
                    <Switch
                      checked={userLocked}
                      disabled={userLocked || busy}
                      onCheckedChange={(v) => { if (v) lockIn(); }}
                      className={userLocked ? "data-[state=checked]:bg-muted data-[state=checked]:border-muted" : ""}
                      aria-label="Lock prediction"
                    />
                  </label>
                ) : (
                  <span className="text-xs text-muted-foreground">Enter your prediction</span>
                )}
                {!userLocked && (
                  <div className="flex items-center gap-2">
                    {isSaved ? (
                      <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600 font-semibold">
                        <Check className="h-3 w-3" /> Saved
                      </span>
                    ) : (
                      <Button size="sm" onClick={submit} disabled={busy} className="font-bold h-8">
                        {prediction ? "Update" : "Submit"}
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {!hasResult && !isLive && (
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    <span>Locked</span>
                    <Switch
                      checked={true}
                      disabled={true}
                      className="data-[state=checked]:bg-muted data-[state=checked]:border-muted"
                      aria-label="Lock prediction"
                    />
                  </label>
                )}
                {!hasResult && isLive && avatarUrl && (
                  <img
                    src={avatarUrl}
                    alt="Your avatar"
                    className="h-6 w-6 rounded-full object-cover border border-border"
                  />
                )}
                {hasResult ? (
                  <span className="text-xs font-semibold inline-flex items-center gap-2">
                    {prediction && (
                      <span className="text-muted-foreground">
                        Your pick <span className="text-ink font-extrabold">{prediction.home_score}-{prediction.away_score}</span>
                      </span>
                    )}
                    {prediction && pts !== null && (
                      <span
                        className={
                          "px-1.5 py-0.5 rounded-sm " +
                          (pts === 40 ? "bg-success text-primary-foreground" : pts === 10 ? "bg-warning text-white" : "bg-muted text-gray-700")
                        }
                      >
                        +{pts} pts
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive font-semibold">
                    <Radio className="h-3 w-3" />
                    <span>Live{liveLabel ? ` · ${liveLabel}` : ""}</span>
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {hasResult && fixture.highlights_url && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">Highlights</div>
            <div className="relative w-full overflow-hidden rounded-sm bg-black" style={{ paddingTop: "56.25%" }}>
              <iframe
                src={fixture.highlights_url}
                title={`${fixture.team_home} v ${fixture.team_away} highlights`}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>
          </div>
        )}

        <Collapsible open={open} onOpenChange={setOpen} className="mt-2 border-t border-border -mx-3 -mb-3">
          <CollapsibleTrigger
            disabled={!canSeeOthers}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{canSeeOthers ? "See the predictions" : "Lock in your predictions early & see the others"}</span>
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
                {[...allPredsQ.data]
                  .map((row) => ({
                    row,
                    pts: hasResult
                      ? pointsFor({ id: "", fixture_id: fixture.id, home_score: row.home, away_score: row.away }, fixture)
                      : null,
                  }))
                  .sort((a, b) => {
                    if (hasResult) {
                      const ap = a.pts ?? 0;
                      const bp = b.pts ?? 0;
                      if (ap !== bp) return bp - ap;
                    }
                    return a.row.name.localeCompare(b.row.name);
                  })
                  .map(({ row, pts: rowPts }) => {
                    const bg =
                      rowPts === 40
                        ? "bg-amber-200/70"
                        : rowPts === 10
                          ? "bg-slate-200/70"
                          : "";
                    return (
                      <li
                        key={row.userId}
                        className={"flex items-center justify-between py-1.5 px-2 -mx-2 text-sm rounded-sm " + bg}
                      >
                        <span className="truncate text-ink inline-flex items-center gap-1">{row.name}{row.userId === userId ? " (you)" : ""}{(locked || row.locked) ? <Lock className="h-3 w-3 text-muted-foreground" /> : null}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="font-bold tabular-nums">{row.home}-{row.away}</span>
                          {rowPts !== null && (
                            <span
                              className={
                                "text-[10px] font-bold px-1.5 py-0.5 rounded-sm " +
                                (rowPts === 40 ? "bg-success text-primary-foreground" : rowPts === 10 ? "bg-warning text-white" : "bg-muted text-gray-700")
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