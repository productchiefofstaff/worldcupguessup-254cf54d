import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Player = { id: string; name: string };

const KEY = "wc26_player";

function read(): Player | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Player) : null;
  } catch {
    return null;
  }
}

export function usePlayer() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlayer(read());
    setReady(true);
  }, []);

  const signIn = useCallback(async (rawName: string): Promise<{ error?: string }> => {
    const name = rawName.trim();
    if (!name) return { error: "Please enter a name" };
    if (name.length > 40) return { error: "Name must be 40 characters or less" };

    // Try to find existing player by name (case-insensitive)
    const { data: existing, error: selErr } = await supabase
      .from("players")
      .select("id, name")
      .ilike("name", name)
      .maybeSingle();
    if (selErr) return { error: selErr.message };

    let p: Player;
    if (existing) {
      p = existing as Player;
    } else {
      const { data: created, error: insErr } = await supabase
        .from("players")
        .insert({ name })
        .select("id, name")
        .single();
      if (insErr) return { error: insErr.message };
      p = created as Player;
    }
    localStorage.setItem(KEY, JSON.stringify(p));
    setPlayer(p);
    return {};
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY);
    setPlayer(null);
  }, []);

  return { player, ready, signIn, signOut };
}