import { createFileRoute } from "@tanstack/react-router";
import { getWorldCupCorrectScoreOdds } from "@/lib/odds.functions";

export const Route = createFileRoute("/api/odds-test")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const data = await getWorldCupCorrectScoreOdds();
          return Response.json({ ok: true, count: Object.keys(data).length, data });
        } catch (e) {
          return Response.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
        }
      },
    },
  },
});