import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  ESPN_TEAMS,
  scrapeEspnResults,
  parseEspnResultsMarkdown,
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

        for (const [teamName, espn] of Object.entries(ESPN_TEAMS)) {
          try {
            const markdown = await scrapeEspnResults(espn.id, espn.slug);
            const matches = parseEspnResultsMarkdown(markdown, espn.id);
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