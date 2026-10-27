// Foto's van een woning sorteren: per foto zegt de AI of het een keuken, badkamer, toiletruimte of
// iets anders is. Daarna beoordeelt beoordeling.ts per ruimte (met de geteste instructie). Het
// antwoord is onbetrouwbare data en wordt met zod gecontroleerd.
import * as z from "zod";
import type { FotoRuimte } from "./elementen";

export const FOTO_SOORTEN = ["keuken", "badkamer", "toilet", "anders"] as const;
/** Bij een hele map ("Map inlezen") kan een afbeelding ook de plattegrond zijn */
export const MAP_SOORTEN = [...FOTO_SOORTEN, "plattegrond"] as const;
export type FotoSoort = (typeof MAP_SOORTEN)[number];

const soortenVoor = (metPlattegrond: boolean): readonly FotoSoort[] =>
  metPlattegrond ? MAP_SOORTEN : FOTO_SOORTEN;

/** Hoogstens zoveel foto's per woning */
export const MAX_WONING_FOTOS = 30;
const MAX_REDEN = 200;

export interface FotoSortering {
  soort: FotoSoort;
  /** Eén korte zin: waaraan de ruimte te herkennen is */
  reden: string;
}

export function sorteerPrompt(nFotos: number, metPlattegrond = false): string {
  return [
    `Je krijgt ${nFotos === 1 ? "een foto" : nFotos + " foto's"} van een Nederlandse huurwoning, elk voorafgegaan door "Foto n". Zeg per foto welke ruimte erop staat.`,
    "",
    "Soorten (kies per foto precies één):",
    "- keuken: aanrecht, kookplaat, keukenkasten of keukenapparatuur. Ook een open keuken in de woonkamer.",
    "- badkamer: een ruimte met een douche of bad, of een wastafel buiten het toilet. Een badkamer met een toilet erin is een badkamer.",
    "- toilet: een aparte toiletruimte met alleen een toilet en eventueel een fontein (klein handenwasbakje).",
    "- anders: elke andere ruimte (woonkamer zonder keuken, slaapkamer, hal, berging, buiten), of als niet te zien is welke ruimte het is.",
    ...(metPlattegrond
      ? [
          "- plattegrond: geen foto maar een tekening van de woning van bovenaf (plattegrond of bouwtekening), met wanden en ruimten.",
        ]
      : []),
    "",
    "Regels:",
    "- Beoordeel alleen wat op de foto te zien is. Twijfel je, kies dan anders.",
    "- reden: één korte zin (maximaal 15 woorden) waaraan je de ruimte herkent.",
    "- Beschrijf geen personen, namen, documenten of persoonlijke spullen; negeer ze.",
    "",
    "Antwoord met alleen het JSON-object volgens het schema: in fotos per foto precies één regel, in de volgorde van de foto's.",
  ].join("\n");
}

/** JSON Schema van het antwoord (structured output bij Gemini) */
export function sorteerSchema(metPlattegrond = false): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["fotos"],
    properties: {
      fotos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["foto", "soort", "reden"],
          properties: {
            foto: { type: "integer" },
            soort: { type: "string", enum: [...soortenVoor(metPlattegrond)] },
            reden: { type: "string" },
          },
        },
      },
    },
  };
}

/**
 * Het antwoord controleren. null als het niet klopt: verkeerde vorm, een foto die ontbreekt,
 * dubbel is of niet bestaat. Geeft de sortering in de volgorde van de foto's.
 */
export function controleerSortering(
  nFotos: number,
  data: unknown,
  metPlattegrond = false,
): FotoSortering[] | null {
  const r = z
    .object({
      fotos: z
        .array(
          z
            .object({
              foto: z.number().int().min(1).max(nFotos),
              soort: metPlattegrond ? z.enum(MAP_SOORTEN) : z.enum(FOTO_SOORTEN),
              reden: z.string().max(MAX_REDEN * 2),
            })
            .strict(),
        )
        .length(nFotos),
    })
    .strict()
    .safeParse(data);
  if (!r.success) return null;
  const uit: (FotoSortering | undefined)[] = new Array(nFotos);
  for (const f of r.data.fotos) {
    if (uit[f.foto - 1]) return null;
    uit[f.foto - 1] = {
      soort: f.soort,
      reden: f.reden.replace(/\s+/g, " ").trim().slice(0, MAX_REDEN),
    };
  }
  return uit as FotoSortering[];
}

export const isFotoRuimte = (s: FotoSoort): s is FotoRuimte =>
  s === "keuken" || s === "badkamer" || s === "toilet";
