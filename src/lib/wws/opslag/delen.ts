import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

export interface Collega {
  id: string;
  naam: string;
  email: string;
}

interface ProfielRij {
  id: string;
  display_name: string | null;
  email: string | null;
}

/**
 * Collega's met een rol. Een admin leest alle profielen en rollen, dus filteren we op rol;
 * voor anderen laat de database (RLS) al alleen profielen van gebruikers met een rol zien.
 */
export function collegasMetRol(
  profielen: readonly ProfielRij[],
  rollen: readonly { user_id: string }[],
  isAdmin: boolean,
): Collega[] {
  const metRol = new Set(rollen.map((r) => r.user_id));
  return profielen
    .filter((p) => !isAdmin || metRol.has(p.id))
    .map((p) => ({ id: p.id, naam: p.display_name || p.email || "", email: p.email ?? "" }))
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl", { sensitivity: "base" }));
}

/** Met wie kan deze telling gedeeld worden: niet met jezelf en niet met de eigenaar */
export function deelbareCollegas(
  collegas: readonly Collega[],
  userId: string,
  ownerId: string,
): Collega[] {
  return collegas.filter((c) => c.id !== userId && c.id !== ownerId);
}

/**
 * Delen met collega's (telling_shares) — store.shares/deel/ontdeel in wws-site.html.
 * Wie deelt en met wie mag, bepaalt de database: alleen eigenaar of admin, alleen met
 * collega's met een rol, en gedeeld_door is altijd de gebruiker zelf.
 */
export function maakDelenStore(db: Db) {
  return {
    async collegas(isAdmin: boolean): Promise<Collega[]> {
      const [p, r] = await Promise.all([
        db.from("profiles").select("id, display_name, email"),
        db.from("user_roles").select("user_id"),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      return collegasMetRol(p.data ?? [], r.data ?? [], isAdmin);
    },

    /** user_ids met wie de telling gedeeld is */
    async gedeeldMet(tellingId: string): Promise<string[]> {
      const { data, error } = await db
        .from("telling_shares")
        .select("user_id")
        .eq("telling_id", tellingId);
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id);
    },

    async deel(tellingId: string, userId: string): Promise<void> {
      const { error } = await db
        .from("telling_shares")
        .insert({ telling_id: tellingId, user_id: userId });
      if (error) throw error;
    },

    async ontdeel(tellingId: string, userId: string): Promise<void> {
      const { error } = await db
        .from("telling_shares")
        .delete()
        .eq("telling_id", tellingId)
        .eq("user_id", userId);
      if (error) throw error;
    },

    // ---------- portefeuilles (portefeuille_shares): gedeelde collega's kunnen bekijken én
    // bijwerken; delen en intrekken alleen door de maker of een beheerder (RLS) ----------

    async portefeuilleGedeeldMet(portefeuilleId: string): Promise<string[]> {
      const { data, error } = await db
        .from("portefeuille_shares")
        .select("user_id")
        .eq("portefeuille_id", portefeuilleId);
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id);
    },

    async deelPortefeuille(portefeuilleId: string, userId: string): Promise<void> {
      const { error } = await db
        .from("portefeuille_shares")
        .insert({ portefeuille_id: portefeuilleId, user_id: userId });
      if (error) throw error;
    },

    async ontdeelPortefeuille(portefeuilleId: string, userId: string): Promise<void> {
      const { error } = await db
        .from("portefeuille_shares")
        .delete()
        .eq("portefeuille_id", portefeuilleId)
        .eq("user_id", userId);
      if (error) throw error;
    },
  };
}

export type DelenStore = ReturnType<typeof maakDelenStore>;
