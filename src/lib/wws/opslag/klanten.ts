import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { normaliseerPves, type Pve } from "../pve";

type Db = SupabaseClient<Database>;

/**
 * Eigenaar (opdrachtgever) waaraan een telling gekoppeld kan worden via meta.klantId.
 * In de code heet dit "klant" (zoals in wws-site.html), in de UI overal "eigenaar" — niet te
 * verwarren met de collega die de telling heeft gemaakt (owner_id).
 */
export interface Klant {
  id: string;
  naam: string;
  /** PvE's van deze eigenaar, genormaliseerd uit klanten.pve */
  pves: Pve[];
}

const VELDEN = "id, naam, pve";

const uid = () => crypto.randomUUID();

function naarKlant(rij: { id: string; naam: string; pve: unknown }): Klant {
  return { id: rij.id, naam: rij.naam, pves: normaliseerPves(rij.pve, uid) };
}

function vriendelijk(e: { code?: string; message?: string }): Error {
  if (e.code === "23505") return new Error("Er bestaat al een eigenaar met deze naam.");
  return new Error(e.message || "Er ging iets mis.");
}

/** Eigenaren: lezen voor iedereen met een rol, toevoegen voor collega's, wijzigen voor admins (RLS). */
export function maakKlantenStore(db: Db) {
  return {
    async lijst(): Promise<Klant[]> {
      const { data, error } = await db.from("klanten").select(VELDEN).order("naam");
      if (error) throw error;
      return sorteerKlanten((data ?? []).map(naarKlant));
    },

    /** created_by zet de database (auth.uid()); de RLS eist dat ook */
    async voegToe(naam: string): Promise<Klant> {
      const n = naam.trim();
      if (!n) throw new Error("Vul een naam in.");
      const { data, error } = await db.from("klanten").insert({ naam: n }).select(VELDEN).single();
      if (error) throw vriendelijk(error);
      return naarKlant(data);
    },

    async hernoem(id: string, naam: string): Promise<void> {
      const n = naam.trim();
      if (!n) throw new Error("Vul een naam in.");
      const { data, error } = await db
        .from("klanten")
        .update({ naam: n })
        .eq("id", id)
        .select("id");
      if (error) throw vriendelijk(error);
      if (!data?.length) throw new Error("Alleen een beheerder kan een eigenaar hernoemen.");
    },

    /** De PvE's van een eigenaar opslaan (alleen admin; 0 rijen = geen rechten) */
    async slaPvesOp(id: string, pves: readonly Pve[]): Promise<void> {
      const { data, error } = await db
        .from("klanten")
        .update({ pve: pves as unknown as Json })
        .eq("id", id)
        .select("id");
      if (error) throw vriendelijk(error);
      if (!data?.length) throw new Error("Alleen een beheerder kan PvE's wijzigen.");
    },

    /** Gekoppelde tellingen blijven bestaan; hun klantId verwijst daarna naar niets */
    async verwijder(id: string): Promise<void> {
      const { data, error } = await db.from("klanten").delete().eq("id", id).select("id");
      if (error) throw vriendelijk(error);
      if (!data?.length) throw new Error("Alleen een beheerder kan een eigenaar verwijderen.");
    },
  };
}

export type KlantenStore = ReturnType<typeof maakKlantenStore>;

export function sorteerKlanten<T extends { naam: string }>(lijst: readonly T[]): T[] {
  return lijst.slice().sort((a, b) => a.naam.localeCompare(b.naam, "nl", { sensitivity: "base" }));
}

/** Naam van de eigenaar, of "" als er geen (bestaande) eigenaar gekoppeld is */
export function klantNaam(klanten: readonly Klant[], id: string | undefined): string {
  if (!id) return "";
  return klanten.find((k) => k.id === id)?.naam ?? "";
}

/** Eigenaren waarvan de naam de zoektekst bevat (hoofdletterongevoelig), op naam gesorteerd */
export function zoekKlanten(klanten: readonly Klant[], q: string): Klant[] {
  const z = q.trim().toLowerCase();
  return sorteerKlanten(klanten.filter((k) => !z || k.naam.toLowerCase().includes(z)));
}

/** Bestaat er al een eigenaar met precies deze naam (hoofdletterongevoelig)? */
export function bestaatKlant(klanten: readonly Klant[], naam: string): boolean {
  const n = naam.trim().toLowerCase();
  return klanten.some((k) => k.naam.trim().toLowerCase() === n);
}

/** Aantal tellingen dat aan deze eigenaar gekoppeld is */
export function aantalGekoppeld(
  tellingen: readonly { meta: { klantId?: string } }[],
  klantId: string,
): number {
  return tellingen.filter((t) => t.meta.klantId === klantId).length;
}
