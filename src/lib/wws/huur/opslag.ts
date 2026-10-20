// Huurprijsindicator: opgeslagen indicaties (tabel huurindicaties, migratie 0013) met de client van
// de ingelogde gebruiker (RLS): lezen voor de eigenaar, admins en de kijkrol; maken met de
// schrijfrol; bijwerken en verwijderen door de eigenaar of een admin.
//
// Een indicatie bewaart de uitkomst zelf én een snapshot van de gebruikte bronregel en factoren,
// zodat hij uitlegbaar blijft als de referentietabel of de factoren later veranderen. Een
// opgeslagen indicatie wordt dus nooit opnieuw berekend.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { Normen } from "../normen";
import { berekenMarkthuur, type HuurAntwoorden, type HuurWoning, type Markthuur } from "./model";
import type { HuurNormen } from "./normen";
import { huurAdvies, wwsCheck, type HuurAdvies, type WwsCheck } from "./wws";

type Db = SupabaseClient<Database>;

export interface HuurIndicatieData {
  versie: 1;
  /** yyyy-mm-dd: de datum waarop is gerekend */
  datum: string;
  gemaaktDoor: string;
  woning: HuurWoning;
  antwoorden: HuurAntwoorden;
  markthuur: Markthuur;
  wws: Omit<WwsCheck, "invoer">;
  advies: HuurAdvies;
  /** De instellingen waarmee is gerekend; van de referentietabel alleen de gebruikte regel */
  snapshot: { normen: HuurNormen; normenVersie: string; grensVrijeSector: number };
}

/** Rekent een indicatie uit en legt alles vast wat nodig is om hem later uit te leggen */
export function maakHuurIndicatie(
  w: HuurWoning,
  a: HuurAntwoorden,
  H: HuurNormen,
  N: Normen,
  gemaaktDoor: string,
  datum: string,
): HuurIndicatieData {
  const markthuur = berekenMarkthuur(w, a, H, datum);
  const { invoer: _invoer, ...wws } = wwsCheck(w, a, H, N);
  return {
    versie: 1,
    datum,
    gemaaktDoor,
    woning: structuredClone(w),
    antwoorden: structuredClone(a),
    markthuur,
    wws,
    advies: huurAdvies(markthuur.verwacht, { ...wws, invoer: _invoer }, N),
    snapshot: {
      // de gebruikte regel en de regels ter vergelijking; niet de hele tabel
      normen: {
        ...structuredClone(H),
        regels: [...(markthuur.regel ? [markthuur.regel] : []), ...(markthuur.vergelijking ?? [])],
      },
      normenVersie: N.versie,
      grensVrijeSector: N.grensMidden + 1,
    },
  };
}

export interface HuurIndicatie {
  id: string;
  ownerId: string;
  ownerNaam: string | null;
  klantId: string | null;
  tellingId: string | null;
  gemaaktOp: string;
  data: HuurIndicatieData;
}

const KOLOMMEN =
  "id, owner_id, klant_id, telling_id, created_at, data, eigenaar:profiles!huurindicaties_owner_id_fkey(display_name, email)";

interface Rij {
  id: string;
  owner_id: string;
  klant_id: string | null;
  telling_id: string | null;
  created_at: string;
  data: Json;
  eigenaar: { display_name: string | null; email: string | null } | null;
}

/** Alleen rijen in de vorm die de app kent (eigen data, toch defensief gelezen) */
function leesData(d: unknown): HuurIndicatieData | null {
  const x = d as Partial<HuurIndicatieData> | null;
  return x &&
    x.versie === 1 &&
    x.markthuur &&
    typeof x.markthuur.verwacht === "number" &&
    x.woning &&
    x.antwoorden &&
    x.wws &&
    x.advies
    ? (x as HuurIndicatieData)
    : null;
}

function naarIndicatie(r: Rij): HuurIndicatie | null {
  const data = leesData(r.data);
  return data
    ? {
        id: r.id,
        ownerId: r.owner_id,
        ownerNaam: r.eigenaar?.display_name || r.eigenaar?.email || null,
        klantId: r.klant_id,
        tellingId: r.telling_id,
        gemaaktOp: r.created_at,
        data,
      }
    : null;
}

export function maakHuurStore(db: Db) {
  return {
    async lijst(): Promise<HuurIndicatie[]> {
      const { data, error } = await db
        .from("huurindicaties")
        .select(KOLOMMEN)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as unknown as Rij[])
        .map(naarIndicatie)
        .filter((x): x is HuurIndicatie => x !== null);
    },

    async bewaar(d: HuurIndicatieData, klantId: string | null): Promise<string> {
      const { data, error } = await db
        .from("huurindicaties")
        .insert({
          postcode: d.woning.postcode,
          huisnummer: d.woning.huisnummer.slice(0, 20),
          straat: d.woning.straat.slice(0, 200),
          plaats: d.woning.plaats.slice(0, 200),
          klant_id: klantId || null,
          data: d as unknown as Json,
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },

    async koppelTelling(id: string, tellingId: string): Promise<void> {
      const { data, error } = await db
        .from("huurindicaties")
        .update({ telling_id: tellingId })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("geen_rechten");
    },

    async verwijder(id: string): Promise<void> {
      const { data, error } = await db.from("huurindicaties").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("geen_rechten");
    },
  };
}

export type HuurStore = ReturnType<typeof maakHuurStore>;
