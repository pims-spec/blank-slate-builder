// Adres opzoeken via PDOK Locatieserver — de server-kant van /api/adres en het overnemen
// zoals vulAdresAutomatischIn() in wws-site.html. Het antwoord van PDOK is onbetrouwbare data:
// leesPdokAntwoord() laat via zod alleen straatnaam en woonplaats door.
import * as z from "zod";
import { weergaveAdres } from "../opslag/doc";
import type { TellingMeta } from "../opslag/types";

export const PDOK_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

export const PostcodeSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^[1-9][0-9]{3}[A-Z]{2}$/));
export const HuisnummerSchema = z.string().regex(/^[1-9][0-9]{0,4}$/);

/** Zoek-URL voor één adres (postcode + huisnummer) */
export function pdokUrl(postcode: string, huisnummer: string): string {
  const q = `postcode:${postcode} and huisnummer:${huisnummer} and type:adres`;
  return PDOK_URL + "?" + new URLSearchParams({ q, rows: "1", fl: "straatnaam,woonplaatsnaam" });
}

export interface PdokAdres {
  straat: string;
  plaats: string;
}

const PdokSchema = z.object({
  response: z.object({
    docs: z
      .array(
        z.object({
          straatnaam: z.string().max(200).optional(),
          woonplaatsnaam: z.string().max(200).optional(),
        }),
      )
      .max(10),
  }),
});

/** Straat en plaats uit het (onbetrouwbare) PDOK-antwoord, of null */
export function leesPdokAntwoord(json: unknown): PdokAdres | null {
  const r = PdokSchema.safeParse(json);
  if (!r.success) return null;
  const doc = r.data.response.docs[0];
  if (!doc || (!doc.straatnaam && !doc.woonplaatsnaam)) return null;
  return { straat: doc.straatnaam ?? "", plaats: doc.woonplaatsnaam ?? "" };
}

/** Postcode en huisnummer (alleen de cijfers) uit de meta, als ze geldig zijn — anders null */
export function adresZoekVelden(
  meta: Partial<Pick<TellingMeta, "postcode" | "huisnummer">>,
): { postcode: string; huisnummer: string } | null {
  const pc = String(meta.postcode || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const hn = String(meta.huisnummer || "")
    .trim()
    .match(/^\d+/);
  if (!/^\d{4}[A-Z]{2}$/.test(pc) || !hn) return null;
  return { postcode: pc, huisnummer: hn[0] };
}

/** Moet het adres worden opgezocht? Alleen als straat of plaats nog leeg is (zoals de bron) */
export function adresOpzoekenNodig(meta: Partial<TellingMeta>): boolean {
  return !!adresZoekVelden(meta) && !(meta.adres && meta.plaats);
}

/**
 * Neemt straat en plaats over als die nog leeg zijn; een lege naam wordt het adres —
 * vulAdresAutomatischIn() in wws-site.html. null als er niets verandert.
 */
export function adresToepassen(meta: TellingMeta, a: PdokAdres): TellingMeta | null {
  const m = structuredClone(meta) as TellingMeta & { auto?: Record<string, boolean> };
  m.auto = m.auto || {};
  let changed = false;
  if (!m.adres && a.straat) {
    m.adres = a.straat;
    m.auto["adres"] = true;
    changed = true;
  }
  if (!m.plaats && a.plaats) {
    m.plaats = a.plaats;
    m.auto["plaats"] = true;
    changed = true;
  }
  if (!changed) return null;
  if (!String(m.naam || "").trim()) m.naam = weergaveAdres(m);
  return m;
}

/**
 * Postcode en huisnummer uit het venster "Nieuwe telling" — nieuweTellingDoorgaan(): postcode
 * zonder spaties in hoofdletters moet 1234AB zijn, het huisnummer moet met cijfers beginnen
 * (toevoeging mag). Geeft de postcode als "1234 AB" en het huisnummer zoals ingevuld, of null.
 */
export function nieuweTellingAdres(
  postcode: string,
  huisnummer: string,
): { postcode: string; huisnummer: string } | null {
  const pc = String(postcode || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const hn = String(huisnummer || "").trim();
  if (!/^\d{4}[A-Z]{2}$/.test(pc) || !/^\d+/.test(hn)) return null;
  return { postcode: pc.slice(0, 4) + " " + pc.slice(4), huisnummer: hn };
}

export const NIEUWE_TELLING_ONGELDIG =
  "Vul een geldige postcode (1234 AB) en huisnummer in, of klik op ‘Overslaan voor nu’.";
