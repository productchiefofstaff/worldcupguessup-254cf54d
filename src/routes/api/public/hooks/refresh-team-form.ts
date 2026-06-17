import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  ESPN_TEAMS,
  buildFixtureFormMatches,
  mergeTeamFormMatches,
  scrapeEspnResults,
  parseEspnResultsMarkdown,
  type CompletedFixtureForForm,
} from "@/lib/team-form.functions";

export const Route = createFileRoute("/api/public/hooks/refresh-team-form")({
  server: {
    handlers: {
      POST: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const results: { team: string; ok: boolean; error?: string }[] = [];
        const { data: completedFixtures, error: fixturesError } = await supabase
          .from("fixtures")
          .select("team_home, team_away, kickoff_at, home_score, away_score")
          .not("home_score", "is", null)
          .not("away_score", "is", null);

        if (fixturesError) {
          return Response.json(
            { success: false, error: fixturesError.message },
            { status: 500 },
          );
        }
        const fixtureRows = (completedFixtures ?? []) as CompletedFixtureForForm[];

        const { data: cachedRows, error: cacheError } = await supabase
          .from("team_form_cache")
          .select("team_name, matches");

        if (cacheError) {
          return Response.json(
            { success: false, error: cacheError.message },
            { status: 500 },
          );
        }

        const cachedByTeam = new Map(
          ((cachedRows ?? []) as Array<{ team_name: string; matches: unknown }>).map((row) => [
            row.team_name,
            Array.isArray(row.matches) ? row.matches : [],
          ]),
        );

        for (const [teamName, espn] of Object.entries(ESPN_TEAMS)) {
          try {
            const cachedMatches = cachedByTeam.get(teamName);
            const scrapedMatches = cachedMatches
              ? cachedMatches
              : parseEspnResultsMarkdown(await scrapeEspnResults(espn.id, espn.slug), espn.id);
            const matches = mergeTeamFormMatches(
              scrapedMatches as ReturnType<typeof parseEspnResultsMarkdown>,
              buildFixtureFormMatches(fixtureRows, teamName),
            );
            await supabase.from("team_form_cache").upsert({
              team_name: teamName,
              external_team_id: espn.id,
              matches,
              fetched_at: new Date().toISOString(),
            });
            results.push({ team: teamName, ok: true });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("refresh-team-form error", teamName, msg);
            results.push({ team: teamName, ok: false, error: msg });
          }
        }

        const succeeded = results.filter((r) => r.ok).length;
        return new Response(
          JSON.stringify({
            success: true,
            total: results.length,
            succeeded,
            failed: results.length - succeeded,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});