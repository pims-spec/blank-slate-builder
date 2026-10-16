// Tweestapsverificatie resetten door een beheerder (telefoon kwijt). Alleen voor admins
// (vereisAdmin, met het token van de beheerder); daarna is de service role nodig omdat alleen de
// Auth-admin-API factoren van een ander account kan verwijderen. Nooit voor het eigen account. De
// collega koppelt bij de volgende keer inloggen opnieuw een code-app. Geen e-mailadressen of ids
// in de logs; fouten als vaste codes.
import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";
import { vereisAdmin } from "./wws/rollenMiddleware";

export interface MfaAdmin {
  listFactors(p: { userId: string }): Promise<{
    data: { factors: { id: string }[] } | null;
    error: unknown;
  }>;
  deleteFactor(p: { id: string; userId: string }): Promise<{ error: unknown }>;
}

/** Alle factoren (code-apps) van een account verwijderen; geeft het aantal */
export async function resetFactoren(
  mfa: MfaAdmin,
  beheerder: string,
  userId: string,
): Promise<{ ok: true; verwijderd: number } | { ok: false; fout: "eigen_account" | "mislukt" }> {
  if (userId === beheerder) return { ok: false, fout: "eigen_account" };
  const { data, error } = await mfa.listFactors({ userId });
  if (error || !data) return { ok: false, fout: "mislukt" };
  let verwijderd = 0;
  for (const f of data.factors) {
    const r = await mfa.deleteFactor({ id: f.id, userId });
    if (r.error) return { ok: false, fout: "mislukt" };
    verwijderd++;
  }
  console.info(`[tweestaps] reset door een beheerder: ${verwijderd} code-app(s) verwijderd`);
  return { ok: true, verwijderd };
}

export const resetTweestaps = createServerFn({ method: "POST" })
  .middleware([vereisAdmin])
  .validator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId)
      return { ok: false as const, fout: "eigen_account" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return resetFactoren(
      supabaseAdmin.auth.admin.mfa as unknown as MfaAdmin,
      context.userId,
      data.userId,
    );
  });
