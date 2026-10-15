// Server functions voor de AI: plattegrond en verduurzamingsadvies inlezen (Claude) en een
// AI-afbeelding van een indelingsvariant (Gemini). Elke aanroep:
// - vereist een ingelogde gebruiker met schrijfrol (rollenMiddleware, met het eigen token);
// - controleert de invoer met zod (ook de echte inhoud van afbeeldingen);
// - boekt het gebruik via ai_gebruik_boeken() met het eigen token (daglimiet per gebruiker);
// - bouwt de instructie zelf op (prompts.ts) en stuurt alleen afbeelding/tekst + instructie;
// - geeft alleen eigen foutcodes terug, nooit de foutmelding van de dienst.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { vereisSchrijfrol } from "../rollenMiddleware";
import type { PlattegrondAntwoord } from "./antwoorden";
import { vraagClaude, vraagGeminiAfbeelding, type AiFout, type Afbeelding } from "./dienst";
import { verwijderPatronen } from "./privacy";
import { energieAdviesPrompt, indelingAIPrompt, platPrompt } from "./prompts";
import { verwerkEnergieAdvies, verwerkPlattegrond } from "./verwerken";
import {
  Boeking,
  EnergieAdviesVraag,
  PlattegrondVraag,
  VariantAfbeeldingVraag,
  type Gebruik,
} from "./vragen";
import type { EnergieAdvies } from "../types";

export type AiServerFout = AiFout | "limiet_bereikt" | "geen_maatregelen" | "geen_toegang";
export type AiAntwoord<T> =
  { ok: true; data: T; gebruik: Gebruik } | { ok: false; fout: AiServerFout; gebruik?: Gebruik };

type Soort = "lezen" | "afbeelding";

/** Boekt één aanroep; null = niet gelukt (geen toegang of database-fout) */
async function boek(
  db: SupabaseClient<Database>,
  soort: Soort,
): Promise<{ toegestaan: boolean; gebruik: Gebruik } | null> {
  const { data, error } = await db.rpc("ai_gebruik_boeken", { _soort: soort });
  if (error) {
    console.warn(`[ai] gebruik boeken mislukt (${error.code ?? "?"})`);
    return null;
  }
  const b = Boeking.safeParse(data);
  if (!b.success) return null;
  return {
    toegestaan: b.data.toegestaan,
    gebruik: { gebruikt: b.data.gebruikt, limiet: b.data.limiet },
  };
}

const env = (k: string) => process.env[k] || undefined;

/** Eerst sleutel, dan limiet boeken, dan de dienst — een ontbrekende sleutel telt niet mee */
async function metLimiet<T>(
  db: SupabaseClient<Database>,
  soort: Soort,
  sleutelNaam: string,
  roep: () => Promise<{ ok: true; data: T } | { ok: false; fout: AiServerFout }>,
): Promise<AiAntwoord<T>> {
  if (!env(sleutelNaam)) return { ok: false, fout: "sleutel_ontbreekt" };
  const b = await boek(db, soort);
  if (!b) return { ok: false, fout: "geen_toegang" };
  if (!b.toegestaan) return { ok: false, fout: "limiet_bereikt", gebruik: b.gebruik };
  const r = await roep();
  return r.ok ? { ok: true, data: r.data, gebruik: b.gebruik } : { ...r, gebruik: b.gebruik };
}

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
