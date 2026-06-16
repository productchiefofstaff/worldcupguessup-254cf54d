import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const API_BASE = "https://api.football-data.org/v4";
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

// Manual override map for tricky name mismatches between our fixtures
// and football-data.org. Extend as needed.
const NAME_ALIASES: Record<string, string> = {
  "United States": "USA",
  USA: "USA",
  "Korea Republic": "South Korea",
  "IR Iran": "Iran",
  "Türkiye": "Turkey",
  Turkiye: "Turkey",
  "Côte d'Ivoire": "Ivory Coast",
  "Czechia": "Czech Republic",
};

async function fdFetch(path: string, apiKey: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "X-Auth-Token": apiKey },
  });
  if (!res.ok) {
    throw new Error(`football-data ${path} ${res.status}`);
  }
  return res.json();
}

async function resolveTeamId(name: string, apiKey: string): Promise<number | null> {
  const queryName = NAME_ALIASES[name] ?? name;
  // Search across all teams; free tier allows /v4/teams?name=
  const data = (await fdFetch(`/teams?name=${encodeURIComponent(queryName)}&limit=20`, apiKey)) as {
    teams?: Array<{ id: number; name: string; shortName?: string; tla?: string }>;
  };
  const teams = data.teams ?? [];
  if (teams.length === 0) return null;
  // Prefer exact match on name/shortName
  const exact = teams.find(
    (t) => t.name === queryName || t.shortName === queryName || t.name === name,
  );
  return (exact ?? teams[0]).id;
}

async function fetchTeamMatches(teamId: number, apiKey: string): Promise<FormMatch[]> {
  const data = (await fdFetch(`/teams/${teamId}/matches?status=FINISHED&limit=10`, apiKey)) as {
    matches?: Array<{
      utcDate: string;
      competition?: { name?: string };
      homeTeam?: { id: number; name: string };
      awayTeam?: { id: number; name: string };
      score?: { fullTime?: { home: number | null; away: number | null } };
    }>;
  };
  const out: FormMatch[] = [];
  for (const m of data.matches ?? []) {
    const h = m.score?.fullTime?.home;
    const a = m.score?.fullTime?.away;
    if (h === null || h === undefined || a === null || a === undefined) continue;
    const isHome = m.homeTeam?.id === teamId;
    const scoreFor = isHome ? h : a;
    const scoreAgainst = isHome ? a : h;
    const opponent = (isHome ? m.awayTeam?.name : m.homeTeam?.name) ?? "Unknown";
    out.push({
      date: m.utcDate,
      competition: m.competition?.name ?? "—",
      opponent,
      homeAway: isHome ? "H" : "A",
      scoreFor,
      scoreAgainst,
      result: scoreFor > scoreAgainst ? "W" : scoreFor < scoreAgainst ? "L" : "D",
    });
  }
  return out.sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime()).slice(0, 5);
}

export const getTeamForm = createServerFn({ method: "POST" })
  .inputValidator((input: { teamName: string }) => z.object({ teamName: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<{ team: string; matches: FormMatch[] }> => {
    const { teamName } = data;
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

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

    if (!apiKey) {
      // No key configured — fall back to whatever's cached (possibly empty)
      return { team: teamName, matches: (cached?.matches as FormMatch[] | undefined) ?? [] };
    }

    try {
      let teamId = (cached?.external_team_id as number | null) ?? null;
      if (!teamId) {
        teamId = await resolveTeamId(teamName, apiKey);
      }
      if (!teamId) {
        await admin.from("team_form_cache").upsert({
          team_name: teamName,
          external_team_id: null,
          matches: [],
          fetched_at: new Date().toISOString(),
        });
        return { team: teamName, matches: [] };
      }
      const matches = await fetchTeamMatches(teamId, apiKey);
      await admin.from("team_form_cache").upsert({
        team_name: teamName,
        external_team_id: teamId,
        matches,
        fetched_at: new Date().toISOString(),
      });
      return { team: teamName, matches };
    } catch (err) {
      console.error("getTeamForm error", teamName, err);
      return { team: teamName, matches: (cached?.matches as FormMatch[] | undefined) ?? [] };
    }
  });