import { createFileRoute } from "@tanstack/react-router";
import Firecrawl from "@mendable/firecrawl-js";

const SCOREBOARD_PROMPT =
  "From this ESPN FIFA World Cup scoreboard page, extract every match shown. Return {matches:[...]}. Each match: team_home (team listed first), team_away (team listed second), status_label (EXACT short status shown next to the match — 'FT','AET','Pens','HT',\"45'\",\"78'\",'LIVE', a kickoff clock like '8:00 PM', or 'Postponed'; null if none — DO NOT invent), status ('finished' ONLY if status_label is exactly FT/AET/Pens/Final/Full Time; otherwise 'live' or 'scheduled'), home_score (integer 90-min score; null if not shown — exclude ET/pens), away_score, stage. kickoff_iso is not required — leave null.";

// ESPN scoreboard shows ONE day at a time. We hit today + yesterday (UTC)
// so matches finishing late local-time are still picked up promptly.
function scoreboardUrls(): string[] {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const base = "https://www.espn.co.uk/football/scoreboard/_/league/fifa.world";
  return [base, `${base}/date/${fmt(yesterday)}`, `${base}/date/${fmt(today)}`];
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

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
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
            scoreboardUrls().map((url) =>
              firecrawl.scrape(url, {
                formats: [{ type: "json", prompt: SCOREBOARD_PROMPT }],
                onlyMainContent: true,
                waitFor: 3000,
              }),
            ),
          );

          matches = results.flatMap(
            (result) =>
              (result as unknown as { json?: { matches?: SourceMatch[] } })
                .json?.matches ?? [],
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
              ? candidates.find(
                  (f) =>
                    (norm(f.team_home) === "tbd" || norm(f.team_away) === "tbd") &&
                    m.stage &&
                    f.stage
                      .toLowerCase()
                      .includes((m.stage ?? "").toLowerCase().replace("group ", "")),
                ) ||
                candidates
                  .slice()
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
            Number.isInteger(srcHome) &&
            Number.isInteger(srcAway)
          ) {
            patch.home_score = srcHome as number;
            patch.away_score = srcAway as number;
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