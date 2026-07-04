import { createFileRoute } from "@tanstack/react-router";

const SCOREBOARD_API_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

// ESPN scoreboard shows ONE day at a time. We sweep a wider window so newly
// announced knockout fixtures (often published 2–5 days ahead, once the
// previous round's teams are known) get pulled in before kickoff. Cron runs
// every 30 min so the extra fetches are cheap.
function scoreboardUrls(): string[] {
  const today = new Date();
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const offsets = [-1, 0, 1, 2, 3, 4, 5, 6, 7];
  return offsets.map((offset) => {
    const d = new Date(today.getTime() + offset * 24 * 60 * 60 * 1000);
    return `${SCOREBOARD_API_BASE}?dates=${fmt(d)}`;
  });
}

type SourceMatch = {
  kickoff_iso?: string | null;
  team_home?: string | null;
  team_away?: string | null;
  status?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  stage?: string | null;
  status_label?: string | null;
  status_text?: string | null;
  /** Penalty shootout score for the home side (if exposed by source). */
  home_pens?: number | null;
  away_pens?: number | null;
};

type EspnCompetitor = {
  homeAway?: string;
  score?: string;
  shootoutScore?: number | string;
  team?: { displayName?: string; abbreviation?: string };
};

type EspnEvent = {
  date?: string;
  competitions?: Array<{
    competitors?: EspnCompetitor[];
    status?: {
      type?: {
        completed?: boolean;
        state?: string;
        detail?: string;
        shortDetail?: string;
        description?: string;
        name?: string;
      };
    };
  }>;
  season?: { type?: { name?: string } };
};

type EspnScoreboard = {
  events?: EspnEvent[];
  leagues?: Array<{ season?: { type?: { name?: string } } }>;
};

const TEAM_ALIASES: Record<string, string> = {
  alg: "algeria",
  arg: "argentina",
  aus: "australia",
  aut: "austria",
  bel: "belgium",
  bih: "bosniaandherzegovina",
  bosniaherzegovina: "bosniaandherzegovina",
  bra: "brazil",
  can: "canada",
  civ: "ivorycoast",
  col: "colombia",
  cro: "croatia",
  cuw: "curacao",
  cze: "czechia",
  cod: "drcongo",
  congodr: "drcongo",
  ecu: "ecuador",
  egy: "egypt",
  eng: "england",
  fra: "france",
  ger: "germany",
  gha: "ghana",
  hai: "haiti",
  irn: "iran",
  irq: "iraq",
  jpn: "japan",
  jor: "jordan",
  mar: "morocco",
  mex: "mexico",
  ned: "netherlands",
  nor: "norway",
  nzl: "newzealand",
  pan: "panama",
  par: "paraguay",
  por: "portugal",
  qat: "qatar",
  ksa: "saudiarabia",
  sco: "scotland",
  sen: "senegal",
  rsa: "southafrica",
  kor: "southkorea",
  esp: "spain",
  swe: "sweden",
  sui: "switzerland",
  tun: "tunisia",
  tur: "turkiye",
  uru: "uruguay",
  usa: "usa",
  unitedstates: "usa",
  uzb: "uzbekistan",
};

function norm(s: string | null | undefined): string {
  const key = (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return TEAM_ALIASES[key] ?? key;
}

// Placeholder names used for not-yet-decided knockout slots, e.g.
// "R32 Match 1 TBD", "R16 Match 3 TBD", "QF1 TBD", "SF2 TBD",
// "3rd Place TBD", "Final TBD". Treat any name containing "TBD" — or
// the legacy "Winner …"/"Runner-up …" formats — as a fillable slot.
function isPlaceholderTeam(s: string | null | undefined): boolean {
  if (!s) return true;
  const u = s.toUpperCase();
  return (
    u.includes("TBD") ||
    u.startsWith("WINNER ") ||
    u.startsWith("RUNNER") ||
    u.startsWith("LOSER ") ||
    // FIFA-style knockout slot names ESPN publishes before standings settle:
    //   "Group F Winner", "Group F 2nd Place",
    //   "Third Place Group A/B/C/D/F",
    //   "Round of 32 1 Winner", "R16 Match 5 TBD", etc.
    /^GROUP [A-Z] (WINNER|2ND PLACE|RUNNER-UP)$/.test(u) ||
    u.startsWith("THIRD PLACE GROUP") ||
    /^ROUND OF 32 \d+ WINNER$/.test(u) ||
    /^ROUND OF 16 \d+ WINNER$/.test(u)
  );
}

// Guard against duplicates: if a real team name already appears in any other
// knockout fixture (R32 onwards), don't fill it into a new placeholder slot.
// Prevents ESPN's closest-in-time placeholder fallback from cloning a team
// across two upcoming knockout fixtures.
function teamAlreadyInKnockout(
  fixtures: Array<{ id: string; match_number: number; team_home: string; team_away: string }>,
  team: string,
  excludeFixtureId: string,
): boolean {
  const t = norm(team);
  if (!t) return false;
  return fixtures.some(
    (f) =>
      f.id !== excludeFixtureId &&
      f.match_number >= 73 &&
      f.match_number <= 104 &&
      (norm(f.team_home) === t || norm(f.team_away) === t),
  );
}

function parseEspnScoreboard(data: EspnScoreboard): SourceMatch[] {
  const fallbackStage = data.leagues?.[0]?.season?.type?.name ?? null;
  return (data.events ?? []).flatMap((event) => {
    const competition = event.competitions?.[0];
    const home = competition?.competitors?.find((team) => team.homeAway === "home");
    const away = competition?.competitors?.find((team) => team.homeAway === "away");
    const statusType = competition?.status?.type;
    if (!home || !away) return [];

    const statusLabel =
      statusType?.shortDetail ?? statusType?.detail ?? statusType?.description ?? null;
    const statusText = [
      statusType?.shortDetail,
      statusType?.detail,
      statusType?.description,
      statusType?.name,
    ]
      .filter(Boolean)
      .join(" ");
    const completed = statusType?.completed === true || statusType?.state === "post";

    return [
      {
        kickoff_iso: event.date ?? null,
        team_home: home.team?.displayName ?? home.team?.abbreviation ?? null,
        team_away: away.team?.displayName ?? away.team?.abbreviation ?? null,
        status_label: statusLabel,
        status_text: statusText,
        status: completed ? "finished" : statusType?.state === "in" ? "live" : "scheduled",
        // Parse scores whenever ESPN provides them — both for completed
        // matches (final score) and in-progress matches (live score).
        home_score: (() => {
          const n = Number.parseInt(home.score ?? "", 10);
          return Number.isInteger(n) ? n : null;
        })(),
        away_score: (() => {
          const n = Number.parseInt(away.score ?? "", 10);
          return Number.isInteger(n) ? n : null;
        })(),
        home_pens: (() => {
          const raw = home.shootoutScore;
          const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
          return Number.isInteger(n) ? n : null;
        })(),
        away_pens: (() => {
          const raw = away.shootoutScore;
          const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
          return Number.isInteger(n) ? n : null;
        })(),
        stage: event.season?.type?.name ?? fallbackStage,
      },
    ];
  });
}

export const Route = createFileRoute("/api/public/sync-results")({
  server: {
    handlers: {
      POST: async () => {
        let matches: SourceMatch[] = [];
        try {
          const urls = scoreboardUrls();
          const results = await Promise.allSettled(
            urls.map((url) =>
              fetch(url, { headers: { Accept: "application/json" } }).then(
                async (response) => {
                  if (!response.ok) {
                    throw new Error(`ESPN ${response.status} ${response.statusText}`);
                  }
                  return (await response.json()) as EspnScoreboard;
                },
              ),
            ),
          );

          matches = results.flatMap((result, index) => {
            if (result.status === "rejected") {
              console.warn(
                `[sync-results] ESPN fetch skipped for ${urls[index]} — ${String(result.reason)}`,
              );
              return [];
            }
            return parseEspnScoreboard(result.value);
          });
        } catch (e) {
          console.error("ESPN scoreboard fetch failed", e);
          return Response.json(
            { error: "scoreboard_fetch_failed", detail: String(e) },
            { status: 502 },
          );
        }

        if (!matches.length) {
          return Response.json({ ok: true, parsed: 0, updated: 0 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: fixtures, error: fxErr } = await supabaseAdmin
          .from("fixtures")
          .select("id, match_number, stage, team_home, team_away, kickoff_at, home_score, away_score, home_score_aet, away_score_aet, pens_home, pens_away, decided_by, winner_team, live_home_score, live_away_score, live_status_label");
        if (fxErr || !fixtures) {
          return Response.json(
            { error: "db_read_failed", detail: fxErr?.message },
            { status: 500 },
          );
        }

        let updated = 0;
        const details: Array<Record<string, unknown>> = [];

        for (const m of matches) {
          const mTs = m.kickoff_iso ? new Date(m.kickoff_iso).getTime() : NaN;
          const haveTs = Number.isFinite(mTs);
          const mh = norm(m.team_home);
          const ma = norm(m.team_away);

          // Candidate pool:
          //  - schedule rows give us a timestamp → restrict to same ±6h window
          //  - results rows often have no date → fall back to team-name match
          //    across fixtures kicking off in the last 48h (handles finished
          //    matches without a printed date)
          const candidates = haveTs
            ? fixtures.filter(
                (f) =>
                  Math.abs(new Date(f.kickoff_at).getTime() - mTs) <=
                  6 * 60 * 60 * 1000,
              )
            : fixtures.filter((f) => {
                const ageMin = (Date.now() - new Date(f.kickoff_at).getTime()) / 60000;
                return ageMin >= 0 && ageMin <= 48 * 60;
              });
          if (!candidates.length) continue;

          let fixture =
            candidates.find(
              (f) => norm(f.team_home) === mh && norm(f.team_away) === ma,
            ) ||
            // ESPN results page sometimes flips home/away ordering
            candidates.find(
              (f) => norm(f.team_home) === ma && norm(f.team_away) === mh,
            ) ||
            (haveTs
              ? // Knockout placeholder fixtures don't have real team names
                // yet, so we can't match by team. Pick the closest-in-time
                // placeholder fixture (within the ±6h window already applied
                // to `candidates`) and fill in the teams.
                candidates
                  .filter(
                    (f) =>
                      isPlaceholderTeam(f.team_home) ||
                      isPlaceholderTeam(f.team_away),
                  )
                  .sort(
                    (a, b) =>
                      Math.abs(new Date(a.kickoff_at).getTime() - mTs) -
                      Math.abs(new Date(b.kickoff_at).getTime() - mTs),
                  )[0]
              : undefined);

          if (!fixture) continue;

          // If the source row flipped home/away, swap the scores to match the
          // fixture's canonical orientation before we patch.
          let srcHome = m.home_score;
          let srcAway = m.away_score;
          let srcHomePens = m.home_pens;
          let srcAwayPens = m.away_pens;
          if (
            mh && ma &&
            norm(fixture.team_home) === ma &&
            norm(fixture.team_away) === mh
          ) {
            srcHome = m.away_score;
            srcAway = m.home_score;
            srcHomePens = m.away_pens;
            srcAwayPens = m.home_pens;
          }

          const patch: {
            team_home?: string;
            team_away?: string;
            home_score?: number;
            away_score?: number;
            home_score_aet?: number;
            away_score_aet?: number;
            pens_home?: number;
            pens_away?: number;
            decided_by?: "AET" | "PENS";
            winner_team?: string;
            live_home_score?: number | null;
            live_away_score?: number | null;
            live_status_label?: string | null;
            live_updated_at?: string | null;
          } = {};

          // Fill in knockout teams as they're decided
          if (
            isPlaceholderTeam(fixture.team_home) &&
            m.team_home &&
            !isPlaceholderTeam(m.team_home) &&
            !teamAlreadyInKnockout(fixtures, m.team_home, fixture.id)
          ) {
            patch.team_home = m.team_home;
          }
          if (
            isPlaceholderTeam(fixture.team_away) &&
            m.team_away &&
            !isPlaceholderTeam(m.team_away) &&
            !teamAlreadyInKnockout(fixtures, m.team_away, fixture.id)
          ) {
            patch.team_away = m.team_away;
          }

          // Settle 90-minute full-time scores. Multiple guards because the LLM
          // extraction occasionally hallucinates status="finished" + a live
          // scoreline:
          //  1) scraper must say status === "finished"
          //  2) kickoff must be at least 110 minutes in the past (90' + stoppage)
          //  3) only write when the fixture currently has NO score — never
          //     overwrite an existing value. Admin edits or earlier final
          //     scores stay authoritative; corrections happen via the admin UI.
          const kickoffTs = new Date(fixture.kickoff_at).getTime();
          const minutesSinceKickoff = (Date.now() - kickoffTs) / 60000;
          const alreadyHasScore =
            fixture.home_score !== null && fixture.away_score !== null;
          const ftLabel = (m.status_label ?? "").trim().toLowerCase();
          const statusText = `${m.status_label ?? ""} ${m.status_text ?? ""}`.toLowerCase();
          // ESPN exposes a "FT" / "Full Time" label at the 90-min whistle
          // even when a knockout match continues into extra time. Treat any
          // of these as the moment to lock the 90-min score for prediction
          // settlement, regardless of whether the overall match is finished.
          const labelIs90MinFinal =
            ftLabel === "ft" ||
            ftLabel === "full time" ||
            ftLabel === "full-time" ||
            ftLabel === "end of regulation" ||
            ftLabel === "end regulation" ||
            ftLabel === "end regular time" ||
            ftLabel === "final";
          const labelIsAet =
            ftLabel === "aet" ||
            ftLabel === "after extra time" ||
            ftLabel === "ft (aet)" ||
            ftLabel === "end et" ||
            /\b(aet|extra time|after extra time|status_final_aet)\b/.test(statusText);
          const labelIsPens =
            ftLabel === "pens" ||
            ftLabel === "penalties" ||
            ftLabel === "after penalties" ||
            ftLabel === "ft (pens)" ||
            ftLabel === "ft-pens" ||
            /\b(pens|penalties|after penalties|status_final_pen)\b/.test(statusText);
          const labelConfirmsFinished = labelIs90MinFinal || labelIsAet || labelIsPens;
          if (
            !alreadyHasScore &&
            labelConfirmsFinished &&
            minutesSinceKickoff >= 110 &&
            Number.isInteger(srcHome) &&
            Number.isInteger(srcAway)
          ) {
            patch.home_score = srcHome as number;
            patch.away_score = srcAway as number;
            // Only clear live state when the match is fully finished. If it
            // has gone to extra time, keep streaming live_* so the UI can
            // show the ongoing ET scoreline below the locked 90-min boxes.
            if (m.status === "finished") {
              patch.live_home_score = null;
              patch.live_away_score = null;
              patch.live_status_label = null;
              patch.live_updated_at = null;
            }
          } else if (
            !alreadyHasScore &&
            m.status === "finished" &&
            (!labelConfirmsFinished || minutesSinceKickoff < 110)
          ) {
            console.warn(
              `[sync-results] rejecting 'finished' for match ${fixture.match_number} (${fixture.team_home} v ${fixture.team_away}) — label='${m.status_label ?? ""}', minsSinceKO=${minutesSinceKickoff.toFixed(0)}`,
            );
          }

          // Knockout AET / penalty settlement — only when the 90-min score
          // is already locked AND was a draw AND source confirms tiebreaker.
          const ninetyMinHome = patch.home_score ?? fixture.home_score;
          const ninetyMinAway = patch.away_score ?? fixture.away_score;
          const drewIn90 =
            ninetyMinHome !== null && ninetyMinAway !== null && ninetyMinHome === ninetyMinAway;
          if (
            drewIn90 &&
            m.status === "finished" &&
            (labelIsAet || labelIsPens) &&
            Number.isInteger(srcHome) &&
            Number.isInteger(srcAway) &&
            !fixture.decided_by
          ) {
            patch.home_score_aet = srcHome as number;
            patch.away_score_aet = srcAway as number;
            if (labelIsPens) {
              patch.decided_by = "PENS";
              if (Number.isInteger(srcHomePens) && Number.isInteger(srcAwayPens)) {
                patch.pens_home = srcHomePens as number;
                patch.pens_away = srcAwayPens as number;
                patch.winner_team =
                  (srcHomePens as number) > (srcAwayPens as number)
                    ? fixture.team_home
                    : fixture.team_away;
              }
            } else {
              patch.decided_by = "AET";
              if ((srcHome as number) !== (srcAway as number)) {
                patch.winner_team =
                  (srcHome as number) > (srcAway as number)
                    ? fixture.team_home
                    : fixture.team_away;
              }
            }
            patch.live_home_score = null;
            patch.live_away_score = null;
            patch.live_status_label = null;
            patch.live_updated_at = null;
          }

          // If ESPN says the match is finished, clear stale live state even
          // when the result had already been locked earlier at 90 minutes.
          if (m.status === "finished") {
            patch.live_home_score = null;
            patch.live_away_score = null;
            patch.live_status_label = null;
            patch.live_updated_at = null;
          }

          // Track in-progress live scores so the UI can show the current
          // scoreline and minute without affecting prediction settlement.
          // We allow this even when a 90-min score is already locked — that
          // happens once a knockout match enters extra time, and we want to
          // keep showing the live ET scoreline below the locked boxes.
          const stillInProgress =
            m.status === "live" || (m.status === "finished" && false);
          if (stillInProgress) {
            const liveHome = Number.isInteger(srcHome) ? (srcHome as number) : null;
            const liveAway = Number.isInteger(srcAway) ? (srcAway as number) : null;
            if (
              liveHome !== fixture.live_home_score ||
              liveAway !== fixture.live_away_score ||
              (m.status_label ?? null) !== fixture.live_status_label
            ) {
              patch.live_home_score = liveHome;
              patch.live_away_score = liveAway;
              patch.live_status_label = m.status_label ?? null;
              patch.live_updated_at = new Date().toISOString();
            }
          }

          if (Object.keys(patch).length === 0) continue;

          const { error: upErr } = await supabaseAdmin
            .from("fixtures")
            .update(patch)
            .eq("id", fixture.id);
          if (upErr) {
            details.push({ match_number: fixture.match_number, error: upErr.message });
            continue;
          }
          updated++;
          details.push({ match_number: fixture.match_number, patch });
        }

        // Knockout progression: winners of each completed knockout match flow
        // into the next round's slot. Semi-final losers flow into the
        // 3rd-place play-off. This runs every sync so any newly settled match
        // updates downstream fixtures immediately.
        try {
          const advanced = await advanceKnockoutBracket(supabaseAdmin);
          if (advanced.length) {
            updated += advanced.length;
            details.push({ advanced });
          }
        } catch (e) {
          console.warn("[sync-results] knockout advance failed", e);
        }

        return Response.json({ ok: true, parsed: matches.length, updated, details });
      },

      GET: async () =>
        new Response("Use POST to sync results", {
          status: 405,
          headers: { Allow: "POST" },
        }),
    },
  },
});

// Feeder map: each downstream fixture is filled from two upstream matches.
// `from`: [homeFeederMatchNumber, awayFeederMatchNumber]
// `pick`: "winner" (default) or "loser" — used for the 3rd-place play-off.
type FeederPick = "winner" | "loser";
type FeederRule = {
  home: { from: number; pick: FeederPick };
  away: { from: number; pick: FeederPick };
};
const KNOCKOUT_FEEDERS: Record<number, FeederRule> = {
  // Round of 16 — official bracket (matches the BBC knockout schedule):
  // 89 CAN/MAR, 90 PAR/FRA, 91 BRA/NOR, 92 MEX/ENG,
  // 93 POR/SPA, 94 USA/BEL, 95 ARG/EGY, 96 SUI/COL.
  89: { home: { from: 73, pick: "winner" }, away: { from: 76, pick: "winner" } },
  90: { home: { from: 75, pick: "winner" }, away: { from: 78, pick: "winner" } },
  91: { home: { from: 74, pick: "winner" }, away: { from: 77, pick: "winner" } },
  92: { home: { from: 79, pick: "winner" }, away: { from: 80, pick: "winner" } },
  93: { home: { from: 84, pick: "winner" }, away: { from: 83, pick: "winner" } },
  94: { home: { from: 82, pick: "winner" }, away: { from: 81, pick: "winner" } },
  95: { home: { from: 87, pick: "winner" }, away: { from: 86, pick: "winner" } },
  96: { home: { from: 85, pick: "winner" }, away: { from: 88, pick: "winner" } },
  // Quarter-finals — official bracket crosses (per BBC):
  // 97 Boston = W89+W90, 98 LA = W93+W94, 99 Miami = W91+W92, 100 KC = W95+W96.
  97: { home: { from: 89, pick: "winner" }, away: { from: 90, pick: "winner" } },
  98: { home: { from: 93, pick: "winner" }, away: { from: 94, pick: "winner" } },
  99: { home: { from: 91, pick: "winner" }, away: { from: 92, pick: "winner" } },
  100: { home: { from: 95, pick: "winner" }, away: { from: 96, pick: "winner" } },
  // Semi-finals
  101: { home: { from: 97, pick: "winner" }, away: { from: 98, pick: "winner" } },
  102: { home: { from: 99, pick: "winner" }, away: { from: 100, pick: "winner" } },
  // 3rd-place play-off (losers of the semi-finals)
  103: { home: { from: 101, pick: "loser" }, away: { from: 102, pick: "loser" } },
  // Final (winners of the semi-finals)
  104: { home: { from: 101, pick: "winner" }, away: { from: 102, pick: "winner" } },
};

type AdvanceFixture = {
  id: string;
  match_number: number;
  team_home: string;
  team_away: string;
  home_score: number | null;
  away_score: number | null;
  winner_team: string | null;
};

function pickTeam(f: AdvanceFixture, pick: FeederPick): string | null {
  if (f.home_score === null || f.away_score === null) return null;
  if (f.home_score === f.away_score) {
    if (!f.winner_team) return null;
    if (pick === "winner") return f.winner_team;
    if (norm(f.winner_team) === norm(f.team_home)) return f.team_away;
    if (norm(f.winner_team) === norm(f.team_away)) return f.team_home;
    return null;
  }
  const homeWon = f.home_score > f.away_score;
  if (pick === "winner") return homeWon ? f.team_home : f.team_away;
  return homeWon ? f.team_away : f.team_home;
}

async function advanceKnockoutBracket(
  supabaseAdmin: typeof import("@/integrations/supabase/client.server")["supabaseAdmin"],
): Promise<Array<{ match_number: number; team_home?: string; team_away?: string }>> {
  const { data, error } = await supabaseAdmin
    .from("fixtures")
    .select("id, match_number, team_home, team_away, home_score, away_score, winner_team")
    .gte("match_number", 73)
    .lte("match_number", 104);
  if (error || !data) return [];
  const byNum = new Map<number, AdvanceFixture>();
  data.forEach((f) => byNum.set(f.match_number, f as AdvanceFixture));

  const results: Array<{ match_number: number; team_home?: string; team_away?: string }> = [];
  // Iterate rounds in order so a freshly-filled R16 winner can immediately
  // propagate into a QF in the same pass (only matters at round boundaries).
  const order = Object.keys(KNOCKOUT_FEEDERS)
    .map(Number)
    .sort((a, b) => a - b);
  for (const num of order) {
    const target = byNum.get(num);
    const rule = KNOCKOUT_FEEDERS[num];
    if (!target) continue;
    const patch: { team_home?: string; team_away?: string } = {};

    const homeFeeder = byNum.get(rule.home.from);
    if (homeFeeder && isPlaceholderTeam(target.team_home)) {
      const t = pickTeam(homeFeeder, rule.home.pick);
      if (t) patch.team_home = t;
    }
    const awayFeeder = byNum.get(rule.away.from);
    if (awayFeeder && isPlaceholderTeam(target.team_away)) {
      const t = pickTeam(awayFeeder, rule.away.pick);
      if (t) patch.team_away = t;
    }

    if (Object.keys(patch).length === 0) continue;
    const { error: upErr } = await supabaseAdmin
      .from("fixtures")
      .update(patch)
      .eq("id", target.id);
    if (upErr) {
      console.warn(`[advance] update ${num} failed`, upErr.message);
      continue;
    }
    // Update local cache so downstream rounds see the new team in this pass.
    if (patch.team_home) target.team_home = patch.team_home;
    if (patch.team_away) target.team_away = patch.team_away;
    results.push({ match_number: num, ...patch });
  }
  return results;
}