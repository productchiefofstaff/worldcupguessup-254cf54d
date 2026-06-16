import { createServerFn } from "@tanstack/react-start";

export type CorrectScoreOdd = { score: string; price: number; bookmaker: string };

export type FixtureOdds = {
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  top: CorrectScoreOdd[]; // top 3 lowest-priced (most likely) correct scores
};

const UK_BOOKMAKERS = [
  "bet365",
  "williamhill",
  "ladbrokes_uk",
  "coral",
  "paddypower",
  "skybet",
  "boylesports",
  "betfair_ex_uk",
  "unibet_uk",
  "betvictor",
  "betfred",
];

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

export const getWorldCupCorrectScoreOdds = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, FixtureOdds>> => {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) throw new Error("ODDS_API_KEY not configured");

    // Discover the active World Cup sport key
    const sportsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}&all=true`,
    );
    if (!sportsRes.ok) throw new Error(`sports: ${sportsRes.status}`);
    const sports: Array<{ key: string; title: string; active: boolean }> = await sportsRes.json();
    const wc = sports.find(
      (s) => /fifa_world_cup/i.test(s.key) && !/women|qual|club/i.test(s.key),
    );
    if (!wc) return {};

    const url = new URL(`https://api.the-odds-api.com/v4/sports/${wc.key}/odds`);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("regions", "uk");
    url.searchParams.set("markets", "h2h,spreads,totals");
    url.searchParams.set("oddsFormat", "decimal");
    url.searchParams.set("bookmakers", UK_BOOKMAKERS.join(","));

    // Try correct_score market first (some bookmakers / sports support it)
    const csUrl = new URL(url.toString());
    csUrl.searchParams.set("markets", "correct_score");
    const csRes = await fetch(csUrl.toString());
    if (!csRes.ok) {
      const txt = await csRes.text();
      throw new Error(`odds ${csRes.status}: ${txt.slice(0, 200)}`);
    }
    const events: Array<{
      id: string;
      home_team: string;
      away_team: string;
      commence_time: string;
      bookmakers: Array<{
        key: string;
        title: string;
        markets: Array<{ key: string; outcomes: Array<{ name: string; price: number }> }>;
      }>;
    }> = await csRes.json();

    const out: Record<string, FixtureOdds> = {};
    for (const ev of events) {
      const all: CorrectScoreOdd[] = [];
      for (const bk of ev.bookmakers) {
        const m = bk.markets.find((m) => m.key === "correct_score");
        if (!m) continue;
        for (const o of m.outcomes) {
          // outcome name patterns: "1 - 0" or "Home 1 - 0" depending on provider
          const match = o.name.match(/(\d+)\s*[-:]\s*(\d+)/);
          if (!match) continue;
          all.push({ score: `${match[1]}-${match[2]}`, price: o.price, bookmaker: bk.title });
        }
      }
      // pick the lowest price per unique score across UK books
      const best = new Map<string, CorrectScoreOdd>();
      for (const o of all) {
        const cur = best.get(o.score);
        if (!cur || o.price < cur.price) best.set(o.score, o);
      }
      const top = Array.from(best.values()).sort((a, b) => a.price - b.price).slice(0, 5);
      const key = `${normalize(ev.home_team)}__${normalize(ev.away_team)}`;
      out[key] = {
        homeTeam: ev.home_team,
        awayTeam: ev.away_team,
        commenceTime: ev.commence_time,
        top,
      };
    }
    return out;
  },
);

export function oddsKeyFor(home: string, away: string) {
  return `${normalize(home)}__${normalize(away)}`;
}