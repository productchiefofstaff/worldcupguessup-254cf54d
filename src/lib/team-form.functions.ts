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
export const ESPN_TEAMS: Record<string, { id: number; slug: string }> = {
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

export type CompletedFixtureForForm = {
  team_home: string;
  team_away: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
};

const TEAM_NAME_ALIASES: Record<string, string> = {
  bosniaherzegovina: "bosniaandherzegovina",
  bosniaherz: "bosniaandherzegovina",
  congodr: "drcongo",
  curacao: "curacao",
  coteivoire: "ivorycoast",
  czechrepublic: "czechia",
  holland: "netherlands",
  korea: "southkorea",
  republicofkorea: "southkorea",
  saudi: "saudiarabia",
  turkey: "turkiye",
  turkiye: "turkiye",
  unitedstates: "usa",
  usmnt: "usa",
};

function normalizeTeamName(name: string): string {
  const key = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
  return TEAM_NAME_ALIASES[key] ?? key;
}

function utcDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function resultFor(scoreFor: number, scoreAgainst: number): "W" | "D" | "L" {
  return scoreFor > scoreAgainst ? "W" : scoreFor < scoreAgainst ? "L" : "D";
}

export function buildFixtureFormMatches(
  fixtures: CompletedFixtureForForm[],
  teamName: string,
): FormMatch[] {
  const teamKey = normalizeTeamName(teamName);
  return fixtures
    .flatMap((fixture) => {
      if (fixture.home_score === null || fixture.away_score === null) return [];
      const isHome = normalizeTeamName(fixture.team_home) === teamKey;
      const isAway = normalizeTeamName(fixture.team_away) === teamKey;
      if (!isHome && !isAway) return [];

      const scoreFor = isHome ? fixture.home_score : fixture.away_score;
      const scoreAgainst = isHome ? fixture.away_score : fixture.home_score;
      return [{
        date: fixture.kickoff_at,
        competition: "FIFA World Cup",
        opponent: isHome ? fixture.team_away : fixture.team_home,
        homeAway: isHome ? "H" as const : "A" as const,
        scoreFor,
        scoreAgainst,
        result: resultFor(scoreFor, scoreAgainst),
      }];
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function mergeTeamFormMatches(
  scrapedMatches: FormMatch[],
  fixtureMatches: FormMatch[],
): FormMatch[] {
  const merged: FormMatch[] = [];
  const seen = new Set<string>();
  const add = (match: FormMatch) => {
    const key = `${utcDay(match.date)}:${normalizeTeamName(match.opponent)}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(match);
  };

  // App fixture results are the source of truth for World Cup matches; ESPN is
  // still useful for older friendlies/qualifiers but sometimes lags per-team.
  fixtureMatches.forEach(add);
  scrapedMatches.forEach(add);

  return merged
    .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
    .slice(0, 5);
}

function parseEspnDate(dayLabel: string, year: number): string {
  // dayLabel = "Tue, Jun 9"
  const m = /^\w{3},\s*(\w{3})\s*(\d+)$/.exec(dayLabel.trim());
  if (!m) return new Date(year, 0, 1).toISOString();
  const month = MONTHS[m[1]] ?? 0;
  const day = parseInt(m[2], 10);
  return new Date(Date.UTC(year, month, day)).toISOString();
}

export async function scrapeEspnResults(teamId: number, slug: string): Promise<string> {
  // Use Firecrawl with the HTML format (not markdown). Markdown conversion
  // silently dropped the most recent month's results table for some pages
  // (e.g. Cape Verde's June 2026 vs Spain), and ESPN's AWS WAF blocks direct
  // worker fetches — so we ask Firecrawl for the rendered HTML and parse it.
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY missing");
  const url = `https://www.espn.com/soccer/team/results/_/id/${teamId}/${slug}`;
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["html"],
      onlyMainContent: false,
      waitFor: 4000,
      maxAge: 0,
    }),
  });
  if (!res.ok) throw new Error(`firecrawl ${res.status}`);
  const json = (await res.json()) as { data?: { html?: string } };
  return json.data?.html ?? "";
}

export function parseEspnResultsMarkdown(
  html: string,
  teamId: number,
): FormMatch[] {
  // Now parses raw ESPN HTML (kept the name for back-compat with callers).
  const idMarker = `/id/${teamId}/`;
  const out: FormMatch[] = [];

  // Locate each month's results table by its "Table__Title" header.
  const titleRe = /Table__Title[^>]*>([^<]+)</g;
  const titles: { title: string; idx: number }[] = [];
  let tm: RegExpExecArray | null;
  while ((tm = titleRe.exec(html)) !== null) {
    titles.push({ title: tm[1].trim(), idx: tm.index });
  }
  titles.push({ title: "", idx: html.length });

  const monthYearRe = /^(\w{3,9}),\s*(\d{4})$/;
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
  const dayRe = />(\w{3}),\s*(\w{3})\s*(\d+)</;
  const teamLinkRe =
    /href="[^"]*\/soccer\/team\/_\/id\/(\d+)\/[^"]+"[^>]*>([^<]+)</g;
  const scoreRe = />(\d+)\s*-\s*(\d+)</;
  const compRe = /<span>([^<]+)<\/span>\s*<\/td>\s*<\/tr>/;

  for (let i = 0; i < titles.length - 1; i++) {
    const my = monthYearRe.exec(titles[i].title);
    if (!my) continue;
    const month = MONTHS[my[1].slice(0, 3)] ?? 0;
    const year = parseInt(my[2], 10);
    const section = html.slice(titles[i].idx, titles[i + 1].idx);

    rowRe.lastIndex = 0;
    let r: RegExpExecArray | null;
    while ((r = rowRe.exec(section)) !== null) {
      const tr = r[1];
      if (!/>FT</.test(tr)) continue;

      const d = dayRe.exec(tr);
      if (!d) continue;
      const day = parseInt(d[3], 10);

      teamLinkRe.lastIndex = 0;
      const links: { id: string; name: string }[] = [];
      let lm: RegExpExecArray | null;
      while ((lm = teamLinkRe.exec(tr)) !== null) {
        const name = lm[2].trim();
        if (!name) continue;
        if (!links.find((x) => x.id === lm![1])) {
          links.push({ id: lm[1], name });
        }
      }
      if (links.length < 2) continue;
      const [home, away] = links;

      const s = scoreRe.exec(tr);
      if (!s) continue;
      const sh = parseInt(s[1], 10);
      const sa = parseInt(s[2], 10);

      const teamIdStr = String(teamId);
      const isHome = home.id === teamIdStr;
      const isAway = away.id === teamIdStr;
      if (!isHome && !isAway) continue;

      const scoreFor = isHome ? sh : sa;
      const scoreAgainst = isHome ? sa : sh;
      const opponent = isHome ? away.name : home.name;
      const compM = compRe.exec(tr);
      const competition = compM ? compM[1].trim() : "";

      out.push({
        date: new Date(Date.UTC(year, month, day)).toISOString(),
        competition,
        opponent,
        homeAway: isHome ? "H" : "A",
        scoreFor,
        scoreAgainst,
        result:
          scoreFor > scoreAgainst ? "W" : scoreFor < scoreAgainst ? "L" : "D",
      });
    }
  }

  return out
    .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())
    .slice(0, 5);
}

// Legacy (unused) — kept as a no-op stub so external imports don't break.
function _legacyParseEspnResultsMarkdown(
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
      const scrapedMatches = parseEspnResultsMarkdown(markdown, espn.id);
      const { data: completedFixtures } = await admin
        .from("fixtures")
        .select("team_home, team_away, kickoff_at, home_score, away_score")
        .not("home_score", "is", null)
        .not("away_score", "is", null);
      const matches = mergeTeamFormMatches(
        scrapedMatches,
        buildFixtureFormMatches((completedFixtures ?? []) as CompletedFixtureForForm[], teamName),
      );
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