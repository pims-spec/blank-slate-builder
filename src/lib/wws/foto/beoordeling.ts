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
    e.telbaar ? "geef het aantal" : "",
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
    "- aantal: alleen bij elementen met 'geef het aantal' een geheel getal (0 als je niets ziet); bij andere elementen null.",
    "- soort: alleen bij elementen met een soortenlijst één waarde uit die lijst, of null als je de soort niet kunt zien; bij andere elementen null.",
    "- bewijs: één korte zin (maximaal 25 woorden) met wat je waar ziet, of waarom het niet vast te stellen is.",
    "- fotos: de nummers van de foto's waarop het bewijs staat; leeg als er geen bewijs is.",
    "- Hetzelfde apparaat of meubel kan op meerdere foto's staan; tel het één keer.",
    "- Beschrijf geen personen, namen, documenten of persoonlijke spullen; negeer ze.",
    "",
    "Elementen:",
    ...ELEMENTEN[ruimte].map(elementRegel),
    "",
    "Antwoord met alleen het JSON-object volgens het schema, met elk element precies één keer.",
  ].join("\n");
}

/** JSON Schema van het antwoord (voor structured output bij Claude en Gemini) */
export function fotoSchema(ruimte: FotoRuimte): Record<string, unknown> {
  const element = (e: FotoElement) => ({
    type: "object",
    additionalProperties: false,
    required: ["status", "vrijstaand", "aantal", "soort", "bewijs", "fotos"],
    properties: {
      status: { type: "string", enum: [...STATUSSEN] },
      vrijstaand: { type: "boolean" },
      aantal: e.telbaar ? { anyOf: [{ type: "integer" }, { type: "null" }] } : { type: "null" },
      soort: e.soorten
        ? { anyOf: [{ type: "string", enum: [...e.soorten] }, { type: "null" }] }
        : { type: "null" },
      bewijs: { type: "string" },
      fotos: { type: "array", items: { type: "integer" } },
    },
  });
  const els = ELEMENTEN[ruimte];
  return {
    type: "object",
    additionalProperties: false,
    required: els.map((e) => e.sleutel),
    properties: Object.fromEntries(els.map((e) => [e.sleutel, element(e)])),
  };
}

function elementZod(e: FotoElement, nFotos: number) {
  return z
    .object({
      status: z.enum(STATUSSEN),
      vrijstaand: z.boolean(),
      aantal: e.telbaar ? z.number().int().min(0).max(50).nullable() : z.null(),
      soort: e.soorten ? z.enum(e.soorten as [string, ...string[]]).nullable() : z.null(),
      bewijs: z.string().max(MAX_BEWIJS * 2),
      fotos: z.array(z.number().int().min(1).max(nFotos)).max(MAX_FOTOS),
    })
    .strict();
}

/**
 * Het antwoord van de AI controleren. null als het niet klopt (verkeerde vorm, onbekende of
 * ontbrekende elementen, foto's die niet bestaan). Vrijstaand bij een element dat niet ingebouwd
 * hoeft te zijn wordt genegeerd (false); het bewijs wordt ingekort.
 */
export function controleerBeoordeling(
  ruimte: FotoRuimte,
  nFotos: number,
  data: unknown,
): Beoordeling | null {
  const els = ELEMENTEN[ruimte];
  const schema = z
    .object(Object.fromEntries(els.map((e) => [e.sleutel, elementZod(e, nFotos)])))
    .strict();
  const r = schema.safeParse(data);
  if (!r.success) return null;
  const uit: Beoordeling = {};
  for (const e of els) {
    const o = r.data[e.sleutel] as z.infer<ReturnType<typeof elementZod>>;
    uit[e.sleutel] = {
      ...o,
      vrijstaand: !!e.inbouw && o.vrijstaand,
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
