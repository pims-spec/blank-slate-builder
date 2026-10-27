// Opslag van portefeuilles, adressen, labelresultaten en analyses in Supabase, met de client
// van de ingelogde gebruiker (RLS): lezen voor iedereen met een rol, schrijven met een
// schrijfrol, een portefeuille of analyse verwijderen alleen door de maker of een admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { SyncPlan } from "../bloxs/syncPlan";
import { adresSleutel, type PortefeuilleAdres } from "./adres";
import type { AnalyseAdres, AnalyseUitkomst, LabelResultaat, LabelStatus } from "./analyse";
import type { BagResultaat, BagStatus } from "./bag";
import { geldigeAnalyseNaam, MAX_ANALYSE_NAAM } from "./combi";
import type { OpgeslagenResultaat } from "./ophalen";

type Db = SupabaseClient<Database>;

export interface Portefeuille {
  id: string;
  naam: string;
  klantId: string | null;
  /** In de database "bloks" (oude spelling, zie migratie 0006); in de code "bloxs" */
  bron: "import" | "bloxs";
  createdBy: string | null;
  createdAt: string;
  aantalAdressen: number;
  /** Alleen bij bron "bloxs": de selectie in Bloxs (ids als tekst) */
  bloxsEigenaarRef: string | null;
  bloxsComplexRef: string | null;
  bloxsGesynchroniseerdOp: string | null;
}

/** Een opgeslagen analyse in het archief: van één portefeuille, of gecombineerd */
/** Waar een opgeslagen analyse van elke soort staat */
const ANALYSE_TABEL = {
  portefeuille: "portefeuille_analyses",
  combi: "portefeuille_combi_analyses",
  verwijderd: "portefeuille_analyses_archief",
} as const;

export interface ArchiefAnalyse {
  /** "verwijderd": bewaard uit een portefeuille die later is verwijderd (migratie 0011) */
  soort: "portefeuille" | "combi" | "verwijderd";
  id: string;
  /** Portefeuillenaam, of de titel van de gecombineerde analyse */
  titel: string;
  portefeuilleIds: string[];
  portefeuilleNamen: string[];
  klantIds: string[];
  analyseDatum: string;
  vensterMaanden: number;
  aantalAdressen: number;
  gemaaktOp: string;
  gemaaktDoor: string | null;
  gemaaktDoorNaam: string | null;
}

export interface OpgeslagenAnalyse {
  id: string;
  portefeuilleId: string;
  gemaaktOp: string;
  gemaaktDoor: string | null;
  uitkomst: AnalyseUitkomst;
}

/** PostgREST geeft standaard hooguit 1000 rijen; daarom in pagina's */
const PAGINA = 1000;
/** Rijen per insert/upsert */
const PORTIE = 500;

const makerNaam = (m: unknown) => {
  const p = m as { display_name: string | null; email: string | null } | null;
  return p?.display_name || p?.email || null;
};

const STATUSSEN: readonly LabelStatus[] = ["gevonden", "niet_gevonden", "meerdere", "fout"];

export function maakPortefeuilleStore(db: Db) {
  return {
    async lijst(): Promise<Portefeuille[]> {
      const { data, error } = await db
        .from("portefeuilles")
        .select(
          "id, naam, klant_id, bron, created_by, created_at, bloxs_eigenaar_ref, bloxs_complex_ref, bloxs_gesynchroniseerd_op, portefeuille_adressen(count)",
        )
        .order("naam");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        naam: r.naam,
        klantId: r.klant_id,
        bron: r.bron === "bloks" ? "bloxs" : "import",
        createdBy: r.created_by,
        createdAt: r.created_at,
        aantalAdressen:
          (r.portefeuille_adressen as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
        bloxsEigenaarRef: r.bloxs_eigenaar_ref,
        bloxsComplexRef: r.bloxs_complex_ref,
        bloxsGesynchroniseerdOp: r.bloxs_gesynchroniseerd_op,
      }));
    },

    async maak(
      naam: string,
      klantId: string | null,
      bloxs?: { eigenaarRef: string; complexRef: string | null },
    ): Promise<string> {
      const { data, error } = await db
        .from("portefeuilles")
        .insert({
          naam: naam.trim().slice(0, 200),
          klant_id: klantId,
          // "bloks" = Bloxs (oude spelling in de database, zie migratie 0006)
          bron: bloxs ? "bloks" : "import",
          ...(bloxs
            ? { bloxs_eigenaar_ref: bloxs.eigenaarRef, bloxs_complex_ref: bloxs.complexRef }
            : {}),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },

    /** Naam of eigenaar wijzigen; RLS: maker, collega met wie gedeeld is, of beheerder */
    async bewerk(id: string, w: { naam?: string; klantId?: string | null }): Promise<void> {
      const { data, error } = await db
        .from("portefeuilles")
        .update({
          ...(w.naam !== undefined ? { naam: w.naam.trim().slice(0, 200) } : {}),
          ...(w.klantId !== undefined ? { klant_id: w.klantId } : {}),
        })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Geen rechten om deze portefeuille te wijzigen.");
    },

    /** Verwijdert ook de adressen, labels en analyses (cascade); alleen maker of admin */
    async verwijder(id: string): Promise<void> {
      const { data, error } = await db.from("portefeuilles").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error(
          "Alleen wie de portefeuille heeft gemaakt, of een beheerder, kan hem verwijderen.",
        );
    },

    /** Alle adressen met hun laatste labelresultaat */
    async adressen(portefeuilleId: string): Promise<AnalyseAdres[]> {
      const uit: AnalyseAdres[] = [];
      for (let van = 0; ; van += PAGINA) {
        const { data, error } = await db
          .from("portefeuille_adressen")
          .select(
            "id, postcode, huisnummer, huisletter, toevoeging, straat, woonplaats, bloxs_categorie, niet_in_bloxs_sinds, uitgesloten_op, bag_status, bag_oppervlakte, bag_bouwjaar, label_resultaten(status, energieklasse, registratiedatum, geldig_tot, opgehaald_op)",
          )
          .eq("portefeuille_id", portefeuilleId)
          .order("postcode")
          .order("huisnummer")
          .order("huisletter")
          .order("toevoeging")
          .range(van, van + PAGINA - 1);
        if (error) throw error;
        for (const r of data ?? []) {
          const l = (r.label_resultaten as unknown as Record<string, string | null>[] | null)?.[0];
          const status = l?.["status"] as LabelStatus | undefined;
          uit.push({
            id: r.id,
            postcode: r.postcode,
            huisnummer: r.huisnummer,
            huisletter: r.huisletter,
            toevoeging: r.toevoeging,
            straat: r.straat,
            woonplaats: r.woonplaats,
            nietInBloxsSinds: r.niet_in_bloxs_sinds,
            uitgeslotenOp: r.uitgesloten_op,
            bloxsCategorie: r.bloxs_categorie,
            bag: r.bag_status
              ? {
                  status: r.bag_status as BagStatus,
                  oppervlakte: r.bag_oppervlakte,
                  bouwjaar: r.bag_bouwjaar,
                }
              : null,
            resultaat:
              l && status && STATUSSEN.includes(status)
                ? ({
                    status,
                    energieklasse: l["energieklasse"] ?? null,
                    registratiedatum: l["registratiedatum"] ?? null,
                    geldigTot: l["geldig_tot"] ?? null,
                    opgehaaldOp: l["opgehaald_op"] ?? "",
                  } satisfies LabelResultaat)
                : null,
          });
        }
        if ((data?.length ?? 0) < PAGINA) break;
      }
      return uit;
    },

    /** Adressen toevoegen; adressen die er al in staan worden overgeslagen. Geeft het aantal nieuwe. */
    async voegAdressenToe(
      portefeuilleId: string,
      adressen: readonly PortefeuilleAdres[],
    ): Promise<number> {
      let nieuw = 0;
      for (let i = 0; i < adressen.length; i += PORTIE) {
        const { data, error } = await db
          .from("portefeuille_adressen")
          .upsert(
            adressen.slice(i, i + PORTIE).map((a) => ({ portefeuille_id: portefeuilleId, ...a })),
            {
              onConflict: "portefeuille_id,postcode,huisnummer,huisletter,toevoeging",
              ignoreDuplicates: true,
            },
          )
          .select("id");
        if (error) throw error;
        nieuw += data?.length ?? 0;
      }
      return nieuw;
    },

    /** Straat en woonplaats invullen (uit PDOK of Bloxs) */
    async vulAdressenAan(
      rijen: readonly { id: string; straat: string; woonplaats: string | null }[],
    ): Promise<void> {
      for (const r of rijen) {
        const { error } = await db
          .from("portefeuille_adressen")
          .update({ straat: r.straat, woonplaats: r.woonplaats })
          .eq("id", r.id);
        if (error) throw error;
      }
    },

    /** Adressen uit de analyse halen (`uit`) of terugzetten; ze blijven in de portefeuille */
    async sluitUit(ids: readonly string[], userId: string, uit: boolean): Promise<void> {
      if (!ids.length) return;
      const { data, error } = await db
        .from("portefeuille_adressen")
        .update(
          uit
            ? { uitgesloten_op: new Date().toISOString(), uitgesloten_door: userId }
            : { uitgesloten_op: null, uitgesloten_door: null },
        )
        .in("id", [...ids])
        .select("id");
      if (error) throw error;
      if ((data?.length ?? 0) < ids.length)
        throw new Error("Geen rechten om deze portefeuille te wijzigen.");
    },

    async verwijderAdres(id: string): Promise<void> {
      const { error } = await db.from("portefeuille_adressen").delete().eq("id", id);
      if (error) throw error;
    },

    /** Adressen verwijderen (met hun labelresultaten, via cascade) */
    async verwijderAdressen(ids: readonly string[]): Promise<void> {
      for (let i = 0; i < ids.length; i += PORTIE) {
        const { error } = await db
          .from("portefeuille_adressen")
          .delete()
          .in("id", ids.slice(i, i + PORTIE));
        if (error) throw error;
      }
    },

    /**
     * Een volledige Bloxs-sync opslaan: adressen toevoegen of bijwerken (straat en woonplaats),
     * objecten koppelen met dit sync-id, en daarna afronden in de database: objecten die niet meer
     * voorkwamen weg, adressen zonder object gemarkeerd (niet verwijderd), teruggekeerde adressen
     * weer actief. Bestaande labelresultaten blijven staan.
     */
    async bloxsSyncOpslaan(
      portefeuilleId: string,
      plan: SyncPlan,
      syncId: string,
    ): Promise<{ vervallenObjecten: number; gemarkeerd: number; teruggekeerd: number }> {
      const idPerSleutel = new Map<string, string>();
      for (let i = 0; i < plan.adressen.length; i += PORTIE) {
        const { data, error } = await db
          .from("portefeuille_adressen")
          .upsert(
            plan.adressen.slice(i, i + PORTIE).map((a) => ({
              portefeuille_id: portefeuilleId,
              postcode: a.postcode,
              huisnummer: a.huisnummer,
              huisletter: a.huisletter,
              toevoeging: a.toevoeging,
              straat: a.straat ?? null,
              woonplaats: a.woonplaats ?? null,
              bloxs_categorie: a.categorie,
            })),
            { onConflict: "portefeuille_id,postcode,huisnummer,huisletter,toevoeging" },
          )
          .select("id, postcode, huisnummer, huisletter, toevoeging");
        if (error) throw error;
        for (const r of data ?? []) idPerSleutel.set(adresSleutel(r), r.id);
      }
      const nu = new Date().toISOString();
      for (let i = 0; i < plan.objecten.length; i += PORTIE) {
        const { error } = await db.from("bloxs_objecten").upsert(
          plan.objecten.slice(i, i + PORTIE).map((o) => ({
            portefeuille_id: portefeuilleId,
            soort: o.soort,
            bloxs_ref: o.ref,
            adres_id: o.adresSleutel ? (idPerSleutel.get(o.adresSleutel) ?? null) : null,
            sync_id: syncId,
            laatst_gezien_op: nu,
          })),
          { onConflict: "portefeuille_id,soort,bloxs_ref" },
        );
        if (error) throw error;
      }
      const { data, error } = await db.rpc("bloxs_sync_afronden", {
        p_portefeuille: portefeuilleId,
        p_sync: syncId,
      });
      if (error) throw error;
      const r = (
        data as unknown as
          | {
              vervallen_objecten: number;
              gemarkeerd: number;
              teruggekeerd: number;
            }[]
          | null
      )?.[0];
      return {
        vervallenObjecten: r?.vervallen_objecten ?? 0,
        gemarkeerd: r?.gemarkeerd ?? 0,
        teruggekeerd: r?.teruggekeerd ?? 0,
      };
    },

    /** Resultaten van EP-Online opslaan (laatste per adres; vervangt een eerder resultaat) */
    /** BAG-gegevens per adres opslaan (de kolommen bag_* van portefeuille_adressen) */
    async slaBagOp(resultaten: readonly { id: string; resultaat: BagResultaat }[]): Promise<void> {
      const nu = new Date().toISOString();
      const fouten = await Promise.all(
        resultaten.map(async ({ id, resultaat: r }) => {
          const { data, error } = await db
            .from("portefeuille_adressen")
            .update({
              bag_status: r.status,
              bag_oppervlakte: r.oppervlakte,
              bag_bouwjaar: r.bouwjaar,
              bag_gebruiksdoel: r.gebruiksdoel,
              bag_opgehaald_op: nu,
            })
            .eq("id", id)
            .select("id");
          return (
            error ?? (data?.length ? null : new Error("Geen rechten om dit adres bij te werken."))
          );
        }),
      );
      const f = fouten.find(Boolean);
      if (f) throw f;
    },

    async slaResultatenOp(
      portefeuilleId: string,
      userId: string,
      resultaten: readonly { id: string; resultaat: OpgeslagenResultaat }[],
    ): Promise<void> {
      if (!resultaten.length) return;
      const { error } = await db.from("label_resultaten").upsert(
        resultaten.map(({ id, resultaat: r }) => ({
          adres_id: id,
          portefeuille_id: portefeuilleId,
          status: r.status,
          energieklasse: r.energieklasse,
          registratiedatum: r.registratiedatum,
          geldig_tot: r.geldigTot,
          opnamedatum: r.opnamedatum,
          energie_index: r.energieIndex,
          gebouwtype: r.gebouwtype,
          opgehaald_op: r.opgehaaldOp,
          opgehaald_door: userId,
        })),
        { onConflict: "adres_id" },
      );
      if (error) throw error;
    },

    async analyses(portefeuilleId: string): Promise<OpgeslagenAnalyse[]> {
      const { data, error } = await db
        .from("portefeuille_analyses")
        .select("id, portefeuille_id, gemaakt_op, gemaakt_door, resultaat")
        .eq("portefeuille_id", portefeuilleId)
        .order("gemaakt_op", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        portefeuilleId: r.portefeuille_id,
        gemaaktOp: r.gemaakt_op,
        gemaaktDoor: r.gemaakt_door,
        uitkomst: r.resultaat as unknown as AnalyseUitkomst,
      }));
    },

    async slaAnalyseOp(portefeuilleId: string, u: AnalyseUitkomst): Promise<string> {
      const { data, error } = await db
        .from("portefeuille_analyses")
        .insert({
          portefeuille_id: portefeuilleId,
          analyse_datum: u.datum,
          venster_maanden: u.vensterMaanden,
          instellingen: u.instellingen as unknown as Json,
          ep_opgehaald_van: u.epOpgehaaldVan,
          ep_opgehaald_tot: u.epOpgehaaldTot,
          aantal_adressen: u.aantalAdressen,
          resultaat: u as unknown as Json,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },

    async verwijderAnalyse(id: string): Promise<void> {
      const { data, error } = await db
        .from("portefeuille_analyses")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error(
          "Alleen wie de analyse heeft opgeslagen, of een beheerder, kan hem verwijderen.",
        );
    },

    /** Alle opgeslagen analyses voor het archief (zonder de uitkomst zelf), nieuwste eerst */
    async archiefAnalyses(): Promise<ArchiefAnalyse[]> {
      const uit: ArchiefAnalyse[] = [];
      for (let van = 0; ; van += PAGINA) {
        const { data, error } = await db
          .from("portefeuille_analyses")
          .select(
            "id, portefeuille_id, analyse_datum, venster_maanden, aantal_adressen, gemaakt_op, gemaakt_door, portefeuilles(naam, klant_id), maker:profiles!portefeuille_analyses_gemaakt_door_fkey(display_name, email)",
          )
          .order("gemaakt_op", { ascending: false })
          .range(van, van + PAGINA - 1);
        if (error) throw error;
        for (const r of data ?? []) {
          const p = r.portefeuilles as unknown as { naam: string; klant_id: string | null } | null;
          uit.push({
            soort: "portefeuille",
            id: r.id,
            titel: p?.naam ?? "Portefeuille",
            portefeuilleIds: [r.portefeuille_id],
            portefeuilleNamen: p ? [p.naam] : [],
            klantIds: p?.klant_id ? [p.klant_id] : [],
            analyseDatum: r.analyse_datum,
            vensterMaanden: r.venster_maanden,
            aantalAdressen: r.aantal_adressen,
            gemaaktOp: r.gemaakt_op,
            gemaaktDoor: r.gemaakt_door,
            gemaaktDoorNaam: makerNaam(r.maker),
          });
        }
        if ((data?.length ?? 0) < PAGINA) break;
      }
      for (let van = 0; ; van += PAGINA) {
        const { data, error } = await db
          .from("portefeuille_combi_analyses")
          .select(
            "id, titel, portefeuille_ids, portefeuille_namen, klant_ids, analyse_datum, venster_maanden, aantal_adressen, gemaakt_op, gemaakt_door, maker:profiles!portefeuille_combi_analyses_gemaakt_door_fkey(display_name, email)",
          )
          .order("gemaakt_op", { ascending: false })
          .range(van, van + PAGINA - 1);
        if (error) throw error;
        for (const r of data ?? [])
          uit.push({
            soort: "combi",
            id: r.id,
            titel: r.titel,
            portefeuilleIds: r.portefeuille_ids,
            portefeuilleNamen: r.portefeuille_namen,
            klantIds: r.klant_ids,
            analyseDatum: r.analyse_datum,
            vensterMaanden: r.venster_maanden,
            aantalAdressen: r.aantal_adressen,
            gemaaktOp: r.gemaakt_op,
            gemaaktDoor: r.gemaakt_door,
            gemaaktDoorNaam: makerNaam(r.maker),
          });
        if ((data?.length ?? 0) < PAGINA) break;
      }
      // analyses van verwijderde portefeuilles (bewaard door een trigger)
      for (let van = 0; ; van += PAGINA) {
        const { data, error } = await db
          .from("portefeuille_analyses_archief")
          .select(
            "id, portefeuille_id, portefeuille_naam, klant_id, analyse_datum, venster_maanden, aantal_adressen, gemaakt_op, gemaakt_door, maker:profiles!portefeuille_analyses_archief_gemaakt_door_fkey(display_name, email)",
          )
          .order("gemaakt_op", { ascending: false })
          .range(van, van + PAGINA - 1);
        if (error) throw error;
        for (const r of data ?? [])
          uit.push({
            soort: "verwijderd",
            id: r.id,
            titel: r.portefeuille_naam,
            portefeuilleIds: [r.portefeuille_id],
            portefeuilleNamen: [r.portefeuille_naam],
            klantIds: r.klant_id ? [r.klant_id] : [],
            analyseDatum: r.analyse_datum,
            vensterMaanden: r.venster_maanden,
            aantalAdressen: r.aantal_adressen,
            gemaaktOp: r.gemaakt_op,
            gemaaktDoor: r.gemaakt_door,
            gemaaktDoorNaam: makerNaam(r.maker),
          });
        if ((data?.length ?? 0) < PAGINA) break;
      }
      return uit.sort((a, b) => b.gemaaktOp.localeCompare(a.gemaaktOp));
    },

    /** De uitkomst van één opgeslagen analyse (voor bekijken en PDF) */
    async analyseUitkomst(soort: ArchiefAnalyse["soort"], id: string): Promise<AnalyseUitkomst> {
      const { data, error } = await db
        .from(ANALYSE_TABEL[soort])
        .select("resultaat")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data.resultaat as unknown as AnalyseUitkomst;
    },

    /** Een gecombineerde analyse opslaan (vaste momentopname, met de namen van de portefeuilles) */
    async slaCombiAnalyseOp(
      titel: string,
      delen: readonly { id: string; naam: string; klantId: string | null }[],
      u: AnalyseUitkomst,
    ): Promise<string> {
      const { data, error } = await db
        .from("portefeuille_combi_analyses")
        .insert({
          titel: titel.trim().slice(0, 200),
          portefeuille_ids: delen.map((d) => d.id),
          portefeuille_namen: delen.map((d) => d.naam),
          klant_ids: [...new Set(delen.map((d) => d.klantId).filter((k): k is string => !!k))],
          analyse_datum: u.datum,
          venster_maanden: u.vensterMaanden,
          instellingen: u.instellingen as unknown as Json,
          ep_opgehaald_van: u.epOpgehaaldVan,
          ep_opgehaald_tot: u.epOpgehaaldTot,
          aantal_adressen: u.aantalAdressen,
          resultaat: u as unknown as Json,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },

    /** De naam van een gecombineerde analyse aanpassen (maker of admin; migratie 0014) */
    async hernoemCombiAnalyse(id: string, titel: string): Promise<string> {
      const naam = geldigeAnalyseNaam(titel);
      if (!naam) throw new Error(`Geef de analyse een naam van 1 tot ${MAX_ANALYSE_NAAM} tekens.`);
      const { data, error } = await db
        .from("portefeuille_combi_analyses")
        .update({ titel: naam })
        .eq("id", id)
        .select("id");
      // eigen melding: de ruwe databasefout hoort niet in beeld
      if (error) throw new Error("De naam aanpassen lukte niet. Probeer het opnieuw.");
      if (!data?.length)
        throw new Error(
          "Alleen wie de analyse heeft opgeslagen, of een beheerder, kan de naam aanpassen.",
        );
      return naam;
    },

    async verwijderCombiAnalyse(id: string): Promise<void> {
      const { data, error } = await db
        .from("portefeuille_combi_analyses")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error(
          "Alleen wie de analyse heeft opgeslagen, of een beheerder, kan hem verwijderen.",
        );
    },

    /** Een bewaarde analyse van een verwijderde portefeuille verwijderen (maker of admin) */
    async verwijderBewaardeAnalyse(id: string): Promise<void> {
      const { data, error } = await db
        .from("portefeuille_analyses_archief")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error(
          "Alleen wie de analyse heeft opgeslagen, of een beheerder, kan hem verwijderen.",
        );
    },
  };
}

export type PortefeuilleStore = ReturnType<typeof maakPortefeuilleStore>;
