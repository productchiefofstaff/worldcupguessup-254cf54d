import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLuckBox, type LuckPlayer, type LuckGameDetail } from "@/lib/luckbox.functions";
import { useAuth } from "@/hooks/use-auth";
import { Dices, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Info, Table2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/luckbox")({
  head: () => ({
    meta: [
      { title: "LuckBox – World Cup 2026 Predictor" },
      {
        name: "description",
        content: "See who's gained and lost points to injury-time goals.",
      },
    ],
  }),
  component: LuckBoxPage,
});

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif" } as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function GameRow({ game }: { game: LuckGameDetail }) {
  const gained = game.delta > 0;
  return (
    <li className="border-t border-border/60 px-3 py-2 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold text-ink truncate">
          {game.team_home} {game.ft_home}–{game.ft_away} {game.team_away}
        </div>
        <div
          className={`shrink-0 font-bold tabular-nums ${gained ? "text-success" : "text-destructive"}`}
        >
          {gained ? "+" : ""}
          {game.delta} pts
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2 text-muted-foreground mt-0.5">
        <span>
          {fmtDate(game.kickoff_at)} · pick {game.prediction_home}–{game.prediction_away}
        </span>
        <span className="shrink-0">
          90&apos; was {game.ninety_home}–{game.ninety_away}
        </span>
      </div>
      <ul className="mt-1 space-y-0.5">
        {game.stoppage_goals.map((g, i) => {
          const team = g.side === "home" ? game.team_home : game.team_away;
          return (
            <li key={i} className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-ink/80">{g.minute_display}</span>{" "}
              {team}
              {g.scorer ? ` — ${g.scorer}` : ""}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function PlayerCard({ player, defaultOpen }: { player: LuckPlayer; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const net = player.net;
  const netClass = net > 0 ? "text-success" : net < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="font-bold text-ink truncate">{player.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {player.affected_games} {player.affected_games === 1 ? "game" : "games"} affected
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Stat label="Won" value={`+${player.points_won}`} tone="success" />
          <Stat label="Lost" value={`-${player.points_lost}`} tone="destructive" />
          <div className="text-center">
            <div className={`font-extrabold leading-none tabular-nums ${netClass}`} style={{ ...BEBAS, fontSize: "1.5rem" }}>
              {net > 0 ? "+" : ""}
              {net}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">Net</div>
          </div>
          {player.games.length > 0 &&
            (open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ))}
        </div>
      </button>
      {open && player.games.length > 0 && (
        <ul className="bg-muted/30">
          {player.games.map((g) => (
            <GameRow key={g.fixture_id} game={g} />
          ))}
        </ul>
      )}
      {open && player.games.length === 0 && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border/60">
          No injury-time swings yet.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "destructive";
}) {
  const colour = tone === "success" ? "text-success" : "text-destructive";
  const Icon = tone === "success" ? TrendingUp : TrendingDown;
  return (
    <div className="text-center min-w-[44px]">
      <div className={`flex items-center justify-center gap-0.5 font-bold tabular-nums ${colour}`} style={{ ...BEBAS, fontSize: "1.1rem" }}>
        <Icon className="h-3.5 w-3.5" />
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function LuckBoxPage() {
  const { user } = useAuth();
  const fetchLuck = useServerFn(getLuckBox);
  const [helpOpen, setHelpOpen] = React.useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["luckbox"],
    queryFn: () => fetchLuck(),
    staleTime: 60_000,
  });

  const players = data?.players ?? [];

  return (
    <main className="max-w-3xl mx-auto px-4 py-4 sm:py-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
            <Dices className="h-6 w-6 text-primary" />
            LuckBox
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Points won or lost from goals scored after the 90th minute.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-ink rounded-full hover:bg-muted px-2 py-1.5 transition-colors shrink-0 mt-0.5"
          aria-label="How LuckBox works"
        >
          <Info className="h-4 w-4" />
          <span>How</span>
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Failed to load LuckBox.</p>}

      {!isLoading && !error && (
        <div className="space-y-2">
          {players.map((p) => (
            <PlayerCard key={p.user_id} player={p} defaultOpen={false} />
          ))}
          {players.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No injury-time goals have settled yet. Check back after a match.
            </p>
          )}
        </div>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md bg-white/70 backdrop-blur-xl border-white/40 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-ink flex items-center gap-2">
              <Dices className="h-5 w-5 text-primary" />
              How LuckBox works
            </DialogTitle>
            <DialogDescription className="text-ink/80 pt-2 space-y-2">
              <span className="block">
                For every settled match we compare the actual full-time score with what the score
                would have been on the 90-minute mark (before stoppage-time goals).
              </span>
              <span className="block">
                We then re-run the points for your prediction at both scores. If a late goal earned
                you points you wouldn&apos;t have had — that&apos;s a win. If it cost you — that&apos;s a loss.
              </span>
              <span className="block text-xs text-muted-foreground">
                Knockout extra-time goals don&apos;t count (predictions settle on the 90-minute score).
              </span>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </main>
  );
}