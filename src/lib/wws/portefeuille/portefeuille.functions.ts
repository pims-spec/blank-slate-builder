// Server functions voor de portefeuille-analyse: energielabels ophalen bij EP-Online (en straat
// en woonplaats aanvullen via PDOK), per portie van maximaal 10 adressen, met de limiet per seconde uit de normen. Rechten en werkwijze als
// in fase 4a: ingelogd met een schrijfrol, invoer met zod gecontroleerd, het antwoord van
// EP-Online gecontroleerd, en alleen eigen foutcodes terug (nooit de melding van de dienst).
// Opslaan doet de browser daarna zelf, met RLS (label_resultaten).
import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";
import { zoekAdresBijPdok, zoekEnergielabelsBijEpOnline } from "../opzoeken/dienst";
import { vereisSchrijfrol } from "../rollenMiddleware";
import { epVraagVoor, schoonNaam } from "./adres";
import { haalBagPortie } from "./bag";
import { leesPortefeuilleNormen } from "./normenDb";
import {
  bagToevoegingOk,
  ongeldigAdres,
  resultaatUitEp,
  wachtMs,
  type OpgeslagenResultaat,
  type StopFout,
} from "./ophalen";

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
    const wacht = wachtMs((await leesPortefeuilleNormen(context.supabase)).epPerSeconde);

    return haalPortie(fetch, process.env["EP_ONLINE_API_KEY"], wacht, data.adressen);
  });

/**
 * Een portie adressen na elkaar opvragen, met `wacht` ms vóór elke aanvraag (ook de eerste, zodat
 * de limiet ook tussen porties geldt). Stopt bij een fout van de dienst of de sleutel. Een adres met
 * een toevoeging die de BAG niet kent (bijv. "GARAGE") telt als mislukt, zonder aanvraag.
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
    if (!bagToevoegingOk(a.toevoeging)) {
      resultaten.push({ id: a.id, resultaat: ongeldigAdres(new Date().toISOString()) });
      continue;
    }
    await slaapFn(wacht);
    const r = await zoekEnergielabelsBijEpOnline(fetchFn, sleutel, epVraagVoor(a));
    const m = resultaatUitEp(r, new Date().toISOString());
    if ("stop" in m) return { resultaten, stop: m.stop };
    resultaten.push({ id: a.id, resultaat: m.resultaat });
  }
  return { resultaten };
}

// --- Straat en woonplaats aanvullen via PDOK (geen sleutel nodig) ---

/** PDOK: vaste, rustige limiet (ongeveer 4 per seconde) */
export const PDOK_WACHT_MS = 250;

const AanvulSchema = z.object({
  adressen: z
    .array(
      z.object({
        id: z.string().uuid(),
        postcode: z.string().regex(/^[1-9][0-9]{3}[A-Z]{2}$/),
        huisnummer: z.number().int().min(1).max(99999),
      }),
    )
    .min(1)
    .max(MAX_PER_PORTIE),
});

export interface AanvulAntwoord {
  aangevuld: { id: string; straat: string; woonplaats: string | null }[];
  nietGevonden: string[];
  stop?: StopFout;
}

export const vulAdressenAanBijPdok = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => AanvulSchema.parse(d))
  .handler(async ({ data }) => vulAanPortie(fetch, PDOK_WACHT_MS, data.adressen));

/**
 * Per postcode + huisnummer één vraag aan PDOK (straat en woonplaats zijn gelijk voor alle
 * huisletters en toevoegingen). Stopt bij te veel verzoeken of als PDOK niet bereikbaar is.
 */
export async function vulAanPortie(
  fetchFn: typeof fetch,
  wacht: number,
  adressen: z.infer<typeof AanvulSchema>["adressen"],
  slaapFn: (ms: number) => Promise<unknown> = slaap,
): Promise<AanvulAntwoord> {
  const uit: AanvulAntwoord = { aangevuld: [], nietGevonden: [] };
  const groepen = new Map<string, string[]>();
  for (const a of adressen) {
    const k = a.postcode + "|" + a.huisnummer;
    groepen.set(k, [...(groepen.get(k) ?? []), a.id]);
  }
  for (const [k, ids] of groepen) {
    const [postcode, huisnummer] = k.split("|") as [string, string];
    await slaapFn(wacht);
    const r = await zoekAdresBijPdok(fetchFn, { postcode, huisnummer });
    if (!r.ok) {
      if (r.fout === "niet_gevonden" || r.fout === "ongeldige_invoer") {
        uit.nietGevonden.push(...ids);
        continue;
      }
      return { ...uit, stop: r.fout };
    }
    const straat = schoonNaam(r.data.straat, 200);
    const woonplaats = schoonNaam(r.data.plaats, 100);
    if (!straat) uit.nietGevonden.push(...ids);
    else for (const id of ids) uit.aangevuld.push({ id, straat, woonplaats });
  }
  return uit;
}

// --- BAG-gegevens voor de verduurzamingsraming (PDOK, geen sleutel nodig) ---

/**
 * Oppervlakte, gebruiksdoel en bouwjaar per adres uit de BAG (PDOK), per portie van maximaal 10.
 * Zelfde rust als bij PDOK hierboven; stopt bij te veel verzoeken of een storing.
 */
export const haalBagGegevens = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => PortieSchema.parse(d))
  .handler(async ({ data }) => haalBagPortie(fetch, PDOK_WACHT_MS, data.adressen, slaap));
