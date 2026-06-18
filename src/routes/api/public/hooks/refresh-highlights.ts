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
const INNERTUBE_CTX = {
  client: {
    clientName: "WEB",
    clientVersion: "2.20240801.00.00",
    hl: "en-GB",
    gl: "GB",
  },
};

function collectLockups(node: unknown, out: Array<Record<string, unknown>>): void {
  if (Array.isArray(node)) {
    for (const v of node) collectLockups(v, out);
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.lockupViewModel && typeof obj.lockupViewModel === "object") {
      out.push(obj.lockupViewModel as Record<string, unknown>);
    }
    for (const v of Object.values(obj)) collectLockups(v, out);
  }
}

function findContinuationToken(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const v of node) {
      const r = findContinuationToken(v);
      if (r) return r;
    }
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const cmd = obj.continuationCommand as { token?: string } | undefined;
    if (cmd && typeof cmd.token === "string") return cmd.token;
    for (const v of Object.values(obj)) {
      const r = findContinuationToken(v);
      if (r) return r;
    }
  }
  return null;
}

async function innertubeBrowse(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-GB,en;q=0.9",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`InnerTube browse failed [${res.status}]`);
  return res.json();
}

async function fetchItvSportVideos(maxPages = 15): Promise<ItvVideo[]> {
  const videos: ItvVideo[] = [];
  const seen = new Set<string>();

  const push = (id?: string, title?: string) => {
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    videos.push({ id, title });
  };

  // 1. RSS feed — most reliable (no consent wall, no client headers needed).
  //    Gives the latest ~15 videos including the official HIGHLIGHTS uploads.
  try {
    const rss = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${ITV_SPORT_CHANNEL_ID}`,
    );
    if (rss.ok) {
      const xml = await rss.text();
      const re =
        /<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>[\s\S]*?<title>([^<]+)<\/title>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        const title = m[2]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
        push(m[1], title);
      }
    }
  } catch (err) {
    console.error("rss fetch failed", err);
  }

  // 2. InnerTube paginated browse — full historical library.
  try {
    let data: unknown = await innertubeBrowse({
      context: INNERTUBE_CTX,
      browseId: ITV_SPORT_CHANNEL_ID,
      params: "EgZ2aWRlb3PyBgQKAjoA",
    });
    const items: Array<Record<string, unknown>> = [];
    collectLockups(data, items);
    let token = findContinuationToken(data);
    let page = 1;
    while (token && page < maxPages) {
      try {
        data = await innertubeBrowse({ context: INNERTUBE_CTX, continuation: token });
      } catch {
        break;
      }
      collectLockups(data, items);
      token = findContinuationToken(data);
      page += 1;
    }
    for (const it of items) {
      const id = it.contentId as string | undefined;
      const md = (it.metadata as Record<string, unknown> | undefined)?.lockupMetadataViewModel as
        | Record<string, unknown>
        | undefined;
      const title = (md?.title as { content?: string } | undefined)?.content;
      push(id, title);
    }
  } catch (err) {
    console.error("innertube fetch failed", err);
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