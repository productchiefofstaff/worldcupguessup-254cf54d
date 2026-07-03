import { createFileRoute } from "@tanstack/react-router";

const BDL_BASE = "https://api.balldontlie.io/fifa/worldcup/v1";

type Match = {
  id: number;
  status: string;
  stage?: string | null;
  match_date?: string | null;
  scheduled_at?: string | null;
  start_time?: string | null;
  home_team?: { name?: string } | null;
  away_team?: { name?: string } | null;
  home_score?: number | null;
  away_score?: number | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
};

type OddsOutcome = { name?: string; american_odds?: number | null; decimal_odds?: number | null };
type OddsMarket = { type?: string; outcomes?: OddsOutcome[] };
type OddsVendor = { vendor?: string; bookmaker?: string; markets?: OddsMarket[] };
type OddsRow = {
  match_id?: number;
  vendors?: OddsVendor[];
  bookmakers?: OddsVendor[];
  markets?: OddsMarket[];
  vendor?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function bdlFetch(path: string, apiKey: string, params: Record<string, string | string[]> = {}) {
  const url = new URL(BDL_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`BDL ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<{ data: any[]; meta?: { next_cursor?: number | null } }>;
}

function normaliseVendors(row: OddsRow): OddsVendor[] {
  if (Array.isArray(row.vendors)) return row.vendors;
  if (Array.isArray(row.bookmakers)) return row.bookmakers;
  if (Array.isArray(row.markets)) return [{ vendor: row.vendor ?? "unknown", markets: row.markets }];
  return [];
}

export const Route = createFileRoute("/api/public/bdl-sync")({
  server: {
    handlers: {
      GET: async () => runSync(),
      POST: async () => runSync(),
    },
  },
});

async function runSync(): Promise<Response> {
  const apiKey = process.env.BDL_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "BDL_API_KEY not configured" }, { status: 500 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) Fetch every match for the 2026 season, paginated
  const completed: Match[] = [];
  let cursor: number | null | undefined = undefined;
  let pages = 0;
  do {
    const params: Record<string, string | string[]> = {
      "seasons[]": ["2026"],
      per_page: "100",
    };
    if (cursor !== undefined && cursor !== null) params.cursor = String(cursor);
    const page = await bdlFetch("/matches", apiKey, params);
    for (const m of page.data as Match[]) {
      if ((m.status || "").toLowerCase() === "completed") completed.push(m);
    }
    cursor = page.meta?.next_cursor ?? null;
    pages++;
    if (pages > 20) break; // safety
    await sleep(150);
  } while (cursor);

  // 2) Skip matches we already have
  const { data: existing } = await supabaseAdmin
    .from("historic_odds")
    .select("match_id");
  const seen = new Set<number>((existing ?? []).map((r: any) => Number(r.match_id)));
  const toFetch = completed.filter((m) => !seen.has(m.id));

  let inserted = 0;
  const errors: string[] = [];

  // 3) For each new match, fetch closing + opening correct-score odds
  for (const m of toFetch) {
    try {
      const [closingRes, openingRes] = await Promise.all([
        bdlFetch("/odds", apiKey, { "match_ids[]": [String(m.id)] }).catch(() => ({ data: [] })),
        bdlFetch("/odds/opening", apiKey, { "match_ids[]": [String(m.id)] }).catch(() => ({ data: [] })),
      ]);
      const rows: {
        match_id: number;
        home_team: string;
        away_team: string;
        match_date: string;
        stage: string | null;
        final_home_score: number | null;
        final_away_score: number | null;
        vendor: string;
        odds_type: "opening" | "closing";
        scoreline: string;
        american_odds: number | null;
        decimal_odds: number | null;
      }[] = [];

      const commonBase = {
        match_id: m.id,
        home_team: m.home_team?.name ?? m.home_team_name ?? "",
        away_team: m.away_team?.name ?? m.away_team_name ?? "",
        match_date:
          m.match_date ?? m.scheduled_at ?? m.start_time ?? new Date().toISOString(),
        stage: m.stage ?? null,
        final_home_score: m.home_score ?? null,
        final_away_score: m.away_score ?? null,
      };

      const processOdds = (payload: any, oddsType: "opening" | "closing") => {
        for (const row of (payload.data ?? []) as OddsRow[]) {
          const vendors = normaliseVendors(row);
          for (const v of vendors) {
            const vendorName = v.vendor ?? v.bookmaker ?? "unknown";
            for (const market of v.markets ?? []) {
              if (market.type !== "correct_score") continue;
              for (const o of market.outcomes ?? []) {
                if (!o.name) continue;
                rows.push({
                  ...commonBase,
                  vendor: vendorName,
                  odds_type: oddsType,
                  scoreline: o.name,
                  american_odds: o.american_odds ?? null,
                  decimal_odds: o.decimal_odds ?? null,
                });
              }
            }
          }
        }
      };

      processOdds(closingRes, "closing");
      processOdds(openingRes, "opening");

      if (rows.length) {
        const { error } = await supabaseAdmin
          .from("historic_odds")
          .upsert(rows, { onConflict: "match_id,vendor,odds_type,scoreline" });
        if (error) errors.push(`match ${m.id}: ${error.message}`);
        else inserted += rows.length;
      }
    } catch (e) {
      errors.push(`match ${m.id}: ${(e as Error).message}`);
    }
    await sleep(200);
  }

  return Response.json({
    completed_matches: completed.length,
    new_matches: toFetch.length,
    odds_rows_inserted: inserted,
    errors: errors.slice(0, 20),
  });
}