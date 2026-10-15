// De aanroepen naar Claude (Anthropic) en Gemini (Google) zelf — wat in wws-site.html de
// Supabase-functies /claude en /floorplan-image deden. Draait alleen op de server (vanuit
// ai.functions.ts); fetch, sleutel en model worden meegegeven, zodat dit zonder netwerk te
// testen is. Foutteksten van de diensten worden nooit doorgegeven of gelogd.
import { herkenAfbeelding, type Afbeeldingstype } from "../plattegrond/opslag";

export const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
export const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const STANDAARD_CLAUDE_MODEL = "claude-sonnet-5-5";
export const STANDAARD_GEMINI_MODEL = "gemini-3.1-flash-image";
/** Zoals de bron (55 seconden) */
export const AI_TIMEOUT_MS = 55_000;
/** Grootste afbeelding die terug mag komen (base64-tekens) */
const MAX_UIT_BASE64 = 14_000_000;

export type AiFout =
  | "sleutel_ontbreekt"
  | "sleutel_ongeldig"
  | "te_veel_verzoeken"
  | "afbeelding_geweigerd"
  | "time_out"
  | "dienst_onbereikbaar"
  | "onbruikbaar_antwoord";

export type AiUitkomst<T> = { ok: true; data: T } | { ok: false; fout: AiFout };

export interface Afbeelding {
  /** base64, zonder "data:"-voorvoegsel */
  data: string;
  type: Afbeeldingstype;
}

/** Alleen onze code en de HTTP-status loggen — nooit de body, de sleutel of de prompt */
function logFout(dienst: string, fout: AiFout, status?: number) {
  console.warn(`[ai] ${dienst}: ${fout}${status ? ` (HTTP ${status})` : ""}`);
}

function foutVoorStatus(status: number, metAfbeelding: boolean): AiFout {
  if (status === 401 || status === 403) return "sleutel_ongeldig";
  if (status === 429) return "te_veel_verzoeken";
  if (metAfbeelding && (status === 400 || status === 413 || status === 422))
    return "afbeelding_geweigerd";
  return "dienst_onbereikbaar";
}

async function post(
  fetchFn: typeof fetch,
  dienst: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  metAfbeelding: boolean,
): Promise<AiUitkomst<unknown>> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (e) {
    const fout: AiFout =
      e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
        ? "time_out"
        : "dienst_onbereikbaar";
    logFout(dienst, fout);
    return { ok: false, fout };
  }
  if (!res.ok) {
    const fout = foutVoorStatus(res.status, metAfbeelding);
    logFout(dienst, fout, res.status);
    return { ok: false, fout };
  }
  try {
    return { ok: true, data: await res.json() };
  } catch {
    logFout(dienst, "onbruikbaar_antwoord", res.status);
    return { ok: false, fout: "onbruikbaar_antwoord" };
  }
}

/** Claude: tekst-antwoord op een prompt, eventueel met afbeeldingen */
export async function vraagClaude(
  fetchFn: typeof fetch,
  sleutel: string | undefined,
  model: string | undefined,
  prompt: string,
  afbeeldingen: readonly Afbeelding[] = [],
): Promise<AiUitkomst<string>> {
  if (!sleutel) {
    logFout("Claude", "sleutel_ontbreekt");
    return { ok: false, fout: "sleutel_ontbreekt" };
  }
  const r = await post(
    fetchFn,
    "Claude",
    CLAUDE_URL,
    { "x-api-key": sleutel, "anthropic-version": "2023-06-01" },
    {
      model: model || STANDAARD_CLAUDE_MODEL,
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            ...afbeeldingen.map((a) => ({
              type: "image",
              source: { type: "base64", media_type: a.type, data: a.data },
            })),
            { type: "text", text: prompt },
          ],
        },
      ],
    },
    afbeeldingen.length > 0,
  );
  if (!r.ok) return r;
  const inhoud = (r.data as { content?: unknown })?.content;
  const tekst = Array.isArray(inhoud)
    ? inhoud
        .filter(
          (c): c is { type: "text"; text: string } =>
            !!c && typeof c === "object" && c.type === "text" && typeof c.text === "string",
        )
        .map((c) => c.text)
        .join("")
    : "";
  if (!tekst) {
    logFout("Claude", "onbruikbaar_antwoord");
    return { ok: false, fout: "onbruikbaar_antwoord" };
  }
  return { ok: true, data: tekst };
}

/** Zoekt in een (onbekend gevormd) antwoord de laatste afbeelding: { type: "image", data } */
export function zoekAfbeelding(x: unknown, diepte = 0): string | null {
  if (!x || typeof x !== "object" || diepte > 8) return null;
  if (Array.isArray(x)) {
    for (let i = x.length - 1; i >= 0; i--) {
      const r = zoekAfbeelding(x[i], diepte + 1);
      if (r) return r;
    }
    return null;
  }
  const o = x as Record<string, unknown>;
  if (o["type"] === "image" && typeof o["data"] === "string") return o["data"];
  const inline = o["inlineData"] ?? o["inline_data"];
  if (inline && typeof inline === "object") {
    const d = (inline as Record<string, unknown>)["data"];
    if (typeof d === "string") return d;
  }
  for (const k of Object.keys(o)) {
    const r = zoekAfbeelding(o[k], diepte + 1);
    if (r) return r;
  }
  return null;
}

/** Gemini: bewerkt de plattegrond volgens de instructie; geeft een gecontroleerde afbeelding */
export async function vraagGeminiAfbeelding(
  fetchFn: typeof fetch,
  sleutel: string | undefined,
  model: string | undefined,
  prompt: string,
  referentie: Afbeelding,
): Promise<AiUitkomst<Afbeelding>> {
  if (!sleutel) {
    logFout("Gemini", "sleutel_ontbreekt");
    return { ok: false, fout: "sleutel_ontbreekt" };
  }
  const r = await post(
    fetchFn,
    "Gemini",
    GEMINI_URL,
    { "x-goog-api-key": sleutel },
    {
      model: model || STANDAARD_GEMINI_MODEL,
      // niet bewaren bij Google (standaard 55 dagen)
      store: false,
      input: [
        { type: "text", text: prompt },
        { type: "image", mime_type: referentie.type, data: referentie.data },
      ],
    },
    true,
  );
  if (!r.ok) return r;
  const data = zoekAfbeelding(r.data);
  const type = data && data.length <= MAX_UIT_BASE64 ? typeVanBase64(data) : null;
  if (!data || !type) {
    logFout("Gemini", "onbruikbaar_antwoord");
    return { ok: false, fout: "onbruikbaar_antwoord" };
  }
  return { ok: true, data: { data, type } };
}

/** Echt een JPEG/PNG/WebP? Controleert de eerste bytes van base64-data */
export function typeVanBase64(b64: string): Afbeeldingstype | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64.slice(0, 64)) || b64.length < 16) return null;
  try {
    const kop = atob(b64.slice(0, 24));
    return herkenAfbeelding(Uint8Array.from(kop, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}
