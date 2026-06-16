import { createServerFn } from "@tanstack/react-start";

export type ScoreOdd = { score: string; price: number; prob: number };
export type FixtureOdds = {
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  lambdaHome: number;
  lambdaAway: number;
  top: ScoreOdd[];
};
export type OddsResponse = {
  fetchedAt: string;
  events: Record<string, FixtureOdds>;
};

const UK_BOOKMAKERS = [
  "bet365",
  "williamhill",
  "ladbrokes_uk",
  "coral",
  "paddypower",
  "skybet",
  "boylesports",
  "betvictor",
  "betfred",
  "unibet_eu",
];

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

export function oddsKeyFor(home: string, away: string) {
  return `${normalize(home)}__${normalize(away)}`;
}

// Simple in-memory cache (per worker instance). Refreshes hourly.
let cache: { at: number; data: OddsResponse } | null = null;
const TTL_MS = 30 * 60 * 1000;

function fairProbsFromDecimal(prices: number[]): number[] {
  // Convert decimal odds to implied probs, then normalize (proportional overround removal).
  const raw = prices.map((p) => 1 / p);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((p) => p / sum);
}

function logFact(n: number, memo: number[] = [0, 0]): number {
  while (memo.length <= n) memo.push(memo[memo.length - 1] + Math.log(memo.length));
  return memo[n];
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(k * Math.log(lambda) - lambda - logFact(k));
}

// Given fair h2h probabilities {H, D, A} and total expected goals mu,
// solve for supremacy s (= lambdaHome - lambdaAway) so a Poisson model
// matches the home-win prob. lambdaHome = (mu+s)/2, lambdaAway = (mu-s)/2.
function solveLambdas(pHome: number, pAway: number, mu: number) {
  const target = pHome - pAway; // home win prob minus away win prob
  let lo = -mu * 0.95;
  let hi = mu * 0.95;
  for (let i = 0; i < 40; i++) {
    const s = (lo + hi) / 2;
    const lh = Math.max(0.05, (mu + s) / 2);
    const la = Math.max(0.05, (mu - s) / 2);
    let pH = 0;
    let pA = 0;
    for (let h = 0; h <= 10; h++) {
      const ph = poissonPmf(h, lh);
      for (let a = 0; a <= 10; a++) {
        const pa = poissonPmf(a, la);
        const joint = ph * pa;
        if (h > a) pH += joint;
        else if (a > h) pA += joint;
      }
    }
    const diff = pH - pA;
    if (diff < target) lo = s;
    else hi = s;
  }
  const s = (lo + hi) / 2;
  return { lambdaHome: Math.max(0.05, (mu + s) / 2), lambdaAway: Math.max(0.05, (mu - s) / 2) };
}

// Given over/under total line and over price, solve mu so Poisson P(total > line) matches fair prob.
function solveMu(line: number, pOver: number) {
  let lo = 0.3;
  let hi = 6.0;
  for (let i = 0; i < 40; i++) {
    const mu = (lo + hi) / 2;
    // P(total > line) where line typically .5 (so total > 2.5 means >= 3)
    const threshold = Math.floor(line) + 1;
    let pAtLeast = 0;
    for (let t = threshold; t <= 12; t++) {
      pAtLeast += poissonPmf(t, mu);
    }
    if (pAtLeast < pOver) lo = mu;
    else hi = mu;
  }
  return (lo + hi) / 2;
}

function average(nums: number[]): number {
  if (!nums.length) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export const getCorrectScoreOdds = createServerFn({ method: "GET" }).handler(
  async (): Promise<OddsResponse> => {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) throw new Error("ODDS_API_KEY not configured");

    const sportsRes = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`);
    if (!sportsRes.ok) throw new Error(`sports: ${sportsRes.status}`);
    const sports: Array<{ key: string; title: string }> = await sportsRes.json();
    const wc = sports.find(
      (s) => /fifa_world_cup/i.test(s.key) && !/women|qual|club/i.test(s.key),
    );
    if (!wc) {
      const empty: OddsResponse = { fetchedAt: new Date().toISOString(), events: {} };
      cache = { at: Date.now(), data: empty };
      return empty;
    }

    const url = new URL(`https://api.the-odds-api.com/v4/sports/${wc.key}/odds`);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("regions", "uk");
    url.searchParams.set("markets", "h2h,totals");
    url.searchParams.set("oddsFormat", "decimal");
    url.searchParams.set("bookmakers", UK_BOOKMAKERS.join(","));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`odds ${res.status}: ${(await res.text()).slice(0, 200)}`);

    type Outcome = { name: string; price: number; point?: number };
    type Market = { key: string; outcomes: Outcome[] };
    type Event = {
      id: string;
      home_team: string;
      away_team: string;
      commence_time: string;
      bookmakers: Array<{ key: string; title: string; markets: Market[] }>;
    };
    const events: Event[] = await res.json();

    const out: Record<string, FixtureOdds> = {};
    for (const ev of events) {
      // Aggregate prices across UK books
      const homePrices: number[] = [];
      const drawPrices: number[] = [];
      const awayPrices: number[] = [];
      // Totals: pick the line nearest 2.5
      const totalsByLine = new Map<number, { over: number[]; under: number[] }>();

      for (const bk of ev.bookmakers) {
        const h2h = bk.markets.find((m) => m.key === "h2h");
        if (h2h) {
          for (const o of h2h.outcomes) {
            if (o.name === ev.home_team) homePrices.push(o.price);
            else if (o.name === ev.away_team) awayPrices.push(o.price);
            else if (/draw/i.test(o.name)) drawPrices.push(o.price);
          }
        }
        const totals = bk.markets.find((m) => m.key === "totals");
        if (totals) {
          for (const o of totals.outcomes) {
            if (o.point == null) continue;
            const entry = totalsByLine.get(o.point) ?? { over: [], under: [] };
            if (/over/i.test(o.name)) entry.over.push(o.price);
            else if (/under/i.test(o.name)) entry.under.push(o.price);
            totalsByLine.set(o.point, entry);
          }
        }
      }

      if (!homePrices.length || !awayPrices.length || !drawPrices.length) continue;

      const avgH = average(homePrices);
      const avgD = average(drawPrices);
      const avgA = average(awayPrices);
      const [pH, , pA] = fairProbsFromDecimal([avgH, avgD, avgA]);

      // Pick totals line closest to 2.5 with both over and under prices
      let bestLine: number | null = null;
      let bestDelta = Infinity;
      for (const [line, prices] of totalsByLine) {
        if (!prices.over.length || !prices.under.length) continue;
        const d = Math.abs(line - 2.5);
        if (d < bestDelta) {
          bestDelta = d;
          bestLine = line;
        }
      }

      let mu = 2.5; // fallback
      if (bestLine !== null) {
        const tl = totalsByLine.get(bestLine)!;
        const [pOver] = fairProbsFromDecimal([average(tl.over), average(tl.under)]);
        mu = solveMu(bestLine, pOver);
      }

      const { lambdaHome, lambdaAway } = solveLambdas(pH, pA, mu);

      // Build correct-score grid 0..7
      const grid: ScoreOdd[] = [];
      for (let h = 0; h <= 7; h++) {
        for (let a = 0; a <= 7; a++) {
          const prob = poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway);
          grid.push({ score: `${h}-${a}`, prob, price: prob > 0 ? 1 / prob : Infinity });
        }
      }
      grid.sort((a, b) => b.prob - a.prob);
      const top = grid.slice(0, 5);

      out[oddsKeyFor(ev.home_team, ev.away_team)] = {
        homeTeam: ev.home_team,
        awayTeam: ev.away_team,
        commenceTime: ev.commence_time,
        lambdaHome,
        lambdaAway,
        top,
      };
    }

    const data: OddsResponse = { fetchedAt: new Date().toISOString(), events: out };
    cache = { at: Date.now(), data };
    return data;
  },
);