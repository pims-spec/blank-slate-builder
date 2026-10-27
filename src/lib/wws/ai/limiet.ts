// Daglimiet per gebruiker voor de AI-functies: eerst de sleutel, dan boeken via
// ai_gebruik_boeken() (met het eigen token), dan de dienst. Een ontbrekende sleutel telt niet mee.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AiFout } from "./dienst";
import { Boeking, type Gebruik } from "./vragen";

export type AiServerFout = AiFout | "limiet_bereikt" | "geen_maatregelen" | "geen_toegang";
export type AiAntwoord<T> =
  { ok: true; data: T; gebruik: Gebruik } | { ok: false; fout: AiServerFout; gebruik?: Gebruik };

export type Soort = "lezen" | "afbeelding";

/** Boekt één aanroep; null = niet gelukt (geen toegang of database-fout) */
async function boek(
  db: SupabaseClient<Database>,
  soort: Soort,
): Promise<{ toegestaan: boolean; gebruik: Gebruik } | null> {
  const { data, error } = await db.rpc("ai_gebruik_boeken", { _soort: soort });
  if (error) {
    console.warn(`[ai] gebruik boeken mislukt (${error.code ?? "?"})`);
    return null;
  }
  const b = Boeking.safeParse(data);
  if (!b.success) return null;
  return {
    toegestaan: b.data.toegestaan,
    gebruik: { gebruikt: b.data.gebruikt, limiet: b.data.limiet },
  };
}

const env = (k: string) => process.env[k] || undefined;

/** Eerst sleutel, dan limiet boeken, dan de dienst — een ontbrekende sleutel telt niet mee */
export async function metLimiet<T>(
  db: SupabaseClient<Database>,
  soort: Soort,
  sleutelNaam: string,
  roep: () => Promise<{ ok: true; data: T } | { ok: false; fout: AiServerFout }>,
): Promise<AiAntwoord<T>> {
  if (!env(sleutelNaam)) return { ok: false, fout: "sleutel_ontbreekt" };
  const b = await boek(db, soort);
  if (!b) return { ok: false, fout: "geen_toegang" };
  if (!b.toegestaan) return { ok: false, fout: "limiet_bereikt", gebruik: b.gebruik };
  const r = await roep();
  return r.ok ? { ok: true, data: r.data, gebruik: b.gebruik } : { ...r, gebruik: b.gebruik };
}
