import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { vereisTweestaps } from "@/lib/wws/rollenMiddleware";

export const nodigCollegaUit = createServerFn({ method: "POST" })
  .middleware([vereisTweestaps])
  .inputValidator((input: unknown) => z.object({
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    rol: z.enum(["member", "viewer", "admin"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Alleen beheerders kunnen collega's uitnodigen.");
    const { data: existing, error: lookupError } = await context.supabase
      .from("profiles").select("id").ilike("email", data.email).limit(1);
    if (lookupError) throw new Error("Het controleren van het e-mailadres is niet gelukt.");
    if (existing?.length) throw new Error("Deze persoon heeft al een account. Pas de rol aan in de gebruikerslijst.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invitation, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: "https://gohome-advice.lovable.app/uitnodiging",
    });
    if (error || !invitation.user) {
      throw new Error("Uitnodigen is niet gelukt. Controleer het e-mailadres of probeer het later opnieuw.");
    }
    // A new account normally has no roles. Never alter roles on a pre-existing account.
    const { error: grantError } = await supabaseAdmin.from("user_roles").insert({
      user_id: invitation.user.id, role: data.rol,
    });
    if (grantError) {
      throw new Error("De uitnodiging is verstuurd, maar de rol kon niet worden toegekend. Geef deze collega toegang via de gebruikerslijst.");
    }
    return { email: data.email };
  });