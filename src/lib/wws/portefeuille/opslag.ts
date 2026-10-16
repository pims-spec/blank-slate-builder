// Opslag van portefeuilles, adressen, labelresultaten en analyses in Supabase, met de client
// van de ingelogde gebruiker (RLS): lezen voor iedereen met een rol, schrijven met een
// schrijfrol, een portefeuille of analyse verwijderen alleen door de maker of een admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { PortefeuilleAdres } from "./adres";
import type { AnalyseAdres, AnalyseUitkomst, LabelResultaat, LabelStatus } from "./analyse";
import type { OpgeslagenResultaat } from "./ophalen";

type Db = SupabaseClient<Database>;

export interface Portefeuille {
  id: string;
  naam: string;
  klantId: string | null;
  bron: "import" | "bloks";
  createdBy: string | null;
  createdAt: string;
  aantalAdressen: number;
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

const STATUSSEN: readonly LabelStatus[] = ["gevonden", "niet_gevonden", "meerdere", "fout"];

export function maakPortefeuilleStore(db: Db) {
  return {
    async lijst(): Promise<Portefeuille[]> {
      const { data, error } = await db
        .from("portefeuilles")
        .select("id, naam, klant_id, bron, created_by, created_at, portefeuille_adressen(count)")
        .order("naam");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        naam: r.naam,
        klantId: r.klant_id,
        bron: r.bron === "bloks" ? "bloks" : "import",
        createdBy: r.created_by,
        createdAt: r.created_at,
        aantalAdressen:
          (r.portefeuille_adressen as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
      }));
    },

    async maak(naam: string, klantId: string | null): Promise<string> {
      const { data, error } = await db
        .from("portefeuilles")
        .insert({ naam: naam.trim().slice(0, 200), klant_id: klantId, bron: "import" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },

    async bewerk(id: string, w: { naam?: string; klantId?: string | null }): Promise<void> {
      const { error } = await db
        .from("portefeuilles")
        .update({
          ...(w.naam !== undefined ? { naam: w.naam.trim().slice(0, 200) } : {}),
          ...(w.klantId !== undefined ? { klant_id: w.klantId } : {}),
        })
        .eq("id", id);
      if (error) throw error;
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
            "id, postcode, huisnummer, huisletter, toevoeging, label_resultaten(status, energieklasse, registratiedatum, geldig_tot, opgehaald_op)",
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

    async verwijderAdres(id: string): Promise<void> {
      const { error } = await db.from("portefeuille_adressen").delete().eq("id", id);
      if (error) throw error;
    },

    /** Resultaten van EP-Online opslaan (laatste per adres; vervangt een eerder resultaat) */
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
  };
}

export type PortefeuilleStore = ReturnType<typeof maakPortefeuilleStore>;
