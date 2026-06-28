import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const SCOREBOARD_API_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const SUMMARY_API_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary";

// Loose copy of the team normaliser used in sync-results — keeps this route
// self-contained without pulling in route-file exports.
const TEAM_ALIASES: Record<string, string> = {
  alg: "algeria", arg: "argentina", aus: "australia", aut: "austria",
  bel: "belgium", bih: "bosniaandherzegovina", bosniaherzegovina: "bosniaandherzegovina",
  bra: "brazil", can: "canada", civ: "ivorycoast", col: "colombia", cro: "croatia",
  cuw: "curacao", cze: "czechia", cod: "drcongo", congodr: "drcongo",
  ecu: "ecuador", egy: "egypt", eng: "england", fra: "france", ger: "germany",
  gha: "ghana", hai: "haiti", irn: "iran", irq: "iraq", jpn: "japan", jor: "jordan",
  mar: "morocco", mex: "mexico", ned: "netherlands", nor: "norway", nzl: "newzealand",
  pan: "panama", par: "paraguay", por: "portugal", qat: "qatar", ksa: "saudiarabia",
  sco: "scotland", sen: "senegal", rsa: "southafrica", kor: "southkorea",
  esp: "spain", swe: "sweden", sui: "switzerland", tun: "tunisia", tur: "turkiye",
  uru: "uruguay", usa: "usa", unitedstates: "usa", uzb: "uzbekistan",
};

function norm(s: string | null | undefined): string {
  const key = (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return TEAM_ALIASES[key] ?? key;
}

type FixtureRow = {
  id: string;
  team_home: string;
  team_away: string;
  kickoff_at: string;
  espn_event_id: string | null;
};

type EspnEvent = {
  id?: string;
  date?: string;
  competitions?: Array<{
    competitors?: Array<{
      homeAway?: string;
      team?: { displayName?: string; abbreviation?: string };
    }>;
  }>;
};

type ScoringPlay = {
  id?: string | number;
  type?: { text?: string; abbreviation?: string };
  text?: string;
  clock?: { value?: number; displayValue?: string };
  period?: { number?: number };
  team?: { id?: string };
  athletesInvolved?: Array<{ displayName?: string }>;
};

type EspnSummary = {
  scoringPlays?: ScoringPlay[];
  keyEvents?: ScoringPlay[];
  header?: {
    competitions?: Array<{
      competitors?: Array<{ id?: string; homeAway?: string }>;
    }>;
  };
};

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Find the ESPN event id for a given fixture by scanning the scoreboard for its kickoff date (±1 day). */
async function findEspnEventId(fx: FixtureRow): Promise<string | null> {
  if (fx.espn_event_id) return fx.espn_event_id;
  const koDate = new Date(fx.kickoff_at);
  const candidates = [-1, 0, 1].map((offset) => {
    const d = new Date(koDate.getTime() + offset * 24 * 60 * 60 * 1000);
    return dateKey(d.toISOString());
  });
  const fh = norm(fx.team_home);
  const fa = norm(fx.team_away);
  for (const day of candidates) {
    try {
      const res = await fetch(`${SCOREBOARD_API_BASE}?dates=${day}`);
      if (!res.ok) continue;
      const data = (await res.json()) as { events?: EspnEvent[] };
      for (const ev of data.events ?? []) {
        const comp = ev.competitions?.[0];
        const home = comp?.competitors?.find((c) => c.homeAway === "home");
        const away = comp?.competitors?.find((c) => c.homeAway === "away");
        const eh = norm(home?.team?.displayName ?? home?.team?.abbreviation ?? "");
        const ea = norm(away?.team?.displayName ?? away?.team?.abbreviation ?? "");
        if ((eh === fh && ea === fa) || (eh === fa && ea === fh)) {
          return ev.id ?? null;
        }
      }
    } catch {
      // skip
    }
  }
  return null;
}

/** Parse a minute number from ESPN clock data. Returns null for unknown. */
function minuteFromPlay(play: ScoringPlay): { minute: number; display: string } | null {
  const display = (play.clock?.displayValue ?? "").trim();
  // Clock.value is seconds elapsed within the current period. ESPN sets
  // period.number = 1 (first half), 2 (second half), 3 (ET first half),
  // 4 (ET second half), 5 (penalty shootout).
  const period = play.period?.number ?? 0;
  // displayValue is the most reliable representation. ESPN formats vary:
  // "7'", "45'+2'", "45+2'", "90'+4'", "112'". Strip apostrophes before parsing.
  const cleaned = display.replace(/'/g, "");
  const m = /^(\d+)(?:\+(\d+))?/.exec(cleaned);
  if (m) {
    const base = Number(m[1]);
    const added = m[2] ? Number(m[2]) : 0;
    return { minute: base + added, display: display || `${base + added}'` };
  }
  // Fallback to clock.value (seconds) + period offset.
  const secs = Number(play.clock?.value ?? NaN);
  if (Number.isFinite(secs)) {
    let baseOffset = 0;
    if (period === 2) baseOffset = 45;
    else if (period === 3) baseOffset = 90;
    else if (period === 4) baseOffset = 105;
    const minute = baseOffset + Math.floor(secs / 60);
    return { minute, display: `${minute}'` };
  }
  return null;
}

function isGoalPlay(play: ScoringPlay & { scoringPlay?: boolean; shootout?: boolean }): boolean {
  if (play.shootout) return false;
  if (play.scoringPlay === true) {
    const t = (play.type?.text ?? "").toLowerCase();
    // Exclude shootout entries even if scoringPlay flagged.
    if (t.includes("shootout")) return false;
    return true;
  }
  const t = (play.type?.text ?? play.type?.abbreviation ?? "").toLowerCase();
  if (t.includes("goal")) return true;
  if (t.includes("penalty - scored")) return true;
  if (t.includes("own goal")) return true;
  // Exclude shootout penalties from goal timeline.
  return false;
}

export const Route = createFileRoute("/api/public/hooks/sync-fixture-goals")({
  server: {
    handlers: {
      POST: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        // Pull every finished fixture that hasn't been goal-synced yet,
        // OR that finished in the last 6 hours (re-sync in case ESPN updated
        // the timeline post-match).
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: fixtures, error } = await supabase
          .from("fixtures")
          .select("id, team_home, team_away, kickoff_at, espn_event_id, goals_synced_at, home_score, away_score")
          .not("home_score", "is", null)
          .not("away_score", "is", null)
          .or(`goals_synced_at.is.null,kickoff_at.gte.${sixHoursAgo}`);

        if (error) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }

        const rows = (fixtures ?? []) as Array<FixtureRow & {
          goals_synced_at: string | null;
          home_score: number | null;
          away_score: number | null;
        }>;

        const results: Array<Record<string, unknown>> = [];
        let totalGoals = 0;

        for (const fx of rows) {
          try {
            const eventId = await findEspnEventId(fx);
            if (!eventId) {
              results.push({ id: fx.id, skipped: "no_event_id" });
              continue;
            }
            if (!fx.espn_event_id) {
              await supabase.from("fixtures").update({ espn_event_id: eventId }).eq("id", fx.id);
            }

            const sumRes = await fetch(`${SUMMARY_API_BASE}?event=${eventId}`);
            if (!sumRes.ok) {
              results.push({ id: fx.id, error: `summary ${sumRes.status}` });
              continue;
            }
            const summary = (await sumRes.json()) as EspnSummary;
            const rawPlays =
              (summary.scoringPlays && summary.scoringPlays.length > 0
                ? summary.scoringPlays
                : summary.keyEvents) ?? [];
            const plays = rawPlays.filter(isGoalPlay);

            // Map ESPN team id → home/away
            const comp = summary.header?.competitions?.[0];
            const homeId = comp?.competitors?.find((c) => c.homeAway === "home")?.id ?? null;
            const awayId = comp?.competitors?.find((c) => c.homeAway === "away")?.id ?? null;

            // Wipe existing rows for this fixture and reinsert (idempotent;
            // ESPN sometimes amends scorer/minute after the match).
            await supabase.from("fixture_goals").delete().eq("fixture_id", fx.id);

            const inserts: Array<{
              fixture_id: string;
              minute: number;
              minute_display: string;
              side: "home" | "away";
              scorer: string | null;
              scoring_play_id: string;
            }> = [];
            plays.forEach((p, idx) => {
              const m = minuteFromPlay(p);
              if (!m) return;
              const teamId = p.team?.id ?? null;
              const side: "home" | "away" | null =
                teamId && homeId && teamId === homeId
                  ? "home"
                  : teamId && awayId && teamId === awayId
                  ? "away"
                  : null;
              if (!side) return;
              inserts.push({
                fixture_id: fx.id,
                minute: m.minute,
                minute_display: m.display,
                side,
                scorer: p.athletesInvolved?.[0]?.displayName ?? null,
                scoring_play_id: String(p.id ?? `${eventId}-${idx}`),
              });
            });

            if (inserts.length) {
              const { error: insErr } = await supabase.from("fixture_goals").insert(inserts);
              if (insErr) {
                results.push({ id: fx.id, error: insErr.message });
                continue;
              }
            }
            await supabase
              .from("fixtures")
              .update({ goals_synced_at: new Date().toISOString() })
              .eq("id", fx.id);
            totalGoals += inserts.length;
            results.push({
              id: fx.id,
              match: `${fx.team_home} v ${fx.team_away}`,
              goals: inserts.length,
            });
          } catch (e) {
            results.push({ id: fx.id, error: String(e) });
          }
        }

        return Response.json({
          success: true,
          scanned: rows.length,
          goals_inserted: totalGoals,
          results,
        });
      },
      GET: async () =>
        new Response("POST to sync goal timings", { status: 405, headers: { Allow: "POST" } }),
    },
  },
});