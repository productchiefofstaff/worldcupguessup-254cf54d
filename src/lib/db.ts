// Loose-typed access to Supabase tables defined in migrations.
// The generated types.ts file is auto-generated and intentionally not edited
// here; this wrapper lets us query our app tables without strict TS errors.
import { supabase as _supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = _supabase;