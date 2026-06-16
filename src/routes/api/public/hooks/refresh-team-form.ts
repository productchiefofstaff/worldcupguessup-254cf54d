import { createFileRoute } from "@tanstack/react-router";
import {
  ESPN_TEAMS,
  scrapeEspnResults,
  parseEspnResultsMarkdown,
} from "@/lib/team-form.functions";

// Daily cron target. Refreshes the team_form_cache for every WC team so the
// Fixtures page never has to scrape on user requests.
export const Route = createFileRoute("/api/public/hooks/refresh-team-form")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const names = Object.keys(ESPN_TEAMS);
        const results: { team: string; ok: boolean; error?: string }[] = [];

        // Modest concurrency to avoid hammering Firecrawl.
        const CONCURRENCY = 4;
        let idx = 0;
        async function worker() {
          while (idx < names.length) {
            const i = idx++;
            const name = names[i];
            const espn = ESPN_TEAMS[name];
            try {
              const md = await scrapeEspnResults(espn.id, espn.slug);
              const matches = parseEspnResultsMarkdown(md, espn.id);
              const { error } = await supabaseAdmin
                .from("team_form_cache")
                .upsert({
                  team_name: name,
                  external_team_id: espn.id,
                  matches,
                  fetched_at: new Date().toISOString(),
                });
              if (error) throw error;
              results.push({ team: name, ok: true });
            } catch (err) {
              results.push({
                team: name,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
        await Promise.all(
          Array.from({ length: CONCURRENCY }, () => worker()),
        );

        const ok = results.filter((r) => r.ok).length;
        return Response.json({
          refreshed: ok,
          failed: results.length - ok,
          results,
        });
      },
    },
  },
});