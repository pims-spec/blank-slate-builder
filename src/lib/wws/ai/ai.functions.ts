// Server functions voor de AI: plattegrond en verduurzamingsadvies inlezen (Claude), een
// AI-afbeelding van een indelingsvariant en de fotobeoordeling van keuken, badkamer of toilet
// (Gemini). Elke aanroep:
// - vereist een ingelogde gebruiker met schrijfrol (rollenMiddleware, met het eigen token);
// - controleert de invoer met zod (ook de echte inhoud van afbeeldingen);
// - boekt het gebruik via ai_gebruik_boeken() met het eigen token (daglimiet per gebruiker,
//   limiet.ts);
// - bouwt de instructie zelf op (prompts.ts) en stuurt alleen afbeelding/tekst + instructie;
// - geeft alleen eigen foutcodes terug, nooit de foutmelding van de dienst.
import { createServerFn } from "@tanstack/react-start";
import { beoordeelMetGemini } from "../foto/gemini";
import type { Beoordeling } from "../foto/beoordeling";
import { vereisSchrijfrol } from "../rollenMiddleware";
import type { PlattegrondAntwoord } from "./antwoorden";
import { vraagClaude, vraagGeminiAfbeelding, type Afbeelding } from "./dienst";
import { metLimiet, type AiAntwoord } from "./limiet";
import { verwijderPatronen } from "./privacy";
import { energieAdviesPrompt, indelingAIPrompt, platPrompt } from "./prompts";
import { verwerkEnergieAdvies, verwerkPlattegrond } from "./verwerken";
import { EnergieAdviesVraag, FotoVraag, PlattegrondVraag, VariantAfbeeldingVraag } from "./vragen";
import type { EnergieAdvies } from "../types";

export type { AiAntwoord, AiServerFout } from "./limiet";

const env = (k: string) => process.env[k] || undefined;

export const leesPlattegrond = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => PlattegrondVraag.parse(d))
  .handler(async ({ data, context }): Promise<AiAntwoord<PlattegrondAntwoord>> =>
    metLimiet(context.supabase, "lezen", "ANTHROPIC_API_KEY", async () => {
      const afb: Afbeelding = data.afbeelding;
      const r = await vraagClaude(
        fetch,
        env("ANTHROPIC_API_KEY"),
        env("CLAUDE_MODEL"),
        platPrompt(1, verwijderPatronen(data.notitie.trim())),
        [afb],
      );
      if (!r.ok) return r;
      const p = verwerkPlattegrond(r.data);
      return p ? { ok: true, data: p } : { ok: false, fout: "onbruikbaar_antwoord" };
    }),
  );

export const leesEnergieAdvies = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => EnergieAdviesVraag.parse(d))
  .handler(
    async ({ data, context }): Promise<AiAntwoord<Omit<EnergieAdvies, "bestand" | "geuploadOp">>> =>
      metLimiet(context.supabase, "lezen", "ANTHROPIC_API_KEY", async () => {
        const r = await vraagClaude(
          fetch,
          env("ANTHROPIC_API_KEY"),
          env("CLAUDE_MODEL"),
          // de browser heeft de gegevens van de telling al weggehaald; hier nog de algemene patronen
          energieAdviesPrompt(verwijderPatronen(data.tekst)),
        );
        if (!r.ok) return r;
        const v = verwerkEnergieAdvies(r.data);
        return v.ok ? { ok: true, data: v.advies } : v;
      }),
  );

export const maakVariantAfbeelding = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => VariantAfbeeldingVraag.parse(d))
  .handler(async ({ data, context }): Promise<AiAntwoord<Afbeelding>> =>
    metLimiet(context.supabase, "afbeelding", "GEMINI_API_KEY", () =>
      vraagGeminiAfbeelding(
        fetch,
        env("GEMINI_API_KEY"),
        env("GEMINI_IMAGE_MODEL"),
        indelingAIPrompt(data.ruimten),
        data.afbeelding,
      ),
    ),
  );

/** De fotobeoordeling telt als één keer "lezen", ook bij meerdere foto's */
export const beoordeelFotos = createServerFn({ method: "POST" })
  .middleware([vereisSchrijfrol])
  .validator((d: unknown) => FotoVraag.parse(d))
  .handler(async ({ data, context }): Promise<AiAntwoord<Beoordeling>> =>
    metLimiet(context.supabase, "lezen", "GEMINI_API_KEY", () =>
      beoordeelMetGemini(
        fetch,
        env("GEMINI_API_KEY"),
        env("GEMINI_FOTO_MODEL"),
        data.ruimte,
        data.fotos,
      ),
    ),
  );
