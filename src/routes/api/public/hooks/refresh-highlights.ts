import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type FixtureRow = {
  id: string;
  team_home: string;
  team_away: string;
  kickoff_at: string;
};

// Variants for tricky team names so title matching works regardless of how
// ITV writes them (e.g. "Türkiye" vs "Turkey", "USA" vs "United States").
const TEAM_ALIASES: Record<string, string[]> = {
  "USA": ["usa", "united states", "u.s."],
  "South Korea": ["south korea", "korea republic", "republic of korea"],
  "Czechia": ["czechia", "czech republic"],
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
  // ITV titles real match highlights as "HIGHLIGHTS - X v Y | ..."
  // We require the word "highlights" AND exclude retro/qualifier uploads so
  // we don't grab a reaction video or a 1979 retro match by accident.
  if (!t.includes("highlight")) return false;
  if (t.includes("retro")) return false;
  if (t.includes("qualifier")) return false;
  if (t.includes("2022") || t.includes("2018") || t.includes("2014")) return false;
  const homeHit = aliasesFor(home).some((a) => t.includes(a));
  const awayHit = aliasesFor(away).some((a) => t.includes(a));
  return homeHit && awayHit;
}

type ItvVideo = { id: string; title: string };

const ITV_SPORT_CHANNEL_ID = "UCBzDz6beXDfMtfxQdEutD_w";
// Uploads playlist for a channel is the channel ID with "UC" → "UU".
const ITV_UPLOADS_PLAYLIST = "UU" + ITV_SPORT_CHANNEL_ID.slice(2);

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: Array<{
    snippet?: {
      title?: string;
      resourceId?: { videoId?: string };
    };
  }>;
};

async function fetchItvSportVideos(maxPages = 20): Promise<ItvVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured");

  const videos: ItvVideo[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  let page = 0;

  while (page < maxPages) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("playlistId", ITV_UPLOADS_PLAYLIST);
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`YouTube API failed [${res.status}]: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as PlaylistItemsResponse;
    for (const it of data.items ?? []) {
      const id = it.snippet?.resourceId?.videoId;
      const title = it.snippet?.title;
      if (id && title && !seen.has(id)) {
        seen.add(id);
        videos.push({ id, title });
      }
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
    page += 1;
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

        // Completed fixtures past full-time (2h after kickoff).
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { data: fixtures, error } = await supabase
          .from("fixtures")
          .select("id, team_home, team_away, kickoff_at, highlights_url")
          .not("home_score", "is", null)
          .not("away_score", "is", null)
          .lt("kickoff_at", twoHoursAgo);

        if (error) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }

        const rows = (fixtures ?? []) as Array<FixtureRow & { highlights_url: string | null }>;

        let videos: ItvVideo[];
        try {
          videos = await fetchItvSportVideos();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ success: false, error: msg }, { status: 502 });
        }

        const results: Array<{ id: string; team_home: string; team_away: string; found: boolean; title?: string }> = [];

        for (const fx of rows) {
          const match = videos.find((v) => titleMatchesFixture(v.title, fx.team_home, fx.team_away));
          const url = match ? `https://www.youtube.com/embed/${match.id}` : null;
          await supabase
            .from("fixtures")
            .update({
              highlights_url: url,
              highlights_checked_at: new Date().toISOString(),
            })
            .eq("id", fx.id);
          results.push({ id: fx.id, team_home: fx.team_home, team_away: fx.team_away, found: !!match, title: match?.title });
        }

        const found = results.filter((r) => r.found).length;
        return Response.json({
          success: true,
          channel_videos: videos.length,
          scanned: results.length,
          found,
          missing: results.filter((r) => !r.found).map((r) => `${r.team_home} v ${r.team_away}`),
        });
      },
    },
  },
});