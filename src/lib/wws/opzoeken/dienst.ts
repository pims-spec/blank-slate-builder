// De aanroepen naar PDOK en EP-Online zelf — wat in wws-site.html de Netlify-functies /api/adres
// en /api/eplabel deden. Draait alleen op de server (vanuit opzoeken.functions.ts); fetch en de
// sleutel worden meegegeven, zodat dit zonder netwerk te testen is.
//
// Het antwoord van een externe dienst is onbetrouwbare data: alleen wat door zod komt, gaat terug.
// Foutteksten van de dienst zelf worden nooit doorgegeven of gelogd — alleen een eigen foutcode.
import * as z from "zod";
import { leesEpAntwoordAlle, type EpLabel } from "./eponline";
import {
  HuisnummerSchema,
  leesPdokAntwoord,
  PostcodeSchema,
  pdokUrl,
  type PdokAdres,
} from "./pdok";

export const EP_URL = "https://public.ep-online.nl/api/v5/PandEnergielabel/Adres";
const TIMEOUT_MS = 10_000;

export type OpzoekFout =
  | "niet_gevonden"
  | "te_veel_verzoeken"
  | "sleutel_ontbreekt"
  | "sleutel_ongeldig"
  | "dienst_onbereikbaar"
  | "ongeldige_invoer";

export type Opzoeking<T> = { ok: true; data: T } | { ok: false; fout: OpzoekFout };

export const AdresVraagSchema = z.object({
  postcode: PostcodeSchema,
  huisnummer: HuisnummerSchema,
});
export type AdresVraag = z.input<typeof AdresVraagSchema>;

export const EpVraagSchema = z.object({
  postcode: PostcodeSchema,
  huisnummer: HuisnummerSchema,
  huisletter: z
    .string()
    .regex(/^[A-Za-z]?$/)
    .default(""),
  huisnummertoevoeging: z
    .string()
    .regex(/^[A-Za-z0-9 -]{0,10}$/)
    .default(""),
});
export type EpVraag = z.input<typeof EpVraagSchema>;

/** Alleen de HTTP-status en onze code loggen — nooit de body of de URL (die bevat het adres) */
export function logFout(dienst: string, fout: OpzoekFout, status?: number) {
  console.warn(`[opzoeken] ${dienst}: ${fout}${status ? ` (HTTP ${status})` : ""}`);
}

export async function haalJson(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<{ status: number; json: unknown } | { status: 0 }> {
  try {
    const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { status: res.status, json: null };
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch {
    return { status: 0 };
  }
}

export function foutVoorStatus(status: number): OpzoekFout {
  if (status === 429) return "te_veel_verzoeken";
  if (status === 404) return "niet_gevonden";
  return "dienst_onbereikbaar";
}

/** Straat en plaats bij postcode + huisnummer via PDOK (geen sleutel nodig) */
export async function zoekAdresBijPdok(
  fetchFn: typeof fetch,
  vraag: AdresVraag,
): Promise<Opzoeking<PdokAdres>> {
  const v = AdresVraagSchema.safeParse(vraag);
  if (!v.success) return { ok: false, fout: "ongeldige_invoer" };
  const r = await haalJson(fetchFn, pdokUrl(v.data.postcode, v.data.huisnummer), {
    headers: { Accept: "application/json" },
  });
  if (r.status !== 200) {
    const fout = r.status === 0 ? "dienst_onbereikbaar" : foutVoorStatus(r.status);
    logFout("PDOK", fout, r.status || undefined);
    return { ok: false, fout };
  }
  const adres = leesPdokAntwoord(r.json);
  if (!adres) return { ok: false, fout: "niet_gevonden" };
  return { ok: true, data: adres };
}

/** Het geregistreerde energielabel bij een adres via EP-Online */
export async function zoekEnergielabelBijEpOnline(
  fetchFn: typeof fetch,
  sleutel: string | undefined,
  vraag: EpVraag,
): Promise<Opzoeking<EpLabel>> {
  const r = await zoekEnergielabelsBijEpOnline(fetchFn, sleutel, vraag);
  if (!r.ok) return r;
  const label = r.data[0];
  if (!label) return { ok: false, fout: "niet_gevonden" };
  return { ok: true, data: label };
}

/**
 * Alle geldige labels die EP-Online voor een adres teruggeeft (meestal één; meer dan één
 * betekent dat het adres niet eenduidig is, bijv. zonder huisletter of toevoeging).
 */
export async function zoekEnergielabelsBijEpOnline(
  fetchFn: typeof fetch,
  sleutel: string | undefined,
  vraag: EpVraag,
): Promise<Opzoeking<EpLabel[]>> {
  if (!sleutel) {
    logFout("EP-Online", "sleutel_ontbreekt");
    return { ok: false, fout: "sleutel_ontbreekt" };
  }
  const v = EpVraagSchema.safeParse(vraag);
  if (!v.success) return { ok: false, fout: "ongeldige_invoer" };
  const qs = new URLSearchParams({ postcode: v.data.postcode, huisnummer: v.data.huisnummer });
  if (v.data.huisletter) qs.set("huisletter", v.data.huisletter.toUpperCase());
  if (v.data.huisnummertoevoeging)
    qs.set("huisnummertoevoeging", v.data.huisnummertoevoeging.trim());
  const r = await haalJson(fetchFn, EP_URL + "?" + qs, {
    // EP-Online verwacht de sleutel kaal in Authorization, zonder "Bearer"
    headers: { Authorization: sleutel, Accept: "application/json" },
  });
  if (r.status !== 200) {
    const fout: OpzoekFout =
      r.status === 0
        ? "dienst_onbereikbaar"
        : r.status === 401 || r.status === 403
          ? "sleutel_ongeldig"
          : // 400: EP-Online weigert dit adres (bijv. een vreemde toevoeging); de dienst zelf werkt
            r.status === 400
            ? "ongeldige_invoer"
            : foutVoorStatus(r.status);
    logFout("EP-Online", fout, r.status || undefined);
    return { ok: false, fout };
  }
  const labels = leesEpAntwoordAlle(r.json);
  if (!labels.length) return { ok: false, fout: "niet_gevonden" };
  return { ok: true, data: labels };
}

/** Nederlandse melding per foutcode — de teksten uit wws-site.html, zonder "Netlify" */
export function adresFoutMelding(fout: OpzoekFout | "geen_verbinding"): string {
  if (fout === "te_veel_verzoeken")
    return "Even te veel verzoeken bij de adresopzoekdienst (PDOK). Probeer het zo weer, of vul straatnaam en plaats hieronder handmatig in.";
  if (fout === "dienst_onbereikbaar")
    return "De adresopzoekdienst (PDOK) is op dit moment niet bereikbaar. Vul straatnaam en plaats hieronder handmatig in.";
  if (fout === "geen_verbinding")
    return "Automatisch adres opzoeken lukte niet (geen verbinding). Vul straatnaam en plaats hieronder handmatig in.";
  return "Automatisch adres opzoeken lukte niet. Vul straatnaam en plaats hieronder handmatig in.";
}

export function epFoutMelding(fout: OpzoekFout | "geen_verbinding"): string {
  switch (fout) {
    case "niet_gevonden":
      return "Geen geregistreerd energielabel gevonden voor dit adres.";
    case "sleutel_ongeldig":
      return "De EP-Online-sleutel is niet (goed) ingesteld. Controleer EP_ONLINE_API_KEY in Lovable Cloud → Secrets.";
    case "sleutel_ontbreekt":
      return "De server is nog niet ingesteld voor EP-Online (EP_ONLINE_API_KEY ontbreekt).";
    case "te_veel_verzoeken":
      return "Even te veel verzoeken bij EP-Online. Probeer het later opnieuw.";
    case "dienst_onbereikbaar":
      return "EP-Online is op dit moment niet bereikbaar (storing of onderhoud bij EP-Online zelf). Probeer het over een tijdje opnieuw.";
    case "geen_verbinding":
      return "Kon geen verbinding maken met de server.";
    case "ongeldige_invoer":
      return "Vul eerst een geldige postcode en huisnummer in.";
  }
}
