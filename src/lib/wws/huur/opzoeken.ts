// Huurprijsindicator: de woninggegevens bij postcode + huisnummer. Draait alleen op de server
// (huur.functions.ts); fetch en de EP-Online-sleutel worden meegegeven, zodat dit zonder netwerk
// te testen is.
//   1. PDOK Locatieserver: adres, gemeente, provincie en het BAG-id (verplicht);
//   2. BAG: oppervlakte, gebruiksdoel, bouwjaar (mag ontbreken);
//   3. EP-Online: energielabel, registratiedatum en gebouwtype (mag ontbreken).
// Antwoorden zijn onbetrouwbare data: alleen wat door zod komt, gaat terug. Foutmeldingen van de
// diensten worden nooit doorgegeven of gelogd, alleen een eigen code.
import * as z from "zod";
import { zoekEnergielabelsBijEpOnline } from "../opzoeken/dienst";
import { epToIsoDate } from "../opzoeken/eponline";
import { HuisnummerSchema, PostcodeSchema } from "../opzoeken/pdok";
import { haalVerblijfsobject, LOCATIESERVER_URL } from "../portefeuille/bag";
import type { HuurWoning } from "./model";

const TIMEOUT_MS = 10_000;

export const HuurVraagSchema = z.object({
  postcode: PostcodeSchema,
  huisnummer: HuisnummerSchema,
  huisletter: z
    .string()
    .regex(/^[A-Za-z]?$/)
    .default(""),
  toevoeging: z
    .string()
    .regex(/^[A-Za-z0-9 -]{0,10}$/)
    .default(""),
});
export type HuurVraag = z.input<typeof HuurVraagSchema>;

export type HuurOpzoekFout =
  "ongeldige_invoer" | "niet_gevonden" | "meerdere" | "te_veel_verzoeken" | "dienst_onbereikbaar";

export type HuurOpzoeking =
  | { ok: true; woning: HuurWoning; meldingen: string[] }
  | { ok: false; fout: HuurOpzoekFout; keuzes?: string[] };

const Tekst = z.string().max(200).nullish();
const AdresSchema = z.object({
  response: z.object({
    docs: z
      .array(
        z.object({
          adresseerbaarobject_id: z
            .string()
            .regex(/^\d{16}$/)
            .optional(),
          huisletter: Tekst,
          huisnummertoevoeging: Tekst,
          straatnaam: Tekst,
          woonplaatsnaam: Tekst,
          gemeentenaam: Tekst,
          provincienaam: Tekst,
        }),
      )
      .max(100),
  }),
});

export function adresUrl(postcode: string, huisnummer: string): string {
  return (
    LOCATIESERVER_URL +
    "?" +
    new URLSearchParams({
      q: `postcode:${postcode} and huisnummer:${huisnummer} and type:adres`,
      rows: "100",
      fl: "adresseerbaarobject_id,huisletter,huisnummertoevoeging,straatnaam,woonplaatsnaam,gemeentenaam,provincienaam",
    })
  );
}

const log = (code: string, status?: number) =>
  console.warn(`[huur] ${code}${status ? ` (HTTP ${status})` : ""}`);

const gelijk = (a: string | null | undefined, b: string) =>
  (a ?? "").trim().toUpperCase() === b.trim().toUpperCase();

/** "A", "2", "A 2": wat na het huisnummer komt, voor de keuzelijst bij meerdere adressen */
const achtervoegsel = (d: {
  huisletter?: string | null | undefined;
  huisnummertoevoeging?: string | null | undefined;
}) => [d.huisletter, d.huisnummertoevoeging].filter(Boolean).join(" ");

export async function zoekHuurWoning(
  fetchFn: typeof fetch,
  epSleutel: string | undefined,
  vraag: HuurVraag,
): Promise<HuurOpzoeking> {
  const v = HuurVraagSchema.safeParse(vraag);
  if (!v.success) return { ok: false, fout: "ongeldige_invoer" };
  const { postcode, huisnummer, huisletter, toevoeging } = v.data;

  // 1. adres
  let json: unknown;
  try {
    const res = await fetchFn(adresUrl(postcode, huisnummer), {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429) {
      log("te_veel_verzoeken", 429);
      return { ok: false, fout: "te_veel_verzoeken" };
    }
    if (!res.ok) {
      log("dienst_onbereikbaar", res.status);
      return { ok: false, fout: "dienst_onbereikbaar" };
    }
    json = await res.json();
  } catch {
    log("dienst_onbereikbaar");
    return { ok: false, fout: "dienst_onbereikbaar" };
  }
  const a = AdresSchema.safeParse(json);
  if (!a.success) return { ok: false, fout: "niet_gevonden" };
  const docs = a.data.response.docs;
  const passend = docs.filter(
    (d) => gelijk(d.huisletter, huisletter) && gelijk(d.huisnummertoevoeging, toevoeging),
  );
  if (!passend.length) {
    // zonder letter/toevoeging opgegeven, maar het adres heeft die wel: laat kiezen
    const keuzes = [...new Set(docs.map(achtervoegsel).filter(Boolean))].sort().slice(0, 30);
    return keuzes.length && !huisletter && !toevoeging
      ? { ok: false, fout: "meerdere", keuzes }
      : { ok: false, fout: "niet_gevonden" };
  }
  const d = passend[0]!;
  const meldingen: string[] = [];
  const woning: HuurWoning = {
    postcode,
    huisnummer: huisnummer + (achtervoegsel(d) ? " " + achtervoegsel(d) : ""),
    straat: d.straatnaam?.trim() ?? "",
    plaats: d.woonplaatsnaam?.trim() ?? "",
    gemeente: d.gemeentenaam?.trim() ?? "",
    provincie: d.provincienaam?.trim() ?? "",
    bagOppervlakte: null,
    bouwjaar: null,
    gebruiksdoel: null,
    label: null,
    labelDatum: null,
    gebouwtype: null,
  };

  // 2. BAG
  if (d.adresseerbaarobject_id) {
    const b = await haalVerblijfsobject(fetchFn, d.adresseerbaarobject_id);
    if (b.ok) {
      woning.bagOppervlakte = b.oppervlakte;
      woning.bouwjaar = b.bouwjaar;
      woning.gebruiksdoel = b.gebruiksdoel;
      if (b.gebruiksdoel && !/woon/i.test(b.gebruiksdoel))
        meldingen.push(
          `Volgens de BAG is het gebruiksdoel "${b.gebruiksdoel}", niet wonen. Controleer of dit een woning is.`,
        );
    } else meldingen.push("De BAG-gegevens (oppervlakte, bouwjaar) konden niet worden opgehaald.");
  } else meldingen.push("Geen BAG-object bij dit adres; vul de oppervlakte zelf in.");

  // 3. EP-Online
  const ep = await zoekEnergielabelsBijEpOnline(fetchFn, epSleutel, {
    postcode,
    huisnummer,
    huisletter: d.huisletter ?? "",
    huisnummertoevoeging: d.huisnummertoevoeging ?? "",
  });
  if (ep.ok) {
    const l = ep.data[0]!;
    woning.label = l.Energieklasse?.trim() || null;
    woning.labelDatum = epToIsoDate(l.Registratiedatum) || null;
    woning.gebouwtype = l.Gebouwtype?.trim() || null;
  } else
    meldingen.push(
      ep.fout === "niet_gevonden"
        ? "Geen geregistreerd energielabel gevonden (EP-Online)."
        : "Het energielabel kon niet worden opgehaald (EP-Online).",
    );

  return { ok: true, woning, meldingen };
}

/** Nederlandse melding per foutcode */
export function huurFoutMelding(fout: HuurOpzoekFout | "geen_verbinding"): string {
  switch (fout) {
    case "ongeldige_invoer":
      return "Vul een geldige postcode (1234 AB) en huisnummer in.";
    case "niet_gevonden":
      return "Dit adres is niet gevonden. Controleer postcode, huisnummer en toevoeging.";
    case "meerdere":
      return "Bij dit huisnummer horen meerdere woningen. Kies de huisletter of toevoeging.";
    case "te_veel_verzoeken":
      return "Even te veel verzoeken bij PDOK. Probeer het over een minuut opnieuw.";
    default:
      return "De opzoekdienst (PDOK) is nu niet bereikbaar. Probeer het later opnieuw.";
  }
}
