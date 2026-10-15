// De antwoorden van Claude zijn onbetrouwbare data: hier gecontroleerd met zod (vorm, lengtes,
// aantallen) voordat er iets in een telling komt. Onbekende velden vallen weg.
import * as z from "zod";
import { LABELS } from "../basis";

const tekst = (max: number) => z.string().max(max).catch("");
const getal = z
  .union([z.number().finite(), z.string().max(20)])
  .nullish()
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  })
  .catch(null);
const aantal = getal.transform((n) => (n == null ? 0 : Math.max(0, Math.min(20, Math.round(n)))));

const Bbox = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().finite(),
    h: z.number().finite(),
  })
  .optional()
  .catch(undefined);

const Ruimte = z.object({
  soort: z.enum(["vertrek", "overig", "verkeer"]).catch("overig"),
  type: tekst(40),
  naam: tekst(80),
  lengte_m: getal,
  breedte_m: getal,
  m2: getal,
  bron: z.enum(["afgelezen", "berekend", "ingeschat"]).catch("ingeschat"),
  zekerheid: tekst(20),
  opmerking: tekst(200),
  bbox: Bbox,
});

export const PlattegrondAntwoord = z.object({
  maatvoering: tekst(300),
  ruimten: z.array(Ruimte).max(60),
  keuken: z
    .object({ aanrecht_m: getal, bron: tekst(20) })
    .partial()
    .catch({}),
  sanitair: z
    .object({
      toilet_toiletruimte: aantal,
      toilet_badkamer: aantal,
      wastafel_badkamer: aantal,
      fontein_toiletruimte: aantal,
      douche: aantal,
      bad: aantal,
      bad_douche: aantal,
    })
    .partial()
    .catch({}),
  buitenruimten: z
    .array(z.object({ naam: tekst(80), m2: getal, bron: tekst(20) }))
    .max(20)
    .catch([]),
  nameten: z.array(z.string().max(200)).max(10).catch([]),
});
export type PlattegrondAntwoord = z.infer<typeof PlattegrondAntwoord>;

const Label = z.enum(LABELS as [string, ...string[]]);

export const EnergieAdviesAntwoord = z.object({
  huidig: z
    .object({
      label: tekst(10),
      woningtype: tekst(80),
      bouwjaar: z.union([z.string().max(10), z.number()]).catch(""),
      oppervlakte_m2: getal,
      installaties: z
        .object({
          verwarming: tekst(160),
          warmwater: tekst(160),
          pv: tekst(160),
          ventilatie: tekst(160),
          koeling: tekst(160),
        })
        .partial()
        .catch({}),
      isolatie: z
        .object({ muur: tekst(160), glas: tekst(160) })
        .partial()
        .catch({}),
    })
    .partial()
    .nullish()
    .catch(null),
  maatregelen: z
    .array(
      z.object({
        vanLabel: z.string().max(10),
        naarLabel: z.string().max(10),
        omschrijving: z.array(z.string()).catch([]),
        kosten_min: getal,
        kosten_max: getal,
        besparing_min: getal,
        besparing_max: getal,
      }),
    )
    .max(30),
});
export type EnergieAdviesAntwoord = z.infer<typeof EnergieAdviesAntwoord>;

/** Alleen geldige labels, zoals runEnergieAdvies() in de bron */
export const isLabel = (s: string) => Label.safeParse(s).success;

/** Het eerste JSON-object uit een tekstantwoord (Claude zet er soms uitleg omheen) */
export function jsonUitTekst(t: string): unknown {
  const begin = t.indexOf("{");
  const eind = t.lastIndexOf("}");
  if (begin < 0 || eind <= begin) return null;
  try {
    return JSON.parse(t.slice(begin, eind + 1));
  } catch {
    return null;
  }
}
