import { createFileRoute } from "@tanstack/react-router";
import { ESPN_TEAMS, scrapeEspnResults, parseEspnResultsMarkdown } from "@/lib/team-form.functions";

export const Route = createFileRoute("/api/public/hooks/debug-team-form")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const team = url.searchParams.get("team") ?? "Cape Verde";
        const espn = ESPN_TEAMS[team];
        if (!espn) return new Response("unknown team", { status: 404 });
        const markdown = await scrapeEspnResults(espn.id, espn.slug);
        const matches = parseEspnResultsMarkdown(markdown, espn.id);
        return new Response(JSON.stringify({ team, matches, markdown }, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});