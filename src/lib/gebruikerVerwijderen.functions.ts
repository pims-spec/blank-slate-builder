// Gebruiker verwijderen met overdracht (alleen beheerders, met tweestaps). Alles loopt via de
// Supabase-client MET het token van de beheerder (RLS: een beheerder mag owner_id wijzigen en alle
// tellingen zien), behalve het verwijderen van het auth-account zelf: dat kan alleen de
// Auth-admin-API met de service role. De volgorde en controles staan in gebruikerVerwijderen.ts.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod";
import type { Database } from "@/integrations/supabase/types";
import { vereisAdmin } from "./wws/rollenMiddleware";
import { verwijderMetOverdracht, type Bezit, type OverdrachtDb } from "./gebruikerVerwijderen";

type Db = SupabaseClient<Database>;

async function telBezit(db: Db, userId: string): Promise<Bezit | null> {
  const tel = (tabel: "tellingen" | "huurindicaties") =>
    db.from(tabel).select("id", { count: "exact", head: true }).eq("owner_id", userId);
  const [t, h, p] = await Promise.all([
    tel("tellingen"),
    tel("huurindicaties"),
    db.from("portefeuilles").select("id", { count: "exact", head: true }).eq("created_by", userId),
  ]);
  if (t.error || h.error || p.error) return null;
  return { tellingen: t.count ?? 0, huurindicaties: h.count ?? 0, portefeuilles: p.count ?? 0 };
}

function overdrachtDb(db: Db, beheerder: string): OverdrachtDb {
  return {
    rollenVan: async (userId) => {
      const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
      return error || !data ? null : data.map((r) => r.role);
    },
    telBezit: (userId) => telBezit(db, userId),
    trekRollenIn: async (userId) =>
      !(await db.from("user_roles").delete().eq("user_id", userId)).error,
    draagTellingenOver: async (van, naar) => {
      const { data, error } = await db
        .from("tellingen")
        .update({ owner_id: naar })
        .eq("owner_id", van)
        .select("id");
      return error || !data ? null : data.map((r) => r.id);
    },
    draagHuurindicatiesOver: async (van, naar) => {
      const { data, error } = await db
        .from("huurindicaties")
        .update({ owner_id: naar })
        .eq("owner_id", van)
        .select("id");
      return error || !data ? null : data.length;
    },
    ruimDelingenOp: async (ids, naar) => {
      // in stukken: de ids gaan in de URL mee
      for (let i = 0; i < ids.length; i += 100) {
        const stuk = ids.slice(i, i + 100);
        const { error } = await db
          .from("telling_shares")
          .delete()
          .eq("user_id", naar)
          .in("telling_id", stuk);
        if (error) return false;
      }
      return true;
    },
    deelPortefeuilles: async (van, naar) => {
      const { data: eigen, error } = await db
        .from("portefeuilles")
        .select("id")
        .eq("created_by", van);
      if (error || !eigen) return null;
      if (!eigen.length) return 0;
      const ids = eigen.map((p) => p.id);
      const { data: al, error: e2 } = await db
        .from("portefeuille_shares")
        .select("portefeuille_id")
        .eq("user_id", naar)
        .in("portefeuille_id", ids);
      if (e2 || !al) return null;
      const nieuw = ids.filter((id) => !al.some((s) => s.portefeuille_id === id));
      if (!nieuw.length) return 0;
      const { error: e3 } = await db.from("portefeuille_shares").insert(
        nieuw.map((portefeuille_id) => ({
          portefeuille_id,
          user_id: naar,
          gedeeld_door: beheerder,
        })),
      );
      return e3 ? null : nieuw.length;
    },
    verwijderAccount: async (userId) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return !(await supabaseAdmin.auth.admin.deleteUser(userId)).error;
    },
  };
}

/** Wat er op naam van een gebruiker staat, voor de bevestiging */
export const bezitVanGebruiker = createServerFn({ method: "POST" })
  .middleware([vereisAdmin])
  .validator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const bezit = await telBezit(context.supabase, data.userId);
    if (!bezit) throw new Error("Tellen lukte niet. Probeer het later opnieuw.");
    return bezit;
  });

export const verwijderGebruiker = createServerFn({ method: "POST" })
  .middleware([vereisAdmin])
  .validator((d: unknown) =>
    z.object({ userId: z.string().uuid(), ontvangerId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    verwijderMetOverdracht(
      overdrachtDb(context.supabase, context.userId),
      context.userId,
      data.userId,
      data.ontvangerId,
    ),
  );
