import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { Normen } from "../normen";
import {
  leesTellingDoc,
  leesVersieDoc,
  maakTellingDoc,
  maakVersie,
  versieId,
  type TellingStaat,
} from "./doc";
import type { Bewerker, Telling, TellingDoc, Versie, VersieDoc } from "./types";

type Db = SupabaseClient<Database>;

const TELLING_VELDEN =
  "id, owner_id, data, updated_at, eigenaar:profiles!tellingen_owner_id_fkey(display_name, email)";

interface TellingRij {
  id: string;
  owner_id: string;
  data: Json;
  updated_at: string;
  eigenaar: { display_name: string | null; email: string | null } | null;
}

function naarTelling(rij: TellingRij): Telling {
  return {
    ...leesTellingDoc(rij.data),
    id: rij.id,
    ownerId: rij.owner_id,
    ownerNaam: rij.eigenaar?.display_name || rij.eigenaar?.email || null,
    gewijzigdOp: rij.updated_at,
  };
}

const json = (x: TellingDoc | VersieDoc) => x as unknown as Json;

/**
 * Opslag van tellingen en versies in Supabase — de db-tak van `store` in wws-site.html.
 * Wie wat mag zien en wijzigen regelt de database (RLS): leden alleen hun eigen
 * tellingen, admins alles.
 */
export function maakTellingStore(db: Db, normen: Normen) {
  return {
    /** Alle zichtbare tellingen, laatst gewijzigd eerst. */
    async lijst(): Promise<Telling[]> {
      const { data, error } = await db
        .from("tellingen")
        .select(TELLING_VELDEN)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as unknown as TellingRij[]).map(naarTelling);
    },

    async haal(id: string): Promise<Telling | null> {
      const { data, error } = await db
        .from("tellingen")
        .select(TELLING_VELDEN)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? naarTelling(data as unknown as TellingRij) : null;
    },

    /** Nieuwe telling. owner_id wordt door de database gezet (default auth.uid()). */
    async maakAan(id: string, doc: TellingDoc): Promise<void> {
      const { error } = await db.from("tellingen").insert({ id, data: json(doc) });
      if (error) throw error;
    },

    /**
     * Bestaande telling bijwerken. Alleen `data` wordt geschreven: owner_id blijft
     * ongemoeid, zodat een admin die de telling van een collega opslaat die collega
     * als eigenaar laat staan.
     */
    async bewaar(id: string, doc: TellingDoc): Promise<void> {
      const { data, error } = await db
        .from("tellingen")
        .update({ data: json(doc) })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error("Deze telling bestaat niet meer, of je mag hem niet wijzigen.");
    },

    /** Verwijdert de telling; de versies verdwijnen mee (on delete cascade). */
    async verwijder(id: string): Promise<void> {
      const { error } = await db.from("tellingen").delete().eq("id", id);
      if (error) throw error;
    },

    /** Versies van een telling, nieuwste eerst. */
    async versies(id: string): Promise<Versie[]> {
      const { data, error } = await db
        .from("telling_versies")
        .select("id, data")
        .eq("telling_id", id)
        .order("nr", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((rij) => ({ ...leesVersieDoc(rij.data, normen), id: rij.id }));
    },

    async voegVersieToe(id: string, v: VersieDoc): Promise<Versie> {
      const vid = versieId(v.nr);
      const { error } = await db
        .from("telling_versies")
        .insert({ telling_id: id, id: vid, nr: v.nr, data: json(v) });
      if (error) throw error;
      return { ...v, id: vid };
    },
  };
}

export type TellingStore = ReturnType<typeof maakTellingStore>;

export interface OpslaanOpties {
  id: string;
  /** Nog nooit opgeslagen: dan een insert, anders een update */
  isNieuw: boolean;
  staat: TellingStaat;
  normen: Normen;
  bewerker: Bewerker | null;
  nu?: Date;
}

/** Werkversie opslaan (knop "Opslaan"). */
export async function slaWerkversieOp(store: TellingStore, o: OpslaanOpties): Promise<void> {
  const doc = maakTellingDoc(o.staat, o.normen, o.bewerker, o.nu);
  if (o.isNieuw) await store.maakAan(o.id, doc);
  else await store.bewaar(o.id, doc);
}

/**
 * Versie vastleggen, zoals saveVersie() in wws-site.html:
 * - een ingevulde naam wordt ook de naam van de telling;
 * - eerst de telling opslaan (een versie hoort altijd bij een bestaande rij),
 *   met het nieuwe versienummer, dan de versie toevoegen.
 * Geeft de nieuwe editorstaat en de vastgelegde versie terug.
 */
export async function legVersieVast(
  store: TellingStore,
  o: OpslaanOpties & { naam: string },
): Promise<{ staat: TellingStaat; versie: Versie }> {
  const naam = o.naam.trim();
  const basis: TellingStaat =
    naam && naam !== o.staat.meta.naam ? { ...o.staat, meta: { ...o.staat.meta, naam } } : o.staat;
  const v = maakVersie(basis, o.normen, naam, o.nu);
  const staat: TellingStaat = {
    ...basis,
    versieCount: v.nr,
    aantalVersies: basis.aantalVersies + 1,
    basedOn: null,
  };
  await slaWerkversieOp(store, { ...o, staat });
  const versie = await store.voegVersieToe(o.id, v);
  return { staat, versie };
}
