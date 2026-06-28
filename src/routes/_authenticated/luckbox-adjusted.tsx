import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLuckBox } from "@/lib/luckbox.functions";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { Table2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/luckbox-adjusted")({
  head: () => ({
    meta: [
      { title: "LuckBox Adjusted Table – World Cup 2026 Predictor" },
      {
        name: "description",
        content: "What the leaderboard would look like if injury-time goals were ignored.",
      },
    ],
  }),
  component: LuckBoxAdjustedPage,
});

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif" } as const;

function LuckBoxAdjustedPage() {
  const { user } = useAuth();
  const fetchLuck = useServerFn(getLuckBox);

  const { data, isLoading, error } = useQuery({
    queryKey: ["luckbox-adjusted"],
    queryFn: () => fetchLuck(),
    staleTime: 60_000,
  });

  const rows = React.useMemo(() => {
    if (!data?.players) return [];
    const out = data.players.map((p) => {
      const actual = p.actual_points ?? 0;
      const adjusted = actual - p.net;
      const adjustment = -p.net;
      return {
        user_id: p.user_id,
        name: p.name,
        actual,
        adjusted,
        adjustment,
        isMe: user?.id === p.user_id,
      };
    });
    out.sort(
      (a, b) =>
        b.adjusted - a.adjusted ||
        b.actual - a.actual ||
        a.name.localeCompare(b.name),
    );
    return out;
  }, [data, user?.id]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-4 sm:py-6">
      <div className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
          <Table2 className="h-6 w-6 text-primary" />
          The LuckBox Adjusted Table
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          What the leaderboard would look like if injury-time goals were ignored.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Failed to load adjusted table.</p>}

      {!isLoading && !error && (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Adjusted Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const adjClass =
                  r.adjustment > 0
                    ? "text-success"
                    : r.adjustment < 0
                      ? "text-destructive"
                      : "text-muted-foreground";
                return (
                  <TableRow
                    key={r.user_id}
                    className={r.isMe ? "bg-primary/5" : undefined}
                  >
                    <TableCell className="text-center text-muted-foreground font-medium tabular-nums">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium text-ink">
                      {r.name}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className="text-xl tabular-nums text-ink"
                        style={BEBAS}
                      >
                        {r.adjusted}
                      </span>
                      <span className={`ml-2 text-sm font-semibold tabular-nums ${adjClass}`}>
                        ({r.adjustment > 0 ? "+" : ""}
                        {r.adjustment})
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-sm text-muted-foreground py-6"
                  >
                    No players yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
