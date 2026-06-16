import { useEffect, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";

export type Profile = { id: string; display_name: string; last_visit_at?: string | null };

// Module-level shared auth state — all useAuth() callers subscribe to one source.
type AuthState = { user: User | null; profile: Profile | null; ready: boolean };
let state: AuthState = { user: null, profile: null, ready: false };
const listeners = new Set<() => void>();
let initialized = false;
let profileFetchedFor: string | null = null;
const LAST_VISIT_KEY = "wcg-last-visit-sent-v1";

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function ensureProfile(user: User) {
  if (profileFetchedFor === user.id) return;
  profileFetchedFor = user.id;
  (async () => {
    const { data } = await db
      .from("profiles")
      .select("id, display_name, last_visit_at")
      .eq("id", user.id)
      .maybeSingle();
    setState({ profile: (data as Profile | null) ?? null });

    // Throttle last_visit_at update to once per day per session
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lastSent = sessionStorage.getItem(LAST_VISIT_KEY);
      if (lastSent !== `${user.id}:${today}`) {
        sessionStorage.setItem(LAST_VISIT_KEY, `${user.id}:${today}`);
        db.from("profiles")
          .update({ last_visit_at: new Date().toISOString() })
          .eq("id", user.id)
          .then(() => {});
      }
    } catch {
      // ignore
    }
  })();
}

function initOnce() {
  if (initialized) return;
  initialized = true;
  supabase.auth.onAuthStateChange((_evt, session) => {
    const u = session?.user ?? null;
    if (state.user?.id !== u?.id) {
      profileFetchedFor = null;
      setState({ user: u, profile: u ? state.profile : null });
    } else {
      setState({ user: u });
    }
    if (u) ensureProfile(u);
  });
  supabase.auth.getSession().then(({ data }) => {
    const u = data.session?.user ?? null;
    setState({ user: u, ready: true });
    if (u) ensureProfile(u);
  });
}

export function useAuth() {
  useEffect(() => {
    initOnce();
  }, []);
  const snap = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  return {
    user: snap.user,
    profile: snap.profile,
    ready: snap.ready,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
}
