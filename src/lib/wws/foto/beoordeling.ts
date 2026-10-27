// De fotobeoordeling van een keuken, badkamer of toiletruimte: de instructie, het antwoordschema (JSON Schema
// voor de dienst) en de controle van het antwoord (zod). Het antwoord van de AI is onbetrouwbare
// data: alles wordt nagekeken, onbekende elementen of velden maken het antwoord ongeldig. Dezelfde
// instructie en hetzelfde schema worden gebruikt in de vergelijkingstest en in de app.
import * as z from "zod";
import { ELEMENTEN, RUIMTE_NAAM, type FotoElement, type FotoRuimte } from "./elementen";

export const STATUSSEN = ["aanwezig", "waarschijnlijk_aanwezig", "niet_vast_te_stellen"] as const;
export type FotoStatus = (typeof STATUSSEN)[number];

/** Hoogstens zoveel foto's per beoordeling */
export const MAX_FOTOS = 10;
const MAX_BEWIJS = 300;
const MAX_AANTAL = 50;
const MAX_CM = 2000;

export interface ElementOordeel {
  status: FotoStatus;
  /** Gezien, maar niet ingebouwd (telt niet mee) */
  vrijstaand: boolean;
  /** Alleen bij telbare elementen; anders null */
  aantal: number | null;
  /** Alleen bij elementen met soorten; anders null */
  soort: string | null;
  /** Eén korte zin: wat is waar gezien */
  bewijs: string;
  /** Foto's (vanaf 1) waarop het bewijs staat */
  fotos: number[];
}

export type Beoordeling = Record<string, ElementOordeel>;

function elementRegel(e: FotoElement): string {
  const extra = [
    e.soorten ? "soort: " + e.soorten.join(" | ") : "",
    e.inCm ? "geef de breedte in cm" : e.telbaar ? "geef het aantal" : "",
    e.inbouw ? "telt alleen ingebouwd" : "",
  ].filter(Boolean);
  return `- ${e.sleutel} (${e.naam}): ${e.kenmerken}${extra.length ? " [" + extra.join("; ") + "]" : ""}`;
}

/** De instructie; de foto's gaan ervóór mee, elk voorafgegaan door "Foto n" */
export function fotoPrompt(ruimte: FotoRuimte, nFotos: number): string {
  return [
    `Je beoordeelt ${nFotos === 1 ? "een foto" : nFotos + " foto's"} van een ${RUIMTE_NAAM[ruimte]} in een Nederlandse huurwoning, voor een puntentelling volgens het woningwaarderingsstelsel (WWS) van de Huurcommissie. Je stelt per element vast of het op de foto's te zien is. Je kent geen punten toe; de gebruiker controleert alles.`,
    "",
    "Statussen (kies per element precies één):",
    "- aanwezig: het element is duidelijk zichtbaar of herkenbaar aan doorslaggevende visuele kenmerken.",
    "- waarschijnlijk_aanwezig: er zijn concrete aanwijzingen, maar het element is onvoldoende zichtbaar om het te bevestigen.",
    "- niet_vast_te_stellen: de foto's bieden onvoldoende bewijs. Gebruik dit ook als het element zichtbaar ontbreekt.",
    "",
    "Regels:",
    "- Beoordeel alleen wat op de foto's te zien is. Verzin niets en ga niet uit van wat gebruikelijk is.",
    "- Twijfel je tussen twee statussen, kies dan de lagere (aanwezig > waarschijnlijk_aanwezig > niet_vast_te_stellen).",
    "- Elementen met 'telt alleen ingebouwd': zet vrijstaand op true als het apparaat er wel staat maar niet is ingebouwd (de status beschrijft dan of het apparaat er is). Anders vrijstaand false.",
    "- aantal: alleen bij elementen met 'geef het aantal' een geheel getal (0 als je niets ziet), bij 'geef de breedte in cm' de breedte in hele cm; bij andere elementen null.",
    "- soort: alleen bij elementen met een soortenlijst één waarde uit die lijst, of null als je de soort niet kunt zien; bij andere elementen null.",
    "- bewijs: één korte zin (maximaal 25 woorden) met wat je waar ziet, of waarom het niet vast te stellen is.",
    "- fotos: de nummers van de foto's waarop het bewijs staat; leeg als er geen bewijs is.",
    "- Hetzelfde apparaat of meubel kan op meerdere foto's staan; tel het één keer.",
    "- Beschrijf geen personen, namen, documenten of persoonlijke spullen; negeer ze.",
    "",
    "Elementen:",
    ...ELEMENTEN[ruimte].map(elementRegel),
    "",
    "Antwoord met alleen het JSON-object volgens het schema: in elementen per element precies één regel, in de volgorde hierboven.",
  ].join("\n");
}

/**
 * JSON Schema van het antwoord (voor structured output bij Claude en Gemini): één lijst met per
 * element een regel. Bewust plat en klein; een apart blok per element maakte het schema te groot
 * voor Claude. Wat per element mag (soort, aantal) controleert controleerBeoordeling.
 */
export function fotoSchema(ruimte: FotoRuimte): Record<string, unknown> {
  const els = ELEMENTEN[ruimte];
  const soorten = [...new Set(els.flatMap((e) => e.soorten ?? []))];
  return {
    type: "object",
    additionalProperties: false,
    required: ["elementen"],
    properties: {
      elementen: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["element", "status", "vrijstaand", "aantal", "soort", "bewijs", "fotos"],
          properties: {
            element: { type: "string", enum: els.map((e) => e.sleutel) },
            status: { type: "string", enum: [...STATUSSEN] },
            vrijstaand: { type: "boolean" },
            aantal: { anyOf: [{ type: "integer" }, { type: "null" }] },
            soort: soorten.length
              ? { anyOf: [{ type: "string", enum: soorten }, { type: "null" }] }
              : { type: "null" },
            bewijs: { type: "string" },
            fotos: { type: "array", items: { type: "integer" } },
          },
        },
      },
    },
  };
}

const Regel = (nFotos: number) =>
  z
    .object({
      element: z.string(),
      status: z.enum(STATUSSEN),
      vrijstaand: z.boolean(),
      // breedte in cm (keukenkasten) mag tot 2000; een gewoon aantal tot 50 (zie hieronder)
      aantal: z.number().int().min(0).max(MAX_CM).nullable(),
      soort: z.string().nullable(),
      bewijs: z.string().max(MAX_BEWIJS * 2),
      fotos: z.array(z.number().int().min(1).max(nFotos)).max(MAX_FOTOS),
    })
    .strict();

/**
 * Het antwoord van de AI controleren. null als het niet klopt: verkeerde vorm, een element dat
 * ontbreekt, dubbel of onbekend is, een soort die bij dat element niet bestaat, of een foto die
 * niet bestaat. Velden die bij een element niet horen worden genegeerd (aantal bij een niet
 * telbaar element, vrijstaand bij een element dat niet ingebouwd hoeft te zijn); het bewijs wordt
 * ingekort.
 */
export function controleerBeoordeling(
  ruimte: FotoRuimte,
  nFotos: number,
  data: unknown,
): Beoordeling | null {
  const els = ELEMENTEN[ruimte];
  const r = z
    .object({ elementen: z.array(Regel(nFotos)).max(els.length * 2) })
    .strict()
    .safeParse(data);
  if (!r.success) return null;
  const per = new Map<string, z.infer<ReturnType<typeof Regel>>>();
  for (const regel of r.data.elementen) {
    if (per.has(regel.element)) return null;
    per.set(regel.element, regel);
  }
  if (per.size !== els.length) return null;
  const uit: Beoordeling = {};
  for (const e of els) {
    const o = per.get(e.sleutel);
    if (!o) return null;
    if (o.soort !== null && e.soorten && !e.soorten.includes(o.soort)) return null;
    if (o.aantal !== null && !e.inCm && o.aantal > MAX_AANTAL) return null;
    uit[e.sleutel] = {
      status: o.status,
      vrijstaand: !!e.inbouw && o.vrijstaand,
      aantal: e.telbaar ? o.aantal : null,
      soort: e.soorten ? o.soort : null,
      bewijs: o.bewijs.replace(/\s+/g, " ").trim().slice(0, MAX_BEWIJS),
      fotos: [...new Set(o.fotos)].sort((a, b) => a - b),
    };
  }
  return uit;
}

/** JSON uit een tekstantwoord halen (ook als er toch tekst of ```json omheen staat) */
export function leesJson(tekst: string): unknown {
  const t = tekst.trim();
  const begin = t.indexOf("{");
  const eind = t.lastIndexOf("}");
  if (begin < 0 || eind <= begin) return null;
  try {
    return JSON.parse(t.slice(begin, eind + 1));
  } catch {
    return null;
  }
}
