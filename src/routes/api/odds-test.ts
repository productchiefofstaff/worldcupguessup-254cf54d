import { createFileRoute } from "@tanstack/react-router";
import { getWorldCupCorrectScoreOdds } from "@/lib/odds.functions";

export const Route = createFileRoute("/api/odds-test")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const k = process.env.ODDS_API_KEY ?? "";
          // Don't echo the key, just metadata
          const meta = { hasKey: !!k, len: k.length };
          const data = await getWorldCupCorrectScoreOdds();
          return Response.json({ ok: true, meta, count: Object.keys(data).length, data });
        } catch (e) {
          const k = process.env.ODDS_API_KEY ?? "";
          return Response.json({ ok: false, meta: { hasKey: !!k, len: k.length }, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
        }
      },
    },
  },
});