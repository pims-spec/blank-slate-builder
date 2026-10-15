import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { calc } from "../calc";
import type { DashboardVersie } from "../dashboard";
import type { Normen } from "../normen";
import { BUCKET, maakPlattegrondOpslag, type Bucket } from "../plattegrond/opslag";
import type { Segment } from "../types";
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

    /**
     * Verwijdert de telling; de versies verdwijnen mee (on delete cascade). Cascade werkt niet
     * voor Storage: eerst de plattegronden onder "<id>/" weg. Lukt dat niet, dan blijft de
     * telling staan (geen losse afbeeldingen zonder telling).
     */
    async verwijder(id: string): Promise<void> {
      await maakPlattegrondOpslag(db.storage.from(BUCKET) as unknown as Bucket).verwijderMap(id);
      const { error } = await db.from("tellingen").delete().eq("id", id);
      if (error) throw error;
    },

    /**
     * Favoriet aan/uit; slaat meteen op, zonder de rest van de telling te wijzigen —
     * toggleFavoriet() in wws-site.html.
     */
    async zetFavoriet(t: Telling, favoriet: boolean): Promise<void> {
      const { id: _i, ownerId: _o, ownerNaam: _n, gewijzigdOp: _g, ...doc } = t;
      await this.bewaar(t.id, { ...doc, meta: { ...doc.meta, favoriet } });
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

    /**
     * Een versie bijwerken: de opgeslagen data aangevuld met `patch` — updateVersie() in
     * wws-site.html. RLS: policy "Versies bewerken" (mag_telling_bewerken).
     */
    async werkVersieBij(id: string, vid: string, patch: Partial<VersieDoc>): Promise<Versie> {
      const { data: bestaand, error: e1 } = await db
        .from("telling_versies")
        .select("data")
        .eq("telling_id", id)
        .eq("id", vid)
        .maybeSingle();
      if (e1) throw e1;
      if (!bestaand) throw new Error("Deze versie bestaat niet meer.");
      const merged = { ...(bestaand.data as object), ...patch } as VersieDoc;
      const { data, error } = await db
        .from("telling_versies")
        .update({ data: json(merged) })
        .eq("telling_id", id)
        .eq("id", vid)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error("Deze versie bestaat niet meer, of je mag hem niet wijzigen.");
      return { ...leesVersieDoc(merged, normen), id: vid };
    },

    /** Een versie verwijderen — deleteVersie(). RLS: policy "Versies verwijderen". */
    async verwijderVersie(id: string, vid: string): Promise<void> {
      const { data, error } = await db
        .from("telling_versies")
        .delete()
        .eq("telling_id", id)
        .eq("id", vid)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error("Deze versie bestaat niet meer, of je mag hem niet verwijderen.");
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

/** Maximaal aantal versies voor het dashboard (zoals store.alleVersies() in wws-site.html) */
export const DASHBOARD_VERSIE_LIMIET = 5000;

/**
 * Wat het dashboard van alle versies nodig heeft, in één query: alleen telling, nummer,
 * datum en het opgeslagen resultaat (geen invoer of normen per versie). De bron gebruikt
 * niets anders. Admins en de kijkrol zien via de RLS alle versies.
 */
export const DASHBOARD_VERSIE_VELDEN =
  "telling_id, nr, createdAt:data->>createdAt, totaal:data->resultaat->totaal, maxHuur:data->resultaat->maxHuur, seg:data->resultaat->>seg";

interface DashboardVersieRij {
  telling_id: string;
  nr: number;
  createdAt: string | null;
  totaal: number | null;
  maxHuur: number | null;
  seg: Segment | null;
}

export async function haalDashboardVersies(
  db: Db,
  limiet = DASHBOARD_VERSIE_LIMIET,
): Promise<{ versies: DashboardVersie[]; limietBereikt: boolean }> {
  const { data, error } = await db
    .from("telling_versies")
    .select(DASHBOARD_VERSIE_VELDEN)
    .order("nr", { ascending: true })
    .limit(limiet);
  if (error) throw error;
  const rijen = (data ?? []) as unknown as DashboardVersieRij[];
  return {
    versies: rijen.map((r) => ({
      tellingId: r.telling_id,
      nr: r.nr,
      createdAt: r.createdAt,
      resultaat: { totaal: r.totaal, maxHuur: r.maxHuur, seg: r.seg },
    })),
    limietBereikt: rijen.length >= limiet,
  };
}

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

/**
 * "Opslaan" op een werkversie die op versie X is gebaseerd: versie X krijgt de huidige meta,
 * invoer, normen en uitkomst — updateVersieBijwerken() in wws-site.html (zonder Google Drive) —
 * en daarna wordt de werkversie opgeslagen. Geeft de bijgewerkte versie.
 */
export async function werkVersieBij(
  store: TellingStore,
  o: OpslaanOpties & { versie: Versie },
): Promise<Versie> {
  const R = calc(o.staat.input, o.normen);
  const patch: Partial<VersieDoc> = {
    meta: structuredClone(o.staat.meta),
    input: structuredClone(o.staat.input),
    normen: structuredClone(o.normen),
    resultaat: { totaal: R.totaal, exact: R.exact, seg: R.seg, maxHuur: R.maxHuur, rows: R.rows },
    bewerktOp: (o.nu ?? new Date()).toISOString(),
  };
  const v = await store.werkVersieBij(o.id, o.versie.id, patch);
  await slaWerkversieOp(store, o);
  return v;
}
