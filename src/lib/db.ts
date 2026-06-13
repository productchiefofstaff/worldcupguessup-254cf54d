// Loose-typed access to Supabase tables defined in migrations.
// The generated types.ts file is auto-generated and intentionally not edited
// here; this wrapper lets us query our app tables without TS errors.
import { supabase as _supabase } from "@/integrations/supabase/client";

export const db = _supabase as unknown as {
  from: (table: string) => ReturnType<typeof _supabase.from>;
};