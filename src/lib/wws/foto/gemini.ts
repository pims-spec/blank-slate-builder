// De fotobeoordeling bij Gemini: instructie en schema bouwt de server zelf, het antwoord gaat door
// controleerBeoordeling. Draait alleen op de server (beoordeelFotos in ai.functions.ts).
import { vraagGeminiJson, type Afbeelding, type AiUitkomst } from "../ai/dienst";
import {
  controleerBeoordeling,
  fotoPrompt,
  fotoSchema,
  leesJson,
  type Beoordeling,
} from "./beoordeling";
import type { FotoRuimte } from "./elementen";

export async function beoordeelMetGemini(
  fetchFn: typeof fetch,
  sleutel: string | undefined,
  model: string | undefined,
  ruimte: FotoRuimte,
  fotos: readonly Afbeelding[],
): Promise<AiUitkomst<Beoordeling>> {
  const r = await vraagGeminiJson(
    fetchFn,
    sleutel,
    model,
    fotoPrompt(ruimte, fotos.length),
    fotos,
    fotoSchema(ruimte),
  );
  if (!r.ok) return r;
  const b = controleerBeoordeling(ruimte, fotos.length, leesJson(r.data));
  if (!b) {
    console.warn("[ai] Gemini: onbruikbaar_antwoord (fotobeoordeling)");
    return { ok: false, fout: "onbruikbaar_antwoord" };
  }
  return { ok: true, data: b };
}
