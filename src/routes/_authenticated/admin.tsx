import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  updateFixtureScore,
  setUserLeaderboardVisibility,
  deleteUser,
  upsertPredictionForUser,
  setPredictionLock,
  updateFixtureOdds,
} from "@/lib/admin-fixtures.functions";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { flagFor } from "@/lib/flags";
import { Shield, Download, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "Admin – All Predictions" }],
  }),
  component: AdminPage,
});

type Row = {
  id: string;
  user_id: string;
  fixture_id: string;
  home_score: number;
  away_score: number;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
};
type Fixture = {
  id: string;
  match_number: number;
  stage: string;
  team_home: string;
  team_away: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  winning_odds: number | null;
};
type Profile = { id: string; display_name: string; created_at?: string; show_on_leaderboard?: boolean; last_visit_at?: string | null };

function AdminPage() {
  const { user, ready } = useAuth();
  const [tab, setTab] = useState<"users" | "fixtures" | "predictions" | "history">("users");
  const qc = useQueryClient();
  const updateScoreFn = useServerFn(updateFixtureScore);
  const setVisibilityFn = useServerFn(setUserLeaderboardVisibility);
  const deleteUserFn = useServerFn(deleteUser);
  const upsertPredFn = useServerFn(upsertPredictionForUser);
  const setLockFn = useServerFn(setPredictionLock);
  const updateOddsFn = useServerFn(updateFixtureOdds);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHome, setEditHome] = useState<string>("");
  const [editAway, setEditAway] = useState<string>("");
  const [editingOddsId, setEditingOddsId] = useState<string | null>(null);
  const [editOdds, setEditOdds] = useState<string>("");
  const [addUserId, setAddUserId] = useState<string>("");
  const [addFixtureId, setAddFixtureId] = useState<string>("");
  const [addHome, setAddHome] = useState<string>("");
  const [addAway, setAddAway] = useState<string>("");
  const [editPredKey, setEditPredKey] = useState<string | null>(null);
  const [editPredHome, setEditPredHome] = useState<string>("");
  const [editPredAway, setEditPredAway] = useState<string>("");

  const updateMut = useMutation({
    mutationFn: (vars: { fixtureId: string; homeScore: number | null; awayScore: number | null }) =>
      updateScoreFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fixtures-admin"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      qc.invalidateQueries({ queryKey: ["fixtures"] });
      setEditingId(null);
    },
  });

  const visibilityMut = useMutation({
    mutationFn: (vars: { userId: string; show: boolean }) =>
      setVisibilityFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (vars: { userId: string }) => deleteUserFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users-admin"] });
      qc.invalidateQueries({ queryKey: ["profiles-admin"] });
      qc.invalidateQueries({ queryKey: ["all-predictions"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });

  const upsertPredMut = useMutation({
    mutationFn: (vars: {
      userId: string;
      fixtureId: string;
      homeScore: number;
      awayScore: number;
    }) => upsertPredFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-predictions"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      setEditPredKey(null);
      setAddHome("");
      setAddAway("");
    },
  });

  const lockMut = useMutation({
    mutationFn: (vars: { predictionId: string; locked: boolean }) =>
      setLockFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-predictions"] });
    },
  });

  const oddsMut = useMutation({
    mutationFn: (vars: { fixtureId: string; winningOdds: number | null }) =>
      updateOddsFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fixtures-admin"] });
      qc.invalidateQueries({ queryKey: ["pnl-history"] });
      setEditingOddsId(null);
    },
  });

  const roleQ = useQuery({
    queryKey: ["my-role", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      return (data ?? []).map((r: { role: string }) => r.role);
    },
  });
  const isAdmin = (roleQ.data ?? []).includes("admin");

  const predsQ = useQuery({
    queryKey: ["all-predictions"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, user_id, fixture_id, home_score, away_score, created_at, updated_at, locked_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const fixturesQ = useQuery({
    queryKey: ["fixtures-admin"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("fixtures")
        .select("id, match_number, stage, team_home, team_away, kickoff_at, home_score, away_score, winning_odds");
      return (data ?? []) as Fixture[];
    },
  });
  const profilesQ = useQuery({
    queryKey: ["profiles-admin"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, display_name");
      return (data ?? []) as Profile[];
    },
  });
  const usersQ = useQuery({
    queryKey: ["users-admin"],
    enabled: isAdmin && tab === "users",
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, created_at, show_on_leaderboard, last_visit_at")
        .order("created_at", { ascending: false });
      return (data ?? []) as Profile[];
    },
  });

  const historyQ = useQuery({
    queryKey: ["prediction-edits"],
    enabled: isAdmin && tab === "history",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prediction_edits")
        .select(
          "id, user_id, fixture_id, editor_user_id, action, old_home, old_away, new_home, new_away, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        user_id: string;
        fixture_id: string;
        editor_user_id: string;
        action: "insert" | "update";
        old_home: number | null;
        old_away: number | null;
        new_home: number;
        new_away: number;
        created_at: string;
      }>;
    },
  });

  if (!ready) return null;
  if (!user) return null;
  if (roleQ.isLoading)
    return <main className="max-w-3xl mx-auto px-4 py-6 text-sm text-muted-foreground">Checking access…</main>;
  if (!isAdmin)
    return (
      <main className="max-w-3xl mx-auto px-4 py-10 text-center">
        <h1 className="text-xl font-extrabold text-ink mb-2">Admins only</h1>
        <p className="text-sm text-muted-foreground">You do not have access to this page.</p>
      </main>
    );

  const fixtureMap = new Map((fixturesQ.data ?? []).map((f) => [f.id, f]));
  const profileMap = new Map((profilesQ.data ?? []).map((p) => [p.id, p]));
  const rows = (predsQ.data ?? [])
    .map((r) => ({
      r,
      f: fixtureMap.get(r.fixture_id),
      name: profileMap.get(r.user_id)?.display_name ?? r.user_id.slice(0, 8),
    }))
    .sort((a, b) => {
      const ak = a.f ? new Date(a.f.kickoff_at).getTime() : 0;
      const bk = b.f ? new Date(b.f.kickoff_at).getTime() : 0;
      if (bk !== ak) return bk - ak;
      return a.name.localeCompare(b.name);
    });

  const now = Date.now();
  const allFixtures = (fixturesQ.data ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime(),
    );

  function downloadCsv() {
    const header = ["player", "match_number", "stage", "team_home", "team_away", "kickoff_at", "pred_home", "pred_away", "actual_home", "actual_away", "updated_at"];
    const lines = [header.join(",")];
    for (const { r, f, name } of rows) {
      const cells = [
        name,
        f?.match_number ?? "",
        f?.stage ?? "",
        f?.team_home ?? "",
        f?.team_away ?? "",
        f?.kickoff_at ?? "",
        r.home_score,
        r.away_score,
        f?.home_score ?? "",
        f?.away_score ?? "",
        r.updated_at,
      ].map((v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `predictions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-4 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary text-primary-foreground p-2 rounded-sm">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-none">
              Admin
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              All predictions across all players ({rows.length})
            </p>
          </div>
        </div>
        <button
          onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 bg-ink text-primary-foreground text-xs font-bold px-3 py-2 rounded-sm hover:opacity-90"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border">
        <button
          onClick={() => setTab("users")}
          className={
            "px-3 py-2 text-sm font-bold border-b-2 -mb-px " +
            (tab === "users"
              ? "border-primary text-ink"
              : "border-transparent text-muted-foreground hover:text-ink")
          }
        >
          Users
        </button>
        <button
          onClick={() => setTab("fixtures")}
          className={
            "px-3 py-2 text-sm font-bold border-b-2 -mb-px " +
            (tab === "fixtures"
              ? "border-primary text-ink"
              : "border-transparent text-muted-foreground hover:text-ink")
          }
        >
          Fixtures
        </button>
        <button
          onClick={() => setTab("predictions")}
          className={
            "px-3 py-2 text-sm font-bold border-b-2 -mb-px " +
            (tab === "predictions"
              ? "border-primary text-ink"
              : "border-transparent text-muted-foreground hover:text-ink")
          }
        >
          Predictions
        </button>
        <button
          onClick={() => setTab("history")}
          className={
            "px-3 py-2 text-sm font-bold border-b-2 -mb-px " +
            (tab === "history"
              ? "border-primary text-ink"
              : "border-transparent text-muted-foreground hover:text-ink")
          }
        >
          History
        </button>
      </div>

      {tab === "predictions" && (
      <>
      {predsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="bg-card border border-border rounded-md p-3 mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Add or overwrite a prediction
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
            className="text-sm border border-border rounded-sm px-2 py-1 bg-background"
          >
            <option value="">Player…</option>
            {(profilesQ.data ?? [])
              .slice()
              .sort((a, b) => a.display_name.localeCompare(b.display_name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
          </select>
          <select
            value={addFixtureId}
            onChange={(e) => setAddFixtureId(e.target.value)}
            className="text-sm border border-border rounded-sm px-2 py-1 bg-background max-w-[16rem]"
          >
            <option value="">Fixture…</option>
            {(fixturesQ.data ?? [])
              .slice()
              .sort(
                (a, b) =>
                  new Date(a.kickoff_at).getTime() -
                  new Date(b.kickoff_at).getTime(),
              )
              .map((f) => (
                <option key={f.id} value={f.id}>
                  #{f.match_number} {f.team_home} v {f.team_away}
                </option>
              ))}
          </select>
          <input
            type="number"
            min={0}
            placeholder="H"
            value={addHome}
            onChange={(e) => setAddHome(e.target.value)}
            className="w-14 text-right text-sm border border-border rounded-sm px-1 py-1 bg-background"
          />
          <span className="text-sm">–</span>
          <input
            type="number"
            min={0}
            placeholder="A"
            value={addAway}
            onChange={(e) => setAddAway(e.target.value)}
            className="w-14 text-right text-sm border border-border rounded-sm px-1 py-1 bg-background"
          />
          <button
            disabled={upsertPredMut.isPending}
            onClick={() => {
              const h = parseInt(addHome, 10);
              const a = parseInt(addAway, 10);
              if (
                !addUserId ||
                !addFixtureId ||
                !Number.isInteger(h) ||
                !Number.isInteger(a) ||
                h < 0 ||
                a < 0
              )
                return;
              upsertPredMut.mutate({
                userId: addUserId,
                fixtureId: addFixtureId,
                homeScore: h,
                awayScore: a,
              });
            }}
            className="text-xs font-bold bg-primary text-primary-foreground px-3 py-1.5 rounded-sm hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {upsertPredMut.isError && (
          <p className="mt-2 text-[11px] text-destructive">
            {(upsertPredMut.error as Error).message}
          </p>
        )}
      </div>

      <div className="bg-card border border-border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Player</th>
              <th className="text-left px-3 py-2">Match</th>
              <th className="text-right px-3 py-2">Pick</th>
              <th className="text-right px-3 py-2">Result</th>
              <th className="text-center px-3 py-2">Locked</th>
              <th className="text-right px-3 py-2 whitespace-nowrap">Updated</th>
              <th className="text-right px-3 py-2">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, f, name }) => {
              const hasResult = f && f.home_score !== null && f.away_score !== null;
              const key = r.id;
              const isEditing = editPredKey === key;
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-bold text-ink whitespace-nowrap">{name}</td>
                  <td className="px-3 py-2">
                    {f ? (
                      <span className="flex items-center gap-1">
                        <span>{flagFor(f.team_home)}</span>
                        <span className="text-muted-foreground">v</span>
                        <span>{flagFor(f.team_away)}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-bold whitespace-nowrap">
                    {isEditing ? (
                      <span className="inline-flex items-center gap-1 justify-end">
                        <input
                          type="number"
                          min={0}
                          value={editPredHome}
                          onChange={(e) => setEditPredHome(e.target.value)}
                          className="w-12 text-right border border-border rounded-sm px-1 py-0.5 bg-background"
                        />
                        <span>–</span>
                        <input
                          type="number"
                          min={0}
                          value={editPredAway}
                          onChange={(e) => setEditPredAway(e.target.value)}
                          className="w-12 text-right border border-border rounded-sm px-1 py-0.5 bg-background"
                        />
                      </span>
                    ) : (
                      <>
                        {r.home_score} – {r.away_score}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {hasResult ? `${f!.home_score} – ${f!.away_score}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {(() => {
                      const kickoffPassed = f
                        ? new Date(f.kickoff_at).getTime() <= now
                        : false;
                      const userLocked = !!r.locked_at;
                      if (kickoffPassed) {
                        return <span className="text-[11px] text-muted-foreground">—</span>;
                      }
                      if (!userLocked) {
                        return <span className="text-[11px] text-muted-foreground">—</span>;
                      }
                      const pending =
                        lockMut.isPending &&
                        lockMut.variables?.predictionId === r.id;
                      return (
                        <button
                          role="switch"
                          aria-checked={true}
                          disabled={pending}
                          onClick={() =>
                            lockMut.mutate({ predictionId: r.id, locked: false })
                          }
                          className={
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors bg-primary disabled:opacity-50"
                          }
                          title="Locked early by user – click to unlock"
                        >
                          <span
                            className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-4"
                          />
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(r.updated_at).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <span className="inline-flex gap-1 justify-end">
                        <button
                          disabled={upsertPredMut.isPending}
                          onClick={() => {
                            const h = parseInt(editPredHome, 10);
                            const a = parseInt(editPredAway, 10);
                            if (
                              !Number.isInteger(h) ||
                              !Number.isInteger(a) ||
                              h < 0 ||
                              a < 0
                            )
                              return;
                            upsertPredMut.mutate({
                              userId: r.user_id,
                              fixtureId: r.fixture_id,
                              homeScore: h,
                              awayScore: a,
                            });
                          }}
                          className="text-[11px] font-bold bg-primary text-primary-foreground px-2 py-1 rounded-sm hover:opacity-90 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          disabled={upsertPredMut.isPending}
                          onClick={() => setEditPredKey(null)}
                          className="text-[11px] font-bold border border-border px-2 py-1 rounded-sm hover:bg-surface"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setEditPredKey(key);
                          setEditPredHome(String(r.home_score));
                          setEditPredAway(String(r.away_score));
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold border border-border px-2 py-1 rounded-sm hover:bg-surface"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!predsQ.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                  No predictions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </>
      )}

      {tab === "users" && (
        <div className="bg-card border border-border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Display name</th>
                <th className="text-center px-3 py-2">Leaderboard</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">Last visit</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">Signed up</th>
                <th className="text-right px-3 py-2">Delete</th>
              </tr>
            </thead>
            <tbody>
              {(usersQ.data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2 font-bold text-ink">{p.display_name}</td>
                  <td className="px-3 py-2 text-center">
                    {(() => {
                      const on = p.show_on_leaderboard !== false;
                      const pending =
                        visibilityMut.isPending && visibilityMut.variables?.userId === p.id;
                      return (
                        <button
                          role="switch"
                          aria-checked={on}
                          disabled={pending}
                          onClick={() =>
                            visibilityMut.mutate({ userId: p.id, show: !on })
                          }
                          className={
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 " +
                            (on ? "bg-primary" : "bg-muted")
                          }
                          title={on ? "Visible on leaderboard" : "Hidden from leaderboard"}
                        >
                          <span
                            className={
                              "inline-block h-4 w-4 transform rounded-full bg-white transition-transform " +
                              (on ? "translate-x-4" : "translate-x-0.5")
                            }
                          />
                        </button>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-muted-foreground whitespace-nowrap">
                    {p.last_visit_at
                      ? new Date(p.last_visit_at).toLocaleString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-muted-foreground whitespace-nowrap">
                    {p.created_at
                      ? new Date(p.created_at).toLocaleString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.id === user.id ? (
                      <span className="text-[11px] text-muted-foreground">You</span>
                    ) : (
                      <button
                        disabled={deleteMut.isPending && deleteMut.variables?.userId === p.id}
                        onClick={() => {
                          if (
                            confirm(
                              `Delete ${p.display_name}? This permanently removes the account and all their predictions.`,
                            )
                          ) {
                            deleteMut.mutate({ userId: p.id });
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold border border-border text-destructive px-2 py-1 rounded-sm hover:bg-destructive hover:text-primary-foreground disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!usersQ.isLoading && (usersQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {deleteMut.isError && (
            <p className="px-3 py-2 text-[11px] text-destructive border-t border-border">
              {(deleteMut.error as Error).message}
            </p>
          )}
          {isAdmin && tab === "users" && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
              {(usersQ.data ?? []).length} total
            </p>
          )}
        </div>
      )}

      {tab === "fixtures" && (
        <div className="bg-card border border-border rounded-md overflow-x-auto">
          <p className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border">
            Every fixture. Scores are editable once kickoff has passed and
            override the automatic scraper. Odds are the correct-score decimal
            odds for the actual final scoreline and feed the leaderboard P&L
            chart — leave blank if you don't have odds for a game.
          </p>
          <table className="w-full text-sm">
            <thead className="bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Match</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">Kickoff</th>
                <th className="text-right px-3 py-2">Score</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">Odds</th>
                <th className="text-right px-3 py-2">Edit</th>
              </tr>
            </thead>
            <tbody>
              {allFixtures.map((f) => {
                const isEditing = editingId === f.id;
                const hasScore = f.home_score !== null && f.away_score !== null;
                const isPast = new Date(f.kickoff_at).getTime() <= now;
                const isEditingOdds = editingOddsId === f.id;
                return (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1">
                        <span>{flagFor(f.team_home)}</span>
                        <span>{f.team_home}</span>
                        <span className="text-muted-foreground">v</span>
                        <span>{f.team_away}</span>
                        <span>{flagFor(f.team_away)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(f.kickoff_at).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      {isEditing ? (
                        <span className="inline-flex items-center gap-1 justify-end">
                          <input
                            type="number"
                            min={0}
                            value={editHome}
                            onChange={(e) => setEditHome(e.target.value)}
                            className="w-12 text-right border border-border rounded-sm px-1 py-0.5 bg-background"
                          />
                          <span>–</span>
                          <input
                            type="number"
                            min={0}
                            value={editAway}
                            onChange={(e) => setEditAway(e.target.value)}
                            className="w-12 text-right border border-border rounded-sm px-1 py-0.5 bg-background"
                          />
                        </span>
                      ) : (
                        <>
                          {hasScore ? (
                            <>
                              {f.home_score} – {f.away_score}
                            </>
                          ) : (
                            <span className="text-muted-foreground font-normal">—</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-[11px] whitespace-nowrap">
                      {isEditingOdds ? (
                        <span className="inline-flex items-center gap-1 justify-end">
                          <input
                            type="number"
                            step="0.01"
                            min={1.01}
                            value={editOdds}
                            onChange={(e) => setEditOdds(e.target.value)}
                            className="w-16 text-right border border-border rounded-sm px-1 py-0.5 bg-background"
                            placeholder="1.00"
                          />
                          <button
                            disabled={oddsMut.isPending}
                            onClick={() => {
                              const raw = editOdds.trim();
                              const val = raw === "" ? null : Number(raw);
                              if (val !== null && (!Number.isFinite(val) || val <= 1)) return;
                              oddsMut.mutate({ fixtureId: f.id, winningOdds: val });
                            }}
                            className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-sm hover:opacity-90 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            disabled={oddsMut.isPending}
                            onClick={() => setEditingOddsId(null)}
                            className="text-[10px] font-bold border border-border px-1.5 py-0.5 rounded-sm hover:bg-surface"
                          >
                            ×
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingOddsId(f.id);
                            setEditOdds(f.winning_odds != null ? String(f.winning_odds) : "");
                          }}
                          className="font-bold text-foreground hover:text-primary"
                          title="Correct-score decimal odds for the actual final scoreline"
                        >
                          {f.winning_odds != null ? Number(f.winning_odds).toFixed(2) : "—"}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isEditing ? (
                        <span className="inline-flex gap-1 justify-end">
                          <button
                            disabled={updateMut.isPending}
                            onClick={() => {
                              const h = parseInt(editHome, 10);
                              const a = parseInt(editAway, 10);
                              if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) return;
                              updateMut.mutate({ fixtureId: f.id, homeScore: h, awayScore: a });
                            }}
                            className="text-[11px] font-bold bg-primary text-primary-foreground px-2 py-1 rounded-sm hover:opacity-90 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            disabled={updateMut.isPending}
                            onClick={() => setEditingId(null)}
                            className="text-[11px] font-bold border border-border px-2 py-1 rounded-sm hover:bg-surface"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : isPast ? (
                        <button
                          onClick={() => {
                            setEditingId(f.id);
                            setEditHome(String(f.home_score ?? ""));
                            setEditAway(String(f.away_score ?? ""));
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold border border-border px-2 py-1 rounded-sm hover:bg-surface"
                        >
                          <Pencil className="h-3 w-3" />
                          {hasScore ? "Edit" : "Add"}
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {allFixtures.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                    No fixtures yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {(updateMut.isError || oddsMut.isError) && (
            <p className="px-3 py-2 text-[11px] text-destructive border-t border-border">
              {((updateMut.error || oddsMut.error) as Error).message}
            </p>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="bg-card border border-border rounded-md overflow-x-auto">
          <p className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border">
            Every prediction added or edited from the admin panel. Most recent first.
          </p>
          {historyQ.isLoading && (
            <p className="px-3 py-3 text-sm text-muted-foreground">Loading…</p>
          )}
          <table className="w-full text-sm">
            <thead className="bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 whitespace-nowrap">When</th>
                <th className="text-left px-3 py-2">Editor</th>
                <th className="text-left px-3 py-2">Player</th>
                <th className="text-left px-3 py-2">Match</th>
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">Was</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">Now</th>
              </tr>
            </thead>
            <tbody>
              {(historyQ.data ?? []).map((h) => {
                const f = fixtureMap.get(h.fixture_id);
                const playerName =
                  profileMap.get(h.user_id)?.display_name ?? h.user_id.slice(0, 8);
                const editorName =
                  profileMap.get(h.editor_user_id)?.display_name ??
                  h.editor_user_id.slice(0, 8);
                return (
                  <tr key={h.id} className="border-t border-border">
                    <td className="px-3 py-2 text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(h.created_at).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{editorName}</td>
                    <td className="px-3 py-2 font-bold text-ink whitespace-nowrap">
                      {playerName}
                    </td>
                    <td className="px-3 py-2">
                      {f ? (
                        <span className="flex items-center gap-1">
                          <span>{flagFor(f.team_home)}</span>
                          <span className="text-muted-foreground">v</span>
                          <span>{flagFor(f.team_away)}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] uppercase tracking-wider font-bold">
                      {h.action === "insert" ? (
                        <span className="text-primary">Added</span>
                      ) : (
                        <span className="text-ink">Edited</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                      {h.old_home === null || h.old_away === null
                        ? "—"
                        : `${h.old_home} – ${h.old_away}`}
                    </td>
                    <td className="px-3 py-2 text-right font-bold whitespace-nowrap">
                      {h.new_home} – {h.new_away}
                    </td>
                  </tr>
                );
              })}
              {!historyQ.isLoading && (historyQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                    No prediction edits yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}