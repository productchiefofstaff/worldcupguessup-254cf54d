import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export type FormMatch = {
  date: string;
  competition: string;
  opponent: string;
  homeAway: "H" | "A";
  scoreFor: number;
  scoreAgainst: number;
  result: "W" | "D" | "L";
};

// Hardcoded ESPN team IDs for the 48 World Cup teams.
// Slug is included for the URL path; ESPN ignores it but it's nicer in logs.
const ESPN_TEAMS: Record<string, { id: number; slug: string }> = {
  Algeria: { id: 624, slug: "algeria" },
  Argentina: { id: 202, slug: "argentina" },
  Australia: { id: 628, slug: "australia" },
  Austria: { id: 474, slug: "austria" },
  Belgium: { id: 459, slug: "belgium" },
  "Bosnia and Herzegovina": { id: 452, slug: "bosnia-herzegovina" },
  Brazil: { id: 205, slug: "brazil" },
  Canada: { id: 206, slug: "canada" },
  "Cape Verde": { id: 2597, slug: "cape-verde" },
  Colombia: { id: 208, slug: "colombia" },
  Croatia: { id: 477, slug: "croatia" },
  Curacao: { id: 11678, slug: "curacao" },
  Czechia: { id: 450, slug: "czechia" },
  "DR Congo": { id: 2850, slug: "congo-dr" },
  Ecuador: { id: 209, slug: "ecuador" },
  Egypt: { id: 2620, slug: "egypt" },
  England: { id: 448, slug: "england" },
  France: { id: 478, slug: "france" },
  Germany: { id: 481, slug: "germany" },
  Ghana: { id: 4469, slug: "ghana" },
  Haiti: { id: 2654, slug: "haiti" },
  Iran: { id: 469, slug: "iran" },
  Iraq: { id: 4375, slug: "iraq" },
  "Ivory Coast": { id: 4789, slug: "ivory-coast" },
  Japan: { id: 627, slug: "japan" },
  Jordan: { id: 2917, slug: "jordan" },
  Mexico: { id: 203, slug: "mexico" },
  Morocco: { id: 2869, slug: "morocco" },
  Netherlands: { id: 449, slug: "netherlands" },
  "New Zealand": { id: 2666, slug: "new-zealand" },
  Norway: { id: 464, slug: "norway" },
  Panama: { id: 2659, slug: "panama" },
  Paraguay: { id: 210, slug: "paraguay" },
  Portugal: { id: 482, slug: "portugal" },
  Qatar: { id: 4398, slug: "qatar" },
  "Saudi Arabia": { id: 655, slug: "saudi-arabia" },
  Scotland: { id: 580, slug: "scotland" },
  Senegal: { id: 654, slug: "senegal" },
  "South Africa": { id: 467, slug: "south-africa" },
  "South Korea": { id: 451, slug: "south-korea" },
  Spain: { id: 164, slug: "spain" },
  Sweden: { id: 466, slug: "sweden" },
  Switzerland: { id: 475, slug: "switzerland" },
  Tunisia: { id: 659, slug: "tunisia" },
  Turkiye: { id: 465, slug: "turkiye" },
  USA: { id: 660, slug: "united-states" },
  Uruguay: { id: 212, slug: "uruguay" },
  Uzbekistan: { id: 2570, slug: "uzbekistan" },
};

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseEspnDate(dayLabel: string, year: number): string {
  // dayLabel = "Tue, Jun 9"
  const m = /^\w{3},\s*(\w{3})\s*(\d+)$/.exec(dayLabel.trim());
  if (!m) return new Date(year, 0, 1).toISOString();
  const month = MONTHS[m[1]] ?? 0;
  const day = parseInt(m[2], 10);
  return new Date(Date.UTC(year, month, day)).toISOString();
}

async function scrapeEspnResults(teamId: number, slug: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");
  const url = `https://www.espn.com/soccer/team/results/_/id/${teamId}/${slug}`;
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  if (!res.ok) throw new Error(`firecrawl ${res.status}`);
  const json = (await res.json()) as { data?: { markdown?: string } };
  return json.data?.markdown ?? "";
}

function parseEspnResultsMarkdown(
  markdown: string,
  teamId: number,
): FormMatch[] {
  const rowRe =
    /\|\s*(\w{3},\s*\w{3}\s*\d+)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*[^|]*?\[(\d+)\s*-\s*(\d+)\][^|]*?\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*\[FT\]\([^)]+\)\s*\|\s*([^|]+?)\s*\|/;
  const yearRe = /^\s*(\w+),\s*(\d{4})\s*$/;

  let year = new Date().getUTCFullYear();
  const out: FormMatch[] = [];
  const idMarker = `/id/${teamId}/`;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    const ym = yearRe.exec(line);
    if (ym) {
      year = parseInt(ym[2], 10);
      continue;
    }
    const m = rowRe.exec(line);
    if (!m) continue;
    const [, dayLabel, home, homeUrl, shStr, saStr, away, awayUrl, comp] = m;
    const sh = parseInt(shStr, 10);
    const sa = parseInt(saStr, 10);
    const isHome = homeUrl.includes(idMarker);
    const isAway = awayUrl.includes(idMarker);
    if (!isHome && !isAway) continue;
    const scoreFor = isHome ? sh : sa;
    const scoreAgainst = isHome ? sa : sh;
    const opponent = (isHome ? away : home).trim();
    out.push({
      date: parseEspnDate(dayLabel, year),
      competition: comp.trim(),
      opponent,
      homeAway: isHome ? "H" : "A",
      scoreFor,
      scoreAgainst,
      result:
        scoreFor > scoreAgainst ? "W" : scoreFor < scoreAgainst ? "L" : "D",
    });
  }

  return out
    .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
    .slice(0, 5);
}

export const getTeamForm = createServerFn({ method: "POST" })
  .inputValidator((input: { teamName: string }) => z.object({ teamName: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<{ team: string; matches: FormMatch[] }> => {
    const { teamName } = data;
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const espn = ESPN_TEAMS[teamName];
    if (!espn) {
      // Not a known WC team (e.g. "QF1 TBD") — skip
      return { team: teamName, matches: [] };
    }

    // 1. Read cache
    const { data: cached } = await admin
      .from("team_form_cache")
      .select("matches, fetched_at, external_team_id")
      .eq("team_name", teamName)
      .maybeSingle();

    const fresh =
      cached && Date.now() - new Date(cached.fetched_at as string).getTime() < CACHE_TTL_MS;
    if (fresh) {
      return { team: teamName, matches: (cached!.matches as FormMatch[]) ?? [] };
    }

    try {
      const markdown = await scrapeEspnResults(espn.id, espn.slug);
      const matches = parseEspnResultsMarkdown(markdown, espn.id);
      await admin.from("team_form_cache").upsert({
        team_name: teamName,
        external_team_id: espn.id,
        matches,
        fetched_at: new Date().toISOString(),
      });
      return { team: teamName, matches };
    } catch (err) {
      console.error("getTeamForm error", teamName, err);
      return { team: teamName, matches: (cached?.matches as FormMatch[] | undefined) ?? [] };
    }
  });

export const getTeamFormBatch = createServerFn({ method: "POST" })
  .inputValidator((input: { teamNames: string[] }) =>
    z.object({ teamNames: z.array(z.string().min(1)) }).parse(input),
  )
  .handler(async ({ data }): Promise<Record<string, FormMatch[]>> => {
    const names = Array.from(new Set(data.teamNames));
    if (names.length === 0) return {};
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data: cachedRows } = await admin
      .from("team_form_cache")
      .select("team_name, matches, fetched_at")
      .in("team_name", names);

    const cacheMap = new Map<string, { matches: FormMatch[]; fetched_at: string }>();
    (cachedRows ?? []).forEach((r) => {
      cacheMap.set(r.team_name as string, {
        matches: (r.matches as FormMatch[]) ?? [],
        fetched_at: r.fetched_at as string,
      });
    });

    const out: Record<string, FormMatch[]> = {};
    const stale: string[] = [];
    const now = Date.now();
    for (const name of names) {
      const c = cacheMap.get(name);
      if (c && now - new Date(c.fetched_at).getTime() < CACHE_TTL_MS) {
        out[name] = c.matches;
      } else {
        stale.push(name);
        // seed with stale data while we refresh
        if (c) out[name] = c.matches;
        else out[name] = [];
      }
    }

    // Refresh stale entries in parallel (bounded) — but do not block the response.
    // For simplicity, await them too so callers get fresh data within the call.
    await Promise.all(
      stale.map(async (name) => {
        const espn = ESPN_TEAMS[name];
        if (!espn) {
          out[name] = [];
          return;
        }
        try {
          const markdown = await scrapeEspnResults(espn.id, espn.slug);
          const matches = parseEspnResultsMarkdown(markdown, espn.id);
          out[name] = matches;
          await admin.from("team_form_cache").upsert({
            team_name: name,
            external_team_id: espn.id,
            matches,
            fetched_at: new Date().toISOString(),
          });
        } catch (err) {
          console.error("getTeamFormBatch error", name, err);
        }
      }),
    );

    return out;
  });