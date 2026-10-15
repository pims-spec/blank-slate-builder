// Server functions voor adres (PDOK) en energielabel (EP-Online), plus een status-check van de
// secrets voor beheerders. Elke aanroep vereist een ingelogde gebruiker; de rol wordt gecontroleerd
// met de Supabase-client MET het token van die gebruiker (RLS geldt) — nooit de service role.
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AdresVraagSchema,
  EpVraagSchema,
  zoekAdresBijPdok,
  zoekEnergielabelBijEpOnline,
} from "./dienst";

/** Alleen voor gebruikers met een schrijfrol (member of admin) */
const vereisSchrijfrol = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("heeft_schrijfrol", {
      _user_id: context.userId,
    });
    if (error || data !== true) throw new Error("geen_toegang");
    return next();
  });

/** Alleen voor beheerders */
const vereisAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || data !== true) throw new Error("geen_toegang");
    return next();
  });

export const zoekAdres = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => AdresVraagSchema.parse(d))
  .handler(async ({ data }) => zoekAdresBijPdok(fetch, data));

export const zoekEnergielabel = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => EpVraagSchema.parse(d))
  .handler(async ({ data }) =>
    zoekEnergielabelBijEpOnline(fetch, process.env["EP_ONLINE_API_KEY"], data),
  );

/** Welke secrets zijn ingesteld? Alleen aanwezig of niet — nooit de waarde */
export const serverStatus = createServerFn({ method: "POST" })
  .middleware([vereisAdmin])
  .handler(async () => ({
    EP_ONLINE_API_KEY: !!process.env["EP_ONLINE_API_KEY"],
  }));
