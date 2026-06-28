import { useMemo } from "react";
import { flagFor } from "@/lib/flags";
import type { Fixture } from "@/components/FixtureCard";
import { cn } from "@/lib/utils";

// Round-of-32 bracket order mirrors the FIFA bracket published by ESPN/BBC.
// Each pair of R32 winners feeds the corresponding R16 slot, and so on.
// The match_numbers in the DB are 73–104; bracket adjacency is given by
// pairing consecutive matches (73+74 → R16, 75+76 → R16, …).
const R32_NUMBERS = Array.from({ length: 16 }, (_, i) => 73 + i);
const R16_NUMBERS = Array.from({ length: 8 }, (_, i) => 89 + i);
const QF_NUMBERS = [97, 98, 99, 100];
const SF_NUMBERS = [101, 102];
const FINAL_NUMBER = 104;
const THIRD_PLACE_NUMBER = 103;

function isPlaceholder(name: string) {
  const u = name.toUpperCase();
  return (
    u.includes("TBD") ||
    u.startsWith("WINNER ") ||
    u.startsWith("RUNNER") ||
    u.startsWith("LOSER ") ||
    /^GROUP [A-Z] (WINNER|2ND PLACE|RUNNER-UP)$/.test(u) ||
    u.startsWith("THIRD PLACE GROUP") ||
    /^ROUND OF (32|16) \d+ WINNER$/.test(u) ||
    /^(R16|QF|SF) /.test(u) ||
    u.startsWith("3RD PLACE") ||
    u.startsWith("FINAL ")
  );
}

function formatKickoff(iso: string) {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
  return { weekday, time, day };
}

function TeamRow({
  name,
  score,
  winner,
}: {
  name: string;
  score: number | null;
  winner: boolean;
}) {
  const tbd = isPlaceholder(name);
  const flag = !tbd ? flagFor(name) : null;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2 py-1.5 text-[13px] leading-tight",
        winner ? "font-bold text-ink" : tbd ? "text-muted-foreground" : "text-ink",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-5 text-sm leading-none shrink-0" aria-hidden>
          {flag ?? <span className="inline-block w-4 h-3 rounded-sm bg-muted" />}
        </span>
        <span className="truncate">{tbd ? "TBD" : name}</span>
      </div>
      {score !== null && (
        <span className="tabular-nums font-bold text-ink shrink-0">{score}</span>
      )}
    </div>
  );
}

function MatchCard({ fixture }: { fixture: Fixture | undefined }) {
  if (!fixture) {
    return (
      <div className="h-[60px] rounded-md border border-dashed border-border bg-muted/30" />
    );
  }
  const finished = fixture.home_score !== null && fixture.away_score !== null;
  const homeWin = finished && (fixture.home_score ?? 0) > (fixture.away_score ?? 0);
  const awayWin = finished && (fixture.away_score ?? 0) > (fixture.home_score ?? 0);
  const { weekday, time, day } = formatKickoff(fixture.kickoff_at);
  return (
    <div className="rounded-md border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex">
        <div className="flex-1 min-w-0 divide-y divide-border">
          <TeamRow
            name={fixture.team_home}
            score={fixture.home_score}
            winner={homeWin}
          />
          <TeamRow
            name={fixture.team_away}
            score={fixture.away_score}
            winner={awayWin}
          />
        </div>
        {!finished && (
          <div className="flex flex-col items-center justify-center px-2 py-1 border-l border-border bg-muted/40 text-[10px] leading-tight tabular-nums text-muted-foreground shrink-0 w-[58px]">
            <div>{weekday}</div>
            <div className="text-ink text-sm font-bold leading-none my-0.5">
              {time}
            </div>
            <div>{day}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Column({
  title,
  fixtures,
  numbers,
  pitch,
  offset = 0,
}: {
  title: string;
  fixtures: Map<number, Fixture>;
  numbers: number[];
  pitch: number; // px between card top edges
  offset?: number; // px top offset for first card
}) {
  return (
    <div className="shrink-0 w-[200px]">
      <h3 className="text-xs font-bold uppercase tracking-wider text-ink text-center mb-3">
        {title}
      </h3>
      <div className="relative" style={{ paddingTop: offset }}>
        {numbers.map((n, i) => (
          <div
            key={n}
            style={{ marginTop: i === 0 ? 0 : pitch - 60 }}
            className="relative"
          >
            <MatchCard fixture={fixtures.get(n)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function KnockoutBracket({ fixtures }: { fixtures: Fixture[] }) {
  const byNumber = useMemo(() => {
    const map = new Map<number, Fixture>();
    fixtures.forEach((f) => map.set(f.match_number, f));
    return map;
  }, [fixtures]);

  // Vertical pitches chosen so each round's cards sit between its feeder pair.
  // Card height ≈ 60px. R32 pitch=68 → R16 pitch=136 → QF=272 → SF=544.
  const R32_PITCH = 68;
  const R16_PITCH = R32_PITCH * 2;
  const QF_PITCH = R32_PITCH * 4;
  const SF_PITCH = R32_PITCH * 8;

  // Vertical centering offsets so each card aligns to midpoint of its feeders.
  const R16_OFFSET = (R16_PITCH - R32_PITCH) / 2; // 34
  const QF_OFFSET = (QF_PITCH - R32_PITCH) / 2; // 102
  const SF_OFFSET = (SF_PITCH - R32_PITCH) / 2; // 238
  const FINAL_OFFSET = (R32_PITCH * 16 - R32_PITCH) / 2; // 510

  // Geometry for the SVG connector overlay.
  const COL_W = 200;
  const GAP = 16;
  const TITLE_H = 24; // h3 text + mb-3
  const CARD_H = 60;
  const STUB = 10; // horizontal stub length out of each card

  // Card center y inside a column (relative to overlay top).
  const centerY = (offset: number, pitch: number, i: number) =>
    TITLE_H + offset + i * pitch + CARD_H / 2;

  const columns = [
    { offset: 0, pitch: R32_PITCH, count: 16 },
    { offset: R16_OFFSET, pitch: R16_PITCH, count: 8 },
    { offset: QF_OFFSET, pitch: QF_PITCH, count: 4 },
    { offset: SF_OFFSET, pitch: SF_PITCH, count: 2 },
    { offset: FINAL_OFFSET, pitch: 0, count: 1 },
  ];

  const totalW = columns.length * COL_W + (columns.length - 1) * GAP;
  const totalH = TITLE_H + R32_PITCH * 16 + 20;

  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (let c = 0; c < columns.length - 1; c++) {
    const from = columns[c];
    const to = columns[c + 1];
    const fromRight = (c + 1) * COL_W + c * GAP; // right edge of column c
    const toLeft = fromRight + GAP; // left edge of column c+1
    const midX = (fromRight + toLeft) / 2;
    for (let i = 0; i < to.count; i++) {
      const yTop = centerY(from.offset, from.pitch, 2 * i);
      const yBot = centerY(from.offset, from.pitch, 2 * i + 1);
      const yNext = centerY(to.offset, to.pitch, i);
      // stub out of top feeder
      lines.push({ x1: fromRight, y1: yTop, x2: midX, y2: yTop });
      // stub out of bottom feeder
      lines.push({ x1: fromRight, y1: yBot, x2: midX, y2: yBot });
      // vertical join
      lines.push({ x1: midX, y1: yTop, x2: midX, y2: yBot });
      // stub into next round
      lines.push({ x1: midX, y1: yNext, x2: toLeft, y2: yNext });
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="overflow-x-auto -mx-3 px-3 pb-2">
        <div className="relative flex gap-4 min-w-max">
          <svg
            className="absolute inset-0 pointer-events-none text-ink/40"
            width={totalW}
            height={totalH}
            aria-hidden
          >
            {lines.map((l, idx) => (
              <line
                key={idx}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              />
            ))}
          </svg>
          <Column
            title="Last 32"
            fixtures={byNumber}
            numbers={R32_NUMBERS}
            pitch={R32_PITCH}
          />
          <Column
            title="Last 16"
            fixtures={byNumber}
            numbers={R16_NUMBERS}
            pitch={R16_PITCH}
            offset={R16_OFFSET}
          />
          <Column
            title="Quarter-finals"
            fixtures={byNumber}
            numbers={QF_NUMBERS}
            pitch={QF_PITCH}
            offset={QF_OFFSET}
          />
          <Column
            title="Semi-finals"
            fixtures={byNumber}
            numbers={SF_NUMBERS}
            pitch={SF_PITCH}
            offset={SF_OFFSET}
          />
          <div className="shrink-0 w-[200px]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink text-center mb-3">
              Final
            </h3>
            <div style={{ paddingTop: FINAL_OFFSET }}>
              <MatchCard fixture={byNumber.get(FINAL_NUMBER)} />
              <div className="mt-6">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center mb-2">
                  3rd Place
                </h4>
                <MatchCard fixture={byNumber.get(THIRD_PLACE_NUMBER)} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}