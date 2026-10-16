// De portefeuille-instellingen uit Normen, gelezen op de server met de client van de gebruiker
// (RLS), zodat limieten per seconde niet uit de browser komen.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { mergeNormen, type Normen } from "../normen";
import { NORMEN_KEY } from "../opslag/instellingen";
import { portefeuilleNormen } from "./analyse";

export async function leesPortefeuilleNormen(db: SupabaseClient<Database>) {
  const { data: rij } = await db
    .from("instellingen")
    .select("data")
    .eq("key", NORMEN_KEY)
    .maybeSingle();
  const normen = mergeNormen((rij?.data ?? null) as Partial<Normen> | null);
  return portefeuilleNormen(normen.portefeuille);
}
