// Wat de browser naar de AI-server functions mag sturen: alleen de afbeelding of tekst en een
// paar parameters. Gedeeld door browser (vooraf controleren) en server (validator).
import * as z from "zod";
import { OVERIG_TYPES, VERTREK_TYPES } from "../basis";
import { MAX_FOTOS } from "../foto/beoordeling";
import { MAX_WONING_FOTOS } from "../foto/sorteren";
import { typeVanBase64 } from "./dienst";

/** ca. 5,2 MB aan afbeelding (zoals de bron), in base64 */
export const MAX_AFBEELDING_BASE64 = 7_200_000;
export const MAX_ADVIES_TEKST = 90_000;
/** Fotobeoordeling: per foto (verkleind tot 1.568 px past dat ruim) en alle foto's samen, in base64 */
export const MAX_FOTO_BASE64 = 2_500_000;
export const MAX_FOTOS_BASE64 = 8_000_000;
/** Sorteren: kleine versies (768 px) van alle foto's van de woning */
export const MAX_SORTEER_FOTO_BASE64 = 600_000;

export const AfbeeldingVraag = z
  .object({
    data: z
      .string()
      .min(16)
      .max(MAX_AFBEELDING_BASE64)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  })
  // de inhoud moet echt dat type zijn (magic bytes), niet alleen zo heten
  .refine((a) => typeVanBase64(a.data) === a.type, "Geen geldige afbeelding.");

export const PlattegrondVraag = z.object({
  afbeelding: AfbeeldingVraag,
  notitie: z.string().max(500).default(""),
});
export type PlattegrondVraag = z.input<typeof PlattegrondVraag>;

export const EnergieAdviesVraag = z.object({
  tekst: z.string().min(20).max(MAX_ADVIES_TEKST),
});

export const FotoVraag = z.object({
  ruimte: z.enum(["keuken", "badkamer", "toilet"]),
  fotos: z
    .array(AfbeeldingVraag.refine((a) => a.data.length <= MAX_FOTO_BASE64, "Foto te groot."))
    .min(1)
    .max(MAX_FOTOS)
    .refine(
      (fs) => fs.reduce((n, f) => n + f.data.length, 0) <= MAX_FOTOS_BASE64,
      "Samen te groot.",
    ),
});
export type FotoVraag = z.input<typeof FotoVraag>;

export const FotoSorteerVraag = z.object({
  fotos: z
    .array(
      AfbeeldingVraag.refine((a) => a.data.length <= MAX_SORTEER_FOTO_BASE64, "Foto te groot."),
    )
    .min(1)
    .max(MAX_WONING_FOTOS)
    .refine(
      (fs) => fs.reduce((n, f) => n + f.data.length, 0) <= MAX_FOTOS_BASE64,
      "Samen te groot.",
    ),
  /** "Map inlezen": een afbeelding kan ook de plattegrond zijn */
  metPlattegrond: z.boolean().optional(),
});
export type FotoSorteerVraag = z.input<typeof FotoSorteerVraag>;

const VERTREK_KEYS = new Set<string>(VERTREK_TYPES.map((t) => t.k));
const OVERIG_KEYS = new Set<string>(OVERIG_TYPES.map((t) => t.k));

export const VariantAfbeeldingVraag = z.object({
  afbeelding: AfbeeldingVraag,
  ruimten: z
    .array(
      z
        .object({
          groep: z.enum(["vertrekken", "overig"]),
          type: z.string().max(40),
          m2: z.number().finite().min(0).max(2000),
          vast: z.boolean(),
        })
        .refine((r) => (r.groep === "vertrekken" ? VERTREK_KEYS : OVERIG_KEYS).has(r.type)),
    )
    .min(1)
    .max(60),
});
export type VariantAfbeeldingVraag = z.input<typeof VariantAfbeeldingVraag>;

/** Teruggave van ai_gebruik_boeken() */
export const Boeking = z.object({
  toegestaan: z.boolean(),
  gebruikt: z.number().int().min(0),
  limiet: z.number().int().min(0),
});
export type Gebruik = Pick<z.infer<typeof Boeking>, "gebruikt" | "limiet">;
