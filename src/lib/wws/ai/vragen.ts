// Wat de browser naar de AI-server functions mag sturen: alleen de afbeelding of tekst en een
// paar parameters. Gedeeld door browser (vooraf controleren) en server (validator).
import * as z from "zod";
import { OVERIG_TYPES, VERTREK_TYPES } from "../basis";
import { typeVanBase64 } from "./dienst";

/** ca. 5,2 MB aan afbeelding (zoals de bron), in base64 */
export const MAX_AFBEELDING_BASE64 = 7_200_000;
export const MAX_ADVIES_TEKST = 90_000;

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
