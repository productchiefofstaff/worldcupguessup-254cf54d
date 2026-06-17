import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";

export type Profile = { id: string; display_name: string; last_visit_at?: string | null; visit_count?: number | null };

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setProfile(null);
      return;
    }
    (async () => {
      const { data } = await db
        .from("profiles")
        .select("id, display_name, last_visit_at, visit_count")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) setProfile(data as Profile | null);

      // Update last visit time and increment visit count (best-effort, no await to avoid blocking)
      db.from("profiles")
        .update({ last_visit_at: new Date().toISOString(), visit_count: (data?.visit_count ?? 0) + 1 })
        .eq("id", user.id)
        .then(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return {
    user,
    profile,
    ready,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
}
