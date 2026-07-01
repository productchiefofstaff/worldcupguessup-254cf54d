import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type Fixture = {
  id: string;
  team_home: string;
  team_away: string;
  home_score: number | null;
  away_score: number | null;
  home_1x2: number | null;
  draw_1x2: number | null;
  away_1x2: number | null;
  cs_odds: number | null;
};

const NAME_ALIASES: Record<string, string[]> = {
  usa: ["usa", "united states", "u.s.", "us"],
  "bosnia & herzegovina": ["bosnia", "bosnia & herzegovina", "bosnia and herzegovina"],
  "south korea": ["south korea", "korea republic", "republic of korea"],
  "north korea": ["north korea", "korea dpr", "dpr korea"],
  turkiye: ["turkiye", "türkiye", "turkey"],
  "ivory coast": ["ivory coast", "côte d'ivoire", "cote d'ivoire"],
  curacao: ["curacao", "curaçao"],
  "dr congo": ["dr congo", "democratic republic of congo", "congo dr"],
  "cape verde": ["cape verde", "cabo verde"],
  czechia: ["czechia", "czech republic"],
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}
function nameEq(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  for (const [, aliases] of Object.entries(NAME_ALIASES)) {
    const hasA = aliases.includes(na);
    const hasB = aliases.includes(nb);
    if (hasA && hasB) return true;
  }
  return false;
}

type OddsApiEvent = {
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: Array<{
    key: string;
    markets: Array<{ key: string; outcomes: Array<{ name: string; price: number }> }>;
  }>;
};

async function fetch1X2(): Promise<OddsApiEvent[]> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return [];
  const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds?apiKey=${key}&regions=uk&markets=h2h&oddsFormat=decimal`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return (await res.json()) as OddsApiEvent[];
}

function medianOdds(events: OddsApiEvent[], fx: Fixture): { h: number; d: number; a: number } | null {
  const match = events.find(
    (e) => nameEq(e.home_team, fx.team_home) && nameEq(e.away_team, fx.team_away),
  );
  if (!match) return null;
  const homes: number[] = [];
  const draws: number[] = [];
  const aways: number[] = [];
  for (const bm of match.bookmakers) {
    const mk = bm.markets.find((m) => m.key === "h2h");
    if (!mk) continue;
    for (const o of mk.outcomes) {
      if (nameEq(o.name, fx.team_home)) homes.push(o.price);
      else if (nameEq(o.name, fx.team_away)) aways.push(o.price);
      else if (norm(o.name) === "draw") draws.push(o.price);
    }
  }
  const med = (arr: number[]) => {
    if (!arr.length) return NaN;
    const s = [...arr].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const h = med(homes), d = med(draws), a = med(aways);
  if (!isFinite(h) || !isFinite(d) || !isFinite(a)) return null;
  return { h, d, a };
}

function factorial(k: number): number {
  let r = 1;
  for (let i = 2; i <= k; i++) r *= i;
  return r;
}
function poisson(lambda: number, k: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

// Deterministic implementation of the user's spec:
// normalize 1X2 -> Poisson lambdas -> P(x,y) -> fair odds * 0.82 margin, clamp.
function correctScoreOdds(
  h1: number, d1: number, a1: number,
  x: number, y: number,
): number {
  const ph = 1 / h1, pd = 1 / d1, pa = 1 / a1;
  const s = ph + pd + pa;
  const nph = ph / s, npd = pd / s, npa = pa / s;
  const TOTAL_GOALS = 2.4;
  const homeLambda = TOTAL_GOALS * (nph + 0.5 * npd);
  const awayLambda = TOTAL_GOALS * (npa + 0.5 * npd);
  const p = poisson(homeLambda, x) * poisson(awayLambda, y);
  const fair = 1 / Math.max(p, 1e-12);
  const priced = fair * 0.82;
  return Math.max(1.01, Math.min(1000, priced));
}

// Estimate plausible 1X2 for a match we couldn't price from live odds
// (e.g. already-completed fixtures). Uses Lovable AI Gateway.
async function estimate1X2WithAI(
  fixtures: Array<{ id: string; home: string; away: string; stage: string }>,
): Promise<Record<string, { h: number; d: number; a: number }>> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key || !fixtures.length) return {};
  const prompt = `Estimate plausible pre-match Bet365-style 1X2 decimal odds for each of these FIFA World Cup 2026 fixtures. Base the odds on the teams' relative strength going into the fixture (FIFA ranking, form, tournament stage). Do NOT use the actual result. Return ONLY compact JSON: an array of objects with keys id, home_odds, draw_odds, away_odds. Fixtures:\n${JSON.stringify(fixtures)}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You are a sports odds estimation engine. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return {};
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed) ? parsed : parsed.fixtures ?? parsed.data ?? [];
    const out: Record<string, { h: number; d: number; a: number }> = {};
    for (const row of arr) {
      if (row.id && row.home_odds && row.draw_odds && row.away_odds) {
        out[row.id] = { h: Number(row.home_odds), d: Number(row.draw_odds), a: Number(row.away_odds) };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export const Route = createFileRoute("/api/public/hooks/refresh-cs-odds")({
  server: {
    handlers: {
      POST: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data: fixtures, error } = await supabase
          .from("fixtures")
          .select("id, stage, team_home, team_away, home_score, away_score, home_1x2, draw_1x2, away_1x2, cs_odds");
        if (error) return Response.json({ success: false, error: error.message }, { status: 500 });
        const rows = (fixtures ?? []) as (Fixture & { stage: string })[];

        // 1) Snapshot live 1X2 for anything we haven't captured yet.
        const events = await fetch1X2();
        let odds_captured = 0;
        for (const fx of rows) {
          if (fx.home_1x2 && fx.draw_1x2 && fx.away_1x2) continue;
          const m = medianOdds(events, fx);
          if (!m) continue;
          await supabase
            .from("fixtures")
            .update({ home_1x2: m.h, draw_1x2: m.d, away_1x2: m.a })
            .eq("id", fx.id);
          fx.home_1x2 = m.h; fx.draw_1x2 = m.d; fx.away_1x2 = m.a;
          odds_captured++;
        }

        // 2) For completed fixtures without cs_odds, use AI to backfill 1X2 if missing.
        const completed = rows.filter(
          (f) => f.home_score !== null && f.away_score !== null && f.cs_odds === null,
        );
        const needAIEstimate = completed.filter((f) => !(f.home_1x2 && f.draw_1x2 && f.away_1x2));
        if (needAIEstimate.length) {
          const est = await estimate1X2WithAI(
            needAIEstimate.map((f) => ({ id: f.id, home: f.team_home, away: f.team_away, stage: f.stage })),
          );
          for (const fx of needAIEstimate) {
            const e = est[fx.id];
            if (!e) continue;
            await supabase
              .from("fixtures")
              .update({ home_1x2: e.h, draw_1x2: e.d, away_1x2: e.a })
              .eq("id", fx.id);
            fx.home_1x2 = e.h; fx.draw_1x2 = e.d; fx.away_1x2 = e.a;
          }
        }

        // 3) Compute cs_odds deterministically per the spec.
        let cs_computed = 0;
        for (const fx of completed) {
          if (!(fx.home_1x2 && fx.draw_1x2 && fx.away_1x2)) continue;
          const cs = correctScoreOdds(
            fx.home_1x2, fx.draw_1x2, fx.away_1x2,
            fx.home_score!, fx.away_score!,
          );
          await supabase
            .from("fixtures")
            .update({ cs_odds: Number(cs.toFixed(2)), cs_odds_computed_at: new Date().toISOString() })
            .eq("id", fx.id);
          cs_computed++;
        }

        return Response.json({
          success: true,
          odds_captured,
          cs_computed,
          completed_missing: completed.length - cs_computed,
        });
      },
    },
  },
});