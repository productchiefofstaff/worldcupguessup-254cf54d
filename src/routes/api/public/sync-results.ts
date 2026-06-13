import { createFileRoute } from "@tanstack/react-router";
import Firecrawl from "@mendable/firecrawl-js";

const SOURCE_URLS = [
  "https://www.espn.com/soccer/schedule/_/league/fifa.world",
  "https://www.espn.com/soccer/results/_/league/fifa.world",
] as const;

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

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

export const Route = createFileRoute("/api/public/sync-results")({
  server: {
    handlers: {
      POST: async () => {
        const apiKey = process.env.FIRECRAWL_API_KEY;
        if (!apiKey) {
          return Response.json(
            { error: "FIRECRAWL_API_KEY missing" },
            { status: 500 },
          );
        }

        let matches: SourceMatch[] = [];
        try {
          const firecrawl = new Firecrawl({ apiKey });
          const results = await Promise.all(
            SOURCE_URLS.map((url) =>
              firecrawl.scrape(url, {
                formats: [
                  {
                    type: "json",
                    prompt:
                      "From this ESPN FIFA World Cup schedule/results page, extract every football match listed. Return an object with a 'matches' array. Each match has: kickoff_iso (ISO 8601 datetime, prefer UTC; null if unknown), team_home (full nation name as shown, or null/'TBD'), team_away, status_label (copy the EXACT short status text shown on the page next to the match, e.g. 'FT', 'AET', 'Pens', 'HT', \"45'\", \"78'\", 'LIVE', a kickoff time like '8:00 PM', or 'Postponed'; null if no such label is visible — DO NOT invent or infer this), status (one of 'scheduled','live','finished' — return 'finished' ONLY when status_label is exactly 'FT', 'AET', 'Pens', 'Final', or 'Full Time'. A visible scoreline alone is NOT enough — in-progress matches also show a score. If unsure, return 'live'), home_score (the 90-minute full-time score as an integer; null if the match is not yet finished or you cannot determine the 90-minute score — DO NOT include goals scored in extra time or penalty shootouts), away_score (same rules), stage (e.g. 'Group A', 'Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Third-place Play-off', 'Final'). If a knockout match shows specific team names, return those teams.",
                  },
                ],
                onlyMainContent: true,
                waitFor: 2000,
              }),
            ),
          );

          matches = results.flatMap((result) =>
            ((result as unknown as { json?: { matches?: SourceMatch[] } }).json?.matches ?? []),
          );
        } catch (e) {
          console.error("Firecrawl scrape failed", e);
          return Response.json(
            { error: "scrape_failed", detail: String(e) },
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
          .select("id, match_number, stage, team_home, team_away, kickoff_at, home_score, away_score");
        if (fxErr || !fixtures) {
          return Response.json(
            { error: "db_read_failed", detail: fxErr?.message },
            { status: 500 },
          );
        }

        let updated = 0;
        const details: Array<Record<string, unknown>> = [];

        for (const m of matches) {
          if (!m.kickoff_iso) continue;
          const mTs = new Date(m.kickoff_iso).getTime();
          if (!Number.isFinite(mTs)) continue;

          // Find best matching fixture: closest kickoff within 6h on the same UTC day,
          // preferring exact team match, then TBD slot in the same stage.
          const sameDay = fixtures.filter((f) => {
            const fTs = new Date(f.kickoff_at).getTime();
            return Math.abs(fTs - mTs) <= 6 * 60 * 60 * 1000;
          });
          if (!sameDay.length) continue;

          const mh = norm(m.team_home);
          const ma = norm(m.team_away);

          let fixture =
            sameDay.find(
              (f) => norm(f.team_home) === mh && norm(f.team_away) === ma,
            ) ||
            sameDay.find(
              (f) =>
                (norm(f.team_home) === "tbd" || norm(f.team_away) === "tbd") &&
                m.stage &&
                f.stage.toLowerCase().includes(
                  (m.stage ?? "").toLowerCase().replace("group ", ""),
                ),
            ) ||
            sameDay
              .slice()
              .sort(
                (a, b) =>
                  Math.abs(new Date(a.kickoff_at).getTime() - mTs) -
                  Math.abs(new Date(b.kickoff_at).getTime() - mTs),
              )[0];

          if (!fixture) continue;

          const patch: {
            team_home?: string;
            team_away?: string;
            home_score?: number;
            away_score?: number;
          } = {};

          // Fill in knockout teams as they're decided
          if (
            norm(fixture.team_home) === "tbd" &&
            m.team_home &&
            norm(m.team_home) !== "tbd"
          ) {
            patch.team_home = m.team_home;
          }
          if (
            norm(fixture.team_away) === "tbd" &&
            m.team_away &&
            norm(m.team_away) !== "tbd"
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
            Number.isInteger(m.home_score) &&
            Number.isInteger(m.away_score)
          ) {
            patch.home_score = m.home_score as number;
            patch.away_score = m.away_score as number;
          } else if (
            !alreadyHasScore &&
            m.status === "finished" &&
            (!labelConfirmsFinished || minutesSinceKickoff < 110)
          ) {
            console.warn(
              `[sync-results] rejecting 'finished' for match ${fixture.match_number} (${fixture.team_home} v ${fixture.team_away}) — label='${m.status_label ?? ""}', minsSinceKO=${minutesSinceKickoff.toFixed(0)}`,
            );
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