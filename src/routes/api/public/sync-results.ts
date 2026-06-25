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
};

type EspnCompetitor = {
  homeAway?: string;
  score?: string;
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
    u.startsWith("LOSER ")
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
    const completed = statusType?.completed === true || statusType?.state === "post";

    return [
      {
        kickoff_iso: event.date ?? null,
        team_home: home.team?.displayName ?? home.team?.abbreviation ?? null,
        team_away: away.team?.displayName ?? away.team?.abbreviation ?? null,
        status_label: statusLabel,
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
          .select("id, match_number, stage, team_home, team_away, kickoff_at, home_score, away_score, live_home_score, live_away_score, live_status_label");
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
          if (
            mh && ma &&
            norm(fixture.team_home) === ma &&
            norm(fixture.team_away) === mh
          ) {
            srcHome = m.away_score;
            srcAway = m.home_score;
          }

          const patch: {
            team_home?: string;
            team_away?: string;
            home_score?: number;
            away_score?: number;
            live_home_score?: number | null;
            live_away_score?: number | null;
            live_status_label?: string | null;
            live_updated_at?: string | null;
          } = {};

          // Fill in knockout teams as they're decided
          if (
            isPlaceholderTeam(fixture.team_home) &&
            m.team_home &&
            !isPlaceholderTeam(m.team_home)
          ) {
            patch.team_home = m.team_home;
          }
          if (
            isPlaceholderTeam(fixture.team_away) &&
            m.team_away &&
            !isPlaceholderTeam(m.team_away)
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
          const labelConfirmsFinished =
            ftLabel === "ft" ||
            ftLabel === "aet" ||
            ftLabel === "pens" ||
            ftLabel === "final" ||
            ftLabel === "full time" ||
            ftLabel === "full-time";
          if (
            !alreadyHasScore &&
            m.status === "finished" &&
            labelConfirmsFinished &&
            minutesSinceKickoff >= 110 &&
            Number.isInteger(srcHome) &&
            Number.isInteger(srcAway)
          ) {
            patch.home_score = srcHome as number;
            patch.away_score = srcAway as number;
            // Clear live state once the final score is settled.
            patch.live_home_score = null;
            patch.live_away_score = null;
            patch.live_status_label = null;
            patch.live_updated_at = null;
          } else if (
            !alreadyHasScore &&
            m.status === "finished" &&
            (!labelConfirmsFinished || minutesSinceKickoff < 110)
          ) {
            console.warn(
              `[sync-results] rejecting 'finished' for match ${fixture.match_number} (${fixture.team_home} v ${fixture.team_away}) — label='${m.status_label ?? ""}', minsSinceKO=${minutesSinceKickoff.toFixed(0)}`,
            );
          }

          // Track in-progress live scores so the UI can show the current
          // scoreline and minute without affecting prediction settlement.
          if (m.status === "live" && !alreadyHasScore) {
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