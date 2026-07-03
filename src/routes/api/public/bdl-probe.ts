import { createFileRoute } from "@tanstack/react-router";

const CANDIDATES = [
  "https://api.balldontlie.io/fifa/v1/games?per_page=3",
  "https://api.balldontlie.io/fifa/v1/matches?per_page=3",
  "https://api.balldontlie.io/fifa/v1/teams?per_page=5",
  "https://api.balldontlie.io/fifa/worldcup/v1/matches?per_page=3",
  "https://api.balldontlie.io/fifa/worldcup/v1/games?per_page=3",
  "https://api.balldontlie.io/fifa/worldcup/v1/teams?per_page=5",
  "https://api.balldontlie.io/fifa/v1/odds?per_page=3",
  "https://api.balldontlie.io/fifa/worldcup/v1/odds?per_page=3",
];

export const Route = createFileRoute("/api/public/bdl-probe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = process.env.BDL_API_KEY;
        if (!key) return Response.json({ error: "no key" }, { status: 500 });
        const url = new URL(request.url);
        const q = url.searchParams.get("q");
        const targets = q ? [q] : CANDIDATES;
        const out: any[] = [];
        for (const u of targets) {
          try {
            const r = await fetch(u, { headers: { Authorization: key, Accept: "application/json" } });
            const body = await r.text();
            out.push({ url: u, status: r.status, body: body.slice(0, 20000) });
          } catch (e) {
            out.push({ url: u, error: (e as Error).message });
          }
        }
        return Response.json({ results: out });
      },
    },
  },
});