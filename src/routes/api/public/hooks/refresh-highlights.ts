import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type FixtureRow = {
  id: string;
  team_home: string;
  team_away: string;
  kickoff_at: string;
};

function extractYouTubeId(url: string): string | null {
  const m =
    url.match(/youtube\.com\/watch\?[^\s]*v=([A-Za-z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/) ||
    url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function firecrawlSearch(query: string): Promise<Array<{ url: string; title?: string }>> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit: 10 }),
  });
  if (!res.ok) {
    throw new Error(`Firecrawl search failed [${res.status}]: ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: { web?: Array<{ url: string; title?: string }> } | Array<{ url: string; title?: string }> };
  const data = body.data;
  if (Array.isArray(data)) return data;
  return data?.web ?? [];
}

async function findHighlightsUrl(fixture: FixtureRow): Promise<string | null> {
  const { team_home, team_away } = fixture;
  // Try ITV Sport channel first, then broaden.
  const queries = [
    `site:youtube.com/@itvsport "${team_home}" "${team_away}" highlights`,
    `site:youtube.com "${team_home}" v "${team_away}" highlights World Cup`,
    `site:youtube.com "${team_home}" "${team_away}" highlights`,
  ];
  for (const q of queries) {
    try {
      const results = await firecrawlSearch(q);
      for (const r of results) {
        const id = extractYouTubeId(r.url);
        if (!id) continue;
        const title = (r.title ?? "").toLowerCase();
        const home = team_home.toLowerCase();
        const away = team_away.toLowerCase();
        // Require both team names in the title to avoid mismatched videos.
        if (title.includes(home) && title.includes(away)) {
          return `https://www.youtube.com/embed/${id}`;
        }
      }
    } catch (err) {
      console.error("highlights search error", q, err);
    }
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/refresh-highlights")({
  server: {
    handlers: {
      POST: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        // Completed fixtures with no highlights yet, or last checked >24h ago,
        // and at least 2h past kickoff (gives the broadcaster time to upload).
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: fixtures, error } = await supabase
          .from("fixtures")
          .select("id, team_home, team_away, kickoff_at, highlights_url, highlights_checked_at")
          .not("home_score", "is", null)
          .not("away_score", "is", null)
          .lt("kickoff_at", twoHoursAgo)
          .or(`highlights_url.is.null,highlights_checked_at.lt.${oneDayAgo}`)
          .limit(20);

        if (error) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }

        const rows = (fixtures ?? []) as Array<FixtureRow & { highlights_url: string | null }>;
        const results: Array<{ id: string; found: boolean }> = [];

        for (const fx of rows) {
          if (fx.highlights_url) {
            results.push({ id: fx.id, found: true });
            continue;
          }
          const url = await findHighlightsUrl(fx);
          await supabase
            .from("fixtures")
            .update({
              highlights_url: url,
              highlights_checked_at: new Date().toISOString(),
            })
            .eq("id", fx.id);
          results.push({ id: fx.id, found: !!url });
        }

        const found = results.filter((r) => r.found).length;
        return Response.json({
          success: true,
          scanned: results.length,
          found,
        });
      },
    },
  },
});