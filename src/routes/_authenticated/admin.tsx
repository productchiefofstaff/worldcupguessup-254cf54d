import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateFixtureScore, setUserLeaderboardVisibility, deleteUser } from "@/lib/admin-fixtures.functions";
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
};
type Profile = { id: string; display_name: string; created_at?: string; show_on_leaderboard?: boolean; last_visit_at?: string | null };

function AdminPage() {
  const { user, ready } = useAuth();
  const [tab, setTab] = useState<"predictions" | "users" | "fixtures">("predictions");
  const qc = useQueryClient();
  const updateScoreFn = useServerFn(updateFixtureScore);
  const setVisibilityFn = useServerFn(setUserLeaderboardVisibility);
  const deleteUserFn = useServerFn(deleteUser);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHome, setEditHome] = useState<string>("");
  const [editAway, setEditAway] = useState<string>("");

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
        .select("id, user_id, fixture_id, home_score, away_score, created_at, updated_at")
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
        .select("id, match_number, stage, team_home, team_away, kickoff_at, home_score, away_score");
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
      const ta = a.f ? new Date(a.f.kickoff_at).getTime() : 0;
      const tb = b.f ? new Date(b.f.kickoff_at).getTime() : 0;
      return ta - tb;
    });

  const now = Date.now();
  const editableFixtures = (fixturesQ.data ?? [])
    .filter((f) => new Date(f.kickoff_at).getTime() <= now)
    .sort(
      (a, b) =>
        new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime(),
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
      </div>

      {tab === "predictions" && (
      <>
      {predsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="bg-card border border-border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Player</th>
              <th className="text-left px-3 py-2">Match</th>
              <th className="text-right px-3 py-2">Pick</th>
              <th className="text-right px-3 py-2">Result</th>
              <th className="text-right px-3 py-2 whitespace-nowrap">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, f, name }) => {
              const hasResult = f && f.home_score !== null && f.away_score !== null;
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
                    {r.home_score} – {r.away_score}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {hasResult ? `${f!.home_score} – ${f!.away_score}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(r.updated_at).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              );
            })}
            {!predsQ.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
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
            Live and completed matches. Scores normally come from the automatic
            scraper — manual edits here override it and update the leaderboard
            immediately.
          </p>
          <table className="w-full text-sm">
            <thead className="bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Match</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">Kickoff</th>
                <th className="text-right px-3 py-2">Score</th>
                <th className="text-right px-3 py-2">Edit</th>
              </tr>
            </thead>
            <tbody>
              {editableFixtures.map((f) => {
                const isEditing = editingId === f.id;
                const hasScore = f.home_score !== null && f.away_score !== null;
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
                      ) : (
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
                      )}
                    </td>
                  </tr>
                );
              })}
              {editableFixtures.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-muted-foreground">
                    No live or completed fixtures yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {updateMut.isError && (
            <p className="px-3 py-2 text-[11px] text-destructive border-t border-border">
              {(updateMut.error as Error).message}
            </p>
          )}
        </div>
      )}
    </main>
  );
}