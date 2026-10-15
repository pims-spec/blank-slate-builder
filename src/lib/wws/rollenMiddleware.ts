// Rolcontrole voor server functions. Elke aanroep vereist een ingelogde gebruiker; de rol wordt
// gecontroleerd met de Supabase-client MET het token van die gebruiker (RLS geldt) — nooit de
// service role.
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Alleen voor gebruikers met een schrijfrol (member of admin) */
export const vereisSchrijfrol = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("heeft_schrijfrol", {
      _user_id: context.userId,
    });
    if (error || data !== true) throw new Error("geen_toegang");
    return next();
  });

/** Alleen voor beheerders */
export const vereisAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || data !== true) throw new Error("geen_toegang");
    return next();
  });
