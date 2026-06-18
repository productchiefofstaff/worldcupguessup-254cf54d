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

// Variants for tricky team names so title matching works regardless of how
// ITV writes them (e.g. "Türkiye" vs "Turkey", "USA" vs "United States").
const TEAM_ALIASES: Record<string, string[]> = {
  "USA": ["usa", "united states", "u.s."],
  "South Korea": ["south korea", "korea republic", "republic of korea"],
  "North Korea": ["north korea", "korea dpr", "dpr korea"],
  "Turkiye": ["turkiye", "türkiye", "turkey"],
  "Ivory Coast": ["ivory coast", "côte d'ivoire", "cote d'ivoire"],
  "Curacao": ["curacao", "curaçao"],
  "DR Congo": ["dr congo", "democratic republic of congo", "congo dr"],
  "Cape Verde": ["cape verde", "cabo verde"],
};

function aliasesFor(team: string): string[] {
  return (TEAM_ALIASES[team] ?? [team.toLowerCase()]).map((s) => s.toLowerCase());
}

function titleMatchesFixture(title: string, home: string, away: string): boolean {
  const t = title.toLowerCase();
  if (!t.includes("highlight")) return false;
  const homeHit = aliasesFor(home).some((a) => t.includes(a));
  const awayHit = aliasesFor(away).some((a) => t.includes(a));
  return homeHit && awayHit;
}

type ItvVideo = { id: string; title: string };

async function fetchItvSportVideos(): Promise<ItvVideo[]> {
  // Fetch the raw HTML of the ITV Sport channel "videos" tab. YouTube embeds
  // the initial video list in ytInitialData inside a <script>; we extract
  // video IDs and their titles via regex (no JS execution needed).
  const res = await fetch("https://www.youtube.com/@itvsport/videos", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-GB,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`YouTube channel fetch failed [${res.status}]`);
  }
  const html = await res.text();

  // Match: "videoId":"XXXXXXXXXXX", ... "title":{"runs":[{"text":"..."}]}
  // or "title":{"simpleText":"..."}
  const videos: ItvVideo[] = [];
  const seen = new Set<string>();
  const re =
    /"videoId":"([A-Za-z0-9_-]{11})"[^}]{0,400}?"title":\{(?:"runs":\[\{"text":"([^"]+)"|"simpleText":"([^"]+)")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const title = (m[2] ?? m[3] ?? "")
      .replace(/\\u0026/g, "&")
      .replace(/\\"/g, '"');
    if (title) videos.push({ id, title });
  }
  return videos;
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