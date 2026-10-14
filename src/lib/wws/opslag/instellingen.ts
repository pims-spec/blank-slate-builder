import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { mergeNormen, type Normen } from "../normen";

type Db = SupabaseClient<Database>;

/** Sleutel van de normen in de tabel instellingen (zoals store.getNormen() in wws-site.html) */
export const NORMEN_KEY = "normen";

/** Normen en standaardkosten: lezen voor iedereen met een rol, schrijven alleen voor admins (RLS). */
export function maakInstellingenStore(db: Db) {
  return {
    /** Opgeslagen normen, aangevuld met de standaardnormen (mergeNormen) */
    async haalNormen(): Promise<Normen> {
      const { data, error } = await db
        .from("instellingen")
        .select("data")
        .eq("key", NORMEN_KEY)
        .maybeSingle();
      if (error) throw error;
      return mergeNormen((data?.data ?? null) as Partial<Normen> | null);
    },

    async slaNormenOp(n: Normen): Promise<void> {
      const { error } = await db
        .from("instellingen")
        .upsert({ key: NORMEN_KEY, data: n as unknown as Json });
      if (error) throw error;
    },
  };
}

export interface ControleStatus {
  nodig: boolean;
  dagen?: number;
  reden?: string;
}

/**
 * Moeten de normen weer gecontroleerd worden? Na 1 januari en 1 juli (vaste
 * wijzigingsmomenten), of na 30 dagen — controleStatus() in wws-site.html.
 */
export function controleStatus(gecontroleerd: string | undefined, nu = new Date()): ControleStatus {
  const d = gecontroleerd ? new Date(gecontroleerd) : null;
  if (!d || isNaN(d.getTime()))
    return { nodig: true, reden: "De normen zijn nog niet gecontroleerd." };
  const dagen = Math.floor((nu.getTime() - d.getTime()) / 864e5);
  const mom = [new Date(nu.getFullYear(), 0, 1), new Date(nu.getFullYear(), 6, 1)].filter(
    (x) => x <= nu && x > d,
  );
  if (mom.length)
    return {
      nodig: true,
      dagen,
      reden:
        "Per " +
        mom[mom.length - 1]!.toLocaleDateString("nl-NL", { day: "numeric", month: "long" }) +
        " wijzigen vaak de huurprijzen, de WOZ-kengetallen of het beleidsboek.",
    };
  if (dagen >= 30)
    return { nodig: true, dagen, reden: "De laatste controle is " + dagen + " dagen geleden." };
  return { nodig: false, dagen };
}

/** De vraag die je Claude stelt bij de maandelijkse controle (CONTROLE_VRAAG) */
export const CONTROLE_VRAAG =
  "Controleer of de normen in mijn WWS-puntentelling tool nog kloppen met het actuele beleidsboek van de Huurcommissie, de huurprijstabel en de Huurprijscheck, en pas de tool aan als er iets gewijzigd is.";
