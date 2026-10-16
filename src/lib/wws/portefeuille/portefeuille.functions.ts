// Server function voor de portefeuille-analyse: energielabels ophalen bij EP-Online, per portie
// van maximaal 10 adressen, met de limiet per seconde uit de normen. Rechten en werkwijze als
// in fase 4a: ingelogd met een schrijfrol, invoer met zod gecontroleerd, het antwoord van
// EP-Online gecontroleerd, en alleen eigen foutcodes terug (nooit de melding van de dienst).
// Opslaan doet de browser daarna zelf, met RLS (label_resultaten).
import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";
import { mergeNormen, type Normen } from "../normen";
import { NORMEN_KEY } from "../opslag/instellingen";
import { zoekEnergielabelsBijEpOnline } from "../opzoeken/dienst";
import { vereisSchrijfrol } from "../rollenMiddleware";
import { epVraagVoor } from "./adres";
import { portefeuilleNormen } from "./analyse";
import { resultaatUitEp, wachtMs, type OpgeslagenResultaat, type StopFout } from "./ophalen";

export const MAX_PER_PORTIE = 10;

const AdresSchema = z.object({
  id: z.string().uuid(),
  postcode: z.string().regex(/^[1-9][0-9]{3}[A-Z]{2}$/),
  huisnummer: z.number().int().min(1).max(99999),
  huisletter: z.string().regex(/^[A-Z]?$/),
  toevoeging: z.string().regex(/^[A-Z0-9]{0,10}$/),
});
export const PortieSchema = z.object({
  adressen: z.array(AdresSchema).min(1).max(MAX_PER_PORTIE),
});

export interface PortieAntwoord {
  resultaten: { id: string; resultaat: OpgeslagenResultaat }[];
  /** Gezet als het ophalen stopte; de adressen zonder resultaat kunnen later opnieuw */
  stop?: StopFout;
}

const slaap = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export const haalLabelsOp = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => PortieSchema.parse(d))
  .handler(async ({ data, context }): Promise<PortieAntwoord> => {
    // de limiet komt uit de normen in de database (met het token van de gebruiker), niet uit
    // de browser
    const { data: rij } = await context.supabase
      .from("instellingen")
      .select("data")
      .eq("key", NORMEN_KEY)
      .maybeSingle();
    const normen = mergeNormen((rij?.data ?? null) as Partial<Normen> | null);
    const wacht = wachtMs(portefeuilleNormen(normen.portefeuille).epPerSeconde);

    return haalPortie(fetch, process.env["EP_ONLINE_API_KEY"], wacht, data.adressen);
  });

/**
 * Een portie adressen na elkaar opvragen, met `wacht` ms vóór elke aanvraag (ook de eerste, zodat
 * de limiet ook tussen porties geldt). Stopt bij een fout van de dienst of de sleutel.
 */
export async function haalPortie(
  fetchFn: typeof fetch,
  sleutel: string | undefined,
  wacht: number,
  adressen: z.infer<typeof PortieSchema>["adressen"],
  slaapFn: (ms: number) => Promise<unknown> = slaap,
): Promise<PortieAntwoord> {
  const resultaten: PortieAntwoord["resultaten"] = [];
  for (const a of adressen) {
    await slaapFn(wacht);
    const r = await zoekEnergielabelsBijEpOnline(fetchFn, sleutel, epVraagVoor(a));
    const m = resultaatUitEp(r, new Date().toISOString());
    if ("stop" in m) return { resultaten, stop: m.stop };
    resultaten.push({ id: a.id, resultaat: m.resultaat });
  }
  return { resultaten };
}
