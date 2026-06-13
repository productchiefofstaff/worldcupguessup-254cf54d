import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const updateFixtureScore = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      fixtureId: string;
      homeScore: number | null;
      awayScore: number | null;
    }) => {
      if (!input || typeof input.fixtureId !== "string") {
        throw new Error("fixtureId required");
      }
      const valid = (v: unknown) =>
        v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 50);
      if (!valid(input.homeScore) || !valid(input.awayScore)) {
        throw new Error("scores must be null or a non-negative integer");
      }
      // Either both null (clear) or both numbers (set)
      if (
        (input.homeScore === null) !== (input.awayScore === null)
      ) {
        throw new Error("home and away score must both be set or both be null");
      }
      return input;
    },
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "admin" },
    );
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("fixtures")
      .update({
        home_score: data.homeScore,
        away_score: data.awayScore,
      })
      .eq("id", data.fixtureId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });