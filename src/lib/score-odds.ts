import type { FormMatch } from "@/lib/team-form.functions";

export type ScoreOdds = {
  lambdaHome: number;
  lambdaAway: number;
  topScores: { home: number; away: number; prob: number }[];
  homeWin: number;
  draw: number;
  awayWin: number;
};

export type TeamStrengths = {
  leagueAvg: number;
  attack: Map<string, number>;
  defense: Map<string, number>;
};

function normKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Poisson pmf: e^-λ * λ^k / k!
function poisson(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/**
 * Build per-team attack/defense strengths from recent form matches.
 * Uses the model from https://www.hackerearth.com/blog/football-betting-odds-work-using-poisson-distribution:
 *   attack[T]  = (goals scored per game by T) / league avg goals per game
 *   defense[T] = (goals conceded per game by T) / league avg goals per game
 */
export function buildTeamStrengths(
  formByTeam: Map<string, FormMatch[]>,
): TeamStrengths {
  let totalGoals = 0;
  let totalGames = 0;
  const perTeam = new Map<string, { gf: number; ga: number; gp: number }>();

  formByTeam.forEach((matches, team) => {
    const key = normKey(team);
    let gf = 0, ga = 0, gp = 0;
    matches.forEach((m) => {
      gf += m.scoreFor;
      ga += m.scoreAgainst;
      gp += 1;
      totalGoals += m.scoreFor;
      totalGames += 1;
    });
    if (gp > 0) perTeam.set(key, { gf, ga, gp });
  });

  const leagueAvg = totalGames > 0 ? totalGoals / totalGames : 1.35;
  const attack = new Map<string, number>();
  const defense = new Map<string, number>();
  perTeam.forEach((v, key) => {
    attack.set(key, leagueAvg > 0 ? v.gf / v.gp / leagueAvg : 1);
    defense.set(key, leagueAvg > 0 ? v.ga / v.gp / leagueAvg : 1);
  });

  return { leagueAvg, attack, defense };
}

/**
 * Compute correct-score odds for a fixture using bivariate independent
 * Poisson (per the referenced HackerEarth article). Neutral-venue World Cup,
 * so no home advantage multiplier.
 */
export function computeScoreOdds(
  homeTeam: string,
  awayTeam: string,
  strengths: TeamStrengths,
  maxGoals = 7,
): ScoreOdds | null {
  const hKey = normKey(homeTeam);
  const aKey = normKey(awayTeam);
  const attH = strengths.attack.get(hKey);
  const attA = strengths.attack.get(aKey);
  const defH = strengths.defense.get(hKey);
  const defA = strengths.defense.get(aKey);
  if (attH === undefined || attA === undefined || defH === undefined || defA === undefined) {
    return null;
  }
  const lambdaHome = attH * defA * strengths.leagueAvg;
  const lambdaAway = attA * defH * strengths.leagueAvg;

  const hProb: number[] = [];
  const aProb: number[] = [];
  for (let i = 0; i <= maxGoals; i++) {
    hProb.push(poisson(lambdaHome, i));
    aProb.push(poisson(lambdaAway, i));
  }

  const grid: { home: number; away: number; prob: number }[] = [];
  let homeWin = 0, draw = 0, awayWin = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = hProb[h] * aProb[a];
      grid.push({ home: h, away: a, prob: p });
      if (h > a) homeWin += p;
      else if (h < a) awayWin += p;
      else draw += p;
    }
  }

  const topScores = grid
    .sort((x, y) => y.prob - x.prob)
    .slice(0, 3);

  return { lambdaHome, lambdaAway, topScores, homeWin, draw, awayWin };
}