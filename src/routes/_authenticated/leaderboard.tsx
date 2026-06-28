import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Crown, ChevronDown, TrendingUp } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getLeaderboardHistory } from "@/lib/leaderboard-history.functions";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard – World Cup 2026 Predictor" },
      { name: "description", content: "See who's topping the World Cup prediction leaderboard." },
    ],
  }),
  component: LeaderboardPage,
});

type Row = {
  user_id: string;
  name: string;
  points: number;
  correct_results: number;
  correct_scores: number;
  settled_predictions: number;
  total_predictions: number;
};

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif" } as const;

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function rankAccent(rank: number) {
  if (rank === 1) return { border: "border-warning", text: "text-warning", ring: "border-warning/40", glow: true };
  if (rank === 2) return { border: "border-muted-foreground/30", text: "text-muted-foreground", ring: "border-muted-foreground/30", glow: false };
  if (rank === 3) return { border: "border-muted-foreground/30", text: "text-muted-foreground", ring: "border-muted-foreground/30", glow: false };
  return { border: "border-border", text: "text-muted-foreground", ring: "border-border", glow: false };
}

function LeaderboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaderboard")
        .select("*")
        .order("points", { ascending: false })
        .order("correct_scores", { ascending: false })
        .order("correct_results", { ascending: false })
        .order("settled_predictions", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as Row[];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const ranked = React.useMemo(() => {
    if (!data) return [];
    const out: (Row & { rank: number; tied: boolean })[] = [];
    let currentRank = 0;
    for (let i = 0; i < data.length; i++) {
      const prev = data[i - 1];
      const row = data[i];
      if (i > 0 && row.points === prev.points) {
        // tied with previous
        out.push({ ...row, rank: currentRank, tied: true });
      } else {
        currentRank = i + 1;
        const next = data[i + 1];
        const tiedWithNext =
          next !== undefined && row.points === next.points;
        out.push({ ...row, rank: currentRank, tied: tiedWithNext });
      }
    }
    return out;
  }, [data]);

  return (
    <main className="min-h-screen bg-surface py-4 sm:py-6">
      <div className="max-w-xl mx-auto px-4">
      <div className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          Leaderboard
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Updated automatically as results come in</p>
      </div>

        {data && data.length > 0 && (
          <div className="flex justify-start -mt-2 mb-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 border border-warning/30 px-2.5 py-1">
              <Crown className="h-3.5 w-3.5 text-warning shrink-0" />
              <span className="text-[11px] font-bold text-foreground">1st place wins £80</span>
            </div>
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground mb-4">Loading…</p>}
        {error && <p className="text-sm text-destructive mb-4">Failed to load leaderboard.</p>}

        <div className="space-y-2">
          {ranked.map((row) => {
            const isMe = user?.id === row.user_id;
            const rank = row.rank;
            const accent = rankAccent(rank);
            const accuracy =
              row.settled_predictions > 0
                ? Math.round(
                    ((row.correct_results ?? 0) + (row.correct_scores ?? 0)) /
                      row.settled_predictions *
                      1000,
                  ) / 10
                : 0;
            const initial = (row.name || "?").trim().charAt(0).toUpperCase();
            const ord = ordinal(rank);
            const rankDisplay = row.tied ? `=${ord}` : ord;

            return (
              <LeaderboardCard
                key={row.user_id}
                row={row}
                rank={rank}
                rankDisplay={rankDisplay}
                accent={accent}
                accuracy={accuracy}
                isMe={isMe}
                initial={initial}
              />
            );
          })}
        </div>

        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground bg-card rounded-xl border border-border">
            No players yet — be the first to predict!
          </div>
        )}

        <PointsOverTime />
      </div>
    </main>
  );
}

const LINE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
  "var(--success)",
  "var(--warning)",
];

function PointsOverTime() {
  const fetchHistory = useServerFn(getLeaderboardHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard-history"],
    queryFn: () => fetchHistory(),
    staleTime: 5 * 60_000,
  });

  const chartData = React.useMemo(() => {
    if (!data) return [];
    const ids = data.players.map((pl) => pl.user_id);
    return data.points
      .filter((p) => {
        const d = new Date(p.date as string);
        return !(d.getUTCMonth() === 5 && d.getUTCDate() === 14);
      })
      .map((p) => {
        const scored = ids.map((id) => ({ id, pts: Number((p as any)[id] ?? 0) }));
        const sorted = [...scored].sort((a, b) => b.pts - a.pts);
        const rankMap: Record<string, number> = {};
        let lastPts = Number.NaN;
        let lastRank = 0;
        sorted.forEach((s, i) => {
          if (s.pts !== lastPts) {
            lastRank = i + 1;
            lastPts = s.pts;
          }
          rankMap[s.id] = lastRank;
        });
        const row: Record<string, any> = {
          label: new Date(p.date as string).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          }),
        };
        ids.forEach((id) => {
          row[id] = rankMap[id];
        });
        return row;
      });
  }, [data]);

  const tickLabels = React.useMemo(() => {
    if (!chartData.length) return [];
    const labels = chartData.map((r) => r.label as string);
    const explicit: string[] = [];
    labels.forEach((l, i) => {
      if (i % 3 === 0) explicit.push(l);
    });
    const has26 = explicit.some((l) => l.startsWith("26"));
    if (!has26) {
      const l26 = labels.find((l) => l.startsWith("26"));
      if (l26) explicit.push(l26);
    }
    return explicit;
  }, [chartData]);

  return (
    <section className="mt-6">
      <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-ink mb-2 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        League Position Over Time
      </h2>
      <div className="bg-card border border-border rounded-xl p-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
        )}
        {!isLoading && data && data.players.length > 0 && (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval="preserveStartEnd"
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  width={32}
                  allowDecimals={false}
                  reversed
                  domain={[1, data.players.length]}
                  ticks={Array.from({ length: data.players.length }, (_, i) => i + 1)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                {data.players.map((p, i) => (
                  <Line
                    key={p.user_id}
                    type="monotone"
                    dataKey={p.user_id}
                    name={p.name}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {!isLoading && (!data || data.players.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-8">No data yet.</p>
        )}
      </div>
    </section>
  );
}

function LeaderboardCard({
  row,
  rank,
  rankDisplay,
  accent,
  accuracy,
  isMe,
  initial,
}: {
  row: Row;
  rank: number;
  rankDisplay: string;
  accent: ReturnType<typeof rankAccent>;
  accuracy: number;
  isMe: boolean;
  initial: string;
}) {
  const [open, setOpen] = React.useState(rank === 1);

  return (
    <div className="relative group">
      {accent.glow && (
        <div className="absolute -inset-0.5 bg-gradient-to-r from-warning to-warning/60 rounded-xl blur opacity-20 pointer-events-none" />
      )}
      <div
        className={
          "relative bg-card border border-border border-l-4 rounded-r-xl overflow-hidden " +
          accent.border
        }
      >
        <div className="p-2.5">
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={
                  "w-11 h-11 bg-muted rounded-full border-2 flex items-center justify-center shrink-0 " +
                  accent.ring
                }
              >
                <span
                  className={"text-lg leading-none " + accent.text}
                  style={BEBAS}
                >
                  {rankDisplay}
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-ink leading-tight">
                  {row.name}
                </h2>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                className={
                  "leading-none tabular-nums " +
                  (rank === 1 ? "text-5xl text-warning" : "text-3xl text-primary")
                }
                style={BEBAS}
              >
                {row.points}
              </div>
              {rank !== 1 && (
                <button
                  onClick={() => setOpen((v) => !v)}
                  className="mt-0.5 flex items-center gap-0.5 text-[9px] font-bold text-muted-foreground uppercase hover:text-foreground transition-colors"
                  aria-label={open ? "Hide stats" : "Show stats"}
                >
                  Stats
                  <ChevronDown
                    className={
                      "h-3 w-3 transition-transform " + (open ? "rotate-180" : "")
                    }
                  />
                </button>
              )}
            </div>
          </div>

          {open && (
            <div className="mt-2 grid grid-cols-4 gap-1 border-t border-border/60 pt-2">
              <StatBox value={row.settled_predictions} label="Matches Predicted" />
              <StatBox value={row.correct_scores} label="Correct Scores" />
              <StatBox value={row.correct_results} label="Correct Results" />
              <StatBox
                value={`${accuracy}%`}
                label="Total Accuracy"
              />
            </div>
          )}
        </div>
        <span
          className="absolute top-0 right-0 text-5xl text-foreground/[0.03] select-none pointer-events-none -mr-2 -mt-2 leading-none"
          style={BEBAS}
        >
          {rank}
        </span>
      </div>
    </div>
  );
}

function StatBox({
  value,
  label,
  valueClass,
}: {
  value: React.ReactNode;
  label: string;
  valueClass?: string;
}) {
  return (
    <div className="text-center">
      <div className={"text-sm font-bold tabular-nums " + (valueClass ?? "text-foreground")}>
        {value}
      </div>
      <div className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wide mt-0.5 leading-tight">
        {label}
      </div>
    </div>
  );
}