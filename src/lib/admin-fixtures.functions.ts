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

export const setUserLeaderboardVisibility = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { userId: string; show: boolean }) => {
      if (!input || typeof input.userId !== "string") {
        throw new Error("userId required");
      }
      if (typeof input.show !== "boolean") {
        throw new Error("show must be boolean");
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
      .from("profiles")
      .update({ show_on_leaderboard: data.show })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string }) => {
    if (!input || typeof input.userId !== "string") {
      throw new Error("userId required");
    }
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc(
      "has_role",
      { _user_id: context.userId, _role: "admin" },
    );
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");
    if (data.userId === context.userId) {
      throw new Error("You cannot delete your own account");
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertPredictionForUser = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      userId: string;
      fixtureId: string;
      homeScore: number;
      awayScore: number;
    }) => {
      if (!input || typeof input.userId !== "string" || typeof input.fixtureId !== "string") {
        throw new Error("userId and fixtureId required");
      }
      const valid = (v: unknown) =>
        typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 50;
      if (!valid(input.homeScore) || !valid(input.awayScore)) {
        throw new Error("scores must be non-negative integers");
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
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("predictions")
      .select("id")
      .eq("user_id", data.userId)
      .eq("fixture_id", data.fixtureId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    if (existing) {
      const { error } = await supabaseAdmin
        .from("predictions")
        .update({
          home_score: data.homeScore,
          away_score: data.awayScore,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select("id, home_score, away_score")
        .single();
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("prediction_edits").insert({
        prediction_id: existing.id,
        user_id: data.userId,
        fixture_id: data.fixtureId,
        editor_user_id: context.userId,
        action: "update",
        old_home: (existing as { home_score?: number }).home_score ?? null,
        old_away: (existing as { away_score?: number }).away_score ?? null,
        new_home: data.homeScore,
        new_away: data.awayScore,
      });
    } else {
      const { data: inserted, error } = await supabaseAdmin.from("predictions").insert({
        user_id: data.userId,
        fixture_id: data.fixtureId,
        home_score: data.homeScore,
        away_score: data.awayScore,
      }).select("id").single();
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("prediction_edits").insert({
        prediction_id: inserted?.id ?? null,
        user_id: data.userId,
        fixture_id: data.fixtureId,
        editor_user_id: context.userId,
        action: "insert",
        old_home: null,
        old_away: null,
        new_home: data.homeScore,
        new_away: data.awayScore,
      });
    }
    return { ok: true };
  });