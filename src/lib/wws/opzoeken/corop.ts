// Gemeente en bouwjaar bij een adres, voor het kengetal kleine nieuwbouw COROP (../corop.ts):
// 1. PDOK Locatieserver: gemeentecode, gemeentenaam en het BAG-id van het verblijfsobject;
// 2. BAG: het bouwjaar van het (oudste) pand. Ontbreekt dat, dan is het bouwjaar null.
// Antwoorden zijn onbetrouwbare data: alleen wat door zod komt, wordt gebruikt. Draait alleen op
// de server (opzoeken.functions.ts); fetch wordt meegegeven voor de tests.
import * as z from "zod";
import { haalVerblijfsobject } from "../portefeuille/bag";
import type { CoropGegevens } from "../types";
import { EpVraagSchema, type EpVraag, type Opzoeking } from "./dienst";
import { haal, kiesAdres } from "./monument";
import { PDOK_URL } from "./pdok";

const LocatieSchema = z.object({
  response: z.object({
    docs: z
      .array(
        z.object({
          gemeentecode: z.string().regex(/^\d{4}$/),
          gemeentenaam: z.string().max(100),
          adresseerbaarobject_id: z
            .string()
            .regex(/^\d{16}$/)
            .optional(),
          huisletter: z.string().max(5).optional(),
          huisnummertoevoeging: z.string().max(10).optional(),
        }),
      )
      .max(20),
  }),
});

export function coropLocatieUrl(v: z.infer<typeof EpVraagSchema>): string {
  return (
    PDOK_URL +
    "?" +
    new URLSearchParams({
      q: `postcode:${v.postcode} and huisnummer:${v.huisnummer} and type:adres`,
      rows: "20",
      fl: "gemeentecode,gemeentenaam,adresseerbaarobject_id,huisletter,huisnummertoevoeging",
    })
  );
}

export async function zoekCoropGegevens(
  fetchFn: typeof fetch,
  vraag: EpVraag,
): Promise<Opzoeking<CoropGegevens>> {
  const v = EpVraagSchema.safeParse(vraag);
  if (!v.success) return { ok: false, fout: "ongeldige_invoer" };
  const a = await haal(fetchFn, "PDOK", coropLocatieUrl(v.data));
  if (!a.ok) return a;
  const loc = LocatieSchema.safeParse(a.json);
  const doc = loc.success ? kiesAdres(loc.data.response.docs, v.data) : undefined;
  if (!doc) return { ok: false, fout: "niet_gevonden" };
  let bouwjaar: number | null = null;
  if (doc.adresseerbaarobject_id) {
    const b = await haalVerblijfsobject(fetchFn, doc.adresseerbaarobject_id);
    if (b.ok) bouwjaar = b.bouwjaar;
    else if (b.stop) return { ok: false, fout: b.stop };
  }
  return {
    ok: true,
    data: { gemeentecode: doc.gemeentecode, gemeente: doc.gemeentenaam.trim(), bouwjaar },
  };
}
