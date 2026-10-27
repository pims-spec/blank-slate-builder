import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { GEMINI_URL, STANDAARD_GEMINI_FOTO_MODEL, zoekTekst } from "../ai/dienst";
import { metLimiet } from "../ai/limiet";
import { FotoVraag, MAX_FOTO_BASE64 } from "../ai/vragen";
import { fotoPrompt, fotoSchema, MAX_FOTOS } from "./beoordeling";
import { ELEMENTEN } from "./elementen";
import { beoordeelMetGemini } from "./gemini";

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes, ...new Array(30).fill(0)));
/** Een JPEG van n base64-tekens (kop zonder opvulling, daarna nullen) */
const jpegVan = (n: number) => {
  const kop = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, ...new Array(32).fill(0)));
  return { data: kop + "A".repeat(n - kop.length), type: "image/jpeg" as const };
};
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const foto = { data: JPEG, type: "image/jpeg" as const };

const waarschuwingen: string[] = [];
vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
  waarschuwingen.push(a.join(" "));
});
afterEach(() => {
  waarschuwingen.length = 0;
  vi.unstubAllEnvs();
});

function nepFetch(status: number, body: unknown, gooit?: Error) {
  const aanroepen: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    aanroepen.push({ url, init });
    if (gooit) throw gooit;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, aanroepen };
}

/** Een geldig toiletantwoord, verpakt zoals de Interactions API het teruggeeft */
const toiletAntwoord = (over: Record<string, unknown> = {}) => ({
  outputs: [
    {
      type: "text",
      text: JSON.stringify({
        elementen: ELEMENTEN.toilet.map((e) => ({
          element: e.sleutel,
          status: "aanwezig",
          vrijstaand: false,
          aantal: null,
          soort: e.soorten ? "hangend" : null,
          bewijs: "Duidelijk te zien.",
          fotos: [1],
          ...over,
        })),
      }),
    },
  ],
});

describe("beoordeelMetGemini", () => {
  it("stuurt foto's met nummer, de instructie en het schema; niet bewaren; standaard Argon", async () => {
    const { fn, aanroepen } = nepFetch(200, toiletAntwoord());
    const r = await beoordeelMetGemini(fn, "sleutel", undefined, "toilet", [foto, foto]);
    expect(r.ok && r.data["toilet"]).toMatchObject({ status: "aanwezig", soort: "hangend" });
    expect(aanroepen).toHaveLength(1);
    expect(aanroepen[0]!.url).toBe(GEMINI_URL);
    expect((aanroepen[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "sleutel",
    );
    const body = JSON.parse(aanroepen[0]!.init.body as string);
    expect(body.model).toBe(STANDAARD_GEMINI_FOTO_MODEL);
    expect(STANDAARD_GEMINI_FOTO_MODEL).toBe("gemini-4-argon");
    expect(body.store).toBe(false);
    expect(body.input).toEqual([
      { type: "text", text: "Foto 1" },
      { type: "image", mime_type: "image/jpeg", data: JPEG },
      { type: "text", text: "Foto 2" },
      { type: "image", mime_type: "image/jpeg", data: JPEG },
      { type: "text", text: fotoPrompt("toilet", 2) },
    ]);
    expect(body.response_format).toEqual({
      type: "text",
      mime_type: "application/json",
      schema: fotoSchema("toilet"),
    });
  });

  it("model instelbaar; zonder sleutel geen aanroep", async () => {
    const { fn, aanroepen } = nepFetch(200, toiletAntwoord());
    await beoordeelMetGemini(fn, "s", "gemini-3.8-flash", "toilet", [foto]);
    expect(JSON.parse(aanroepen[0]!.init.body as string).model).toBe("gemini-3.8-flash");
    const leeg = nepFetch(200, toiletAntwoord());
    expect(await beoordeelMetGemini(leeg.fn, undefined, undefined, "toilet", [foto])).toEqual({
      ok: false,
      fout: "sleutel_ontbreekt",
    });
    expect(leeg.aanroepen).toHaveLength(0);
  });

  it("ongeldig antwoord: onbruikbaar (ook een niet-bestaande foto of geen tekst)", async () => {
    for (const body of [
      toiletAntwoord({ status: "zeker" }),
      toiletAntwoord({ fotos: [3] }),
      { outputs: [{ type: "text", text: "Sorry, dat kan ik niet." }] },
      { outputs: [] },
    ]) {
      const { fn } = nepFetch(200, body);
      expect(await beoordeelMetGemini(fn, "s", undefined, "toilet", [foto])).toEqual({
        ok: false,
        fout: "onbruikbaar_antwoord",
      });
    }
  });

  it("foutcodes (429, 401, 400, 500, time-out), zonder details van Google in de log", async () => {
    const geheim = "GEHEIM: quota exceeded for project 12345";
    const gevallen: [number, string][] = [
      [429, "te_veel_verzoeken"],
      [401, "sleutel_ongeldig"],
      [400, "afbeelding_geweigerd"],
      [500, "dienst_onbereikbaar"],
    ];
    for (const [status, fout] of gevallen) {
      const { fn } = nepFetch(status, { error: { message: geheim } });
      expect(await beoordeelMetGemini(fn, "GEHEIME-SLEUTEL", undefined, "keuken", [foto])).toEqual({
        ok: false,
        fout,
      });
    }
    const t = new Error("timeout");
    t.name = "TimeoutError";
    const { fn } = nepFetch(0, null, t);
    expect(await beoordeelMetGemini(fn, "GEHEIME-SLEUTEL", undefined, "keuken", [foto])).toEqual({
      ok: false,
      fout: "time_out",
    });
    expect(waarschuwingen.join("\n")).toContain("te_veel_verzoeken (HTTP 429)");
    expect(waarschuwingen.join("\n")).not.toMatch(/GEHEIM|Foto 1/);
  });

  it("zoekTekst: de laatste tekst, ook dieper of als output_text", () => {
    expect(zoekTekst({ outputs: [{ type: "thought" }, { type: "text", text: "b" }] })).toBe("b");
    expect(zoekTekst({ steps: [{ content: [{ type: "text", text: "c" }] }] })).toBe("c");
    expect(zoekTekst({ output_text: "d" })).toBe("d");
    expect(zoekTekst({})).toBeNull();
  });
});

describe("FotoVraag (invoer van de browser)", () => {
  it("1 tot 10 echte foto's van een bekende ruimte", () => {
    expect(FotoVraag.safeParse({ ruimte: "keuken", fotos: [foto] }).success).toBe(true);
    expect(FotoVraag.safeParse({ ruimte: "keuken", fotos: [] }).success).toBe(false);
    expect(
      FotoVraag.safeParse({ ruimte: "keuken", fotos: new Array(MAX_FOTOS + 1).fill(foto) }).success,
    ).toBe(false);
    expect(FotoVraag.safeParse({ ruimte: "slaapkamer", fotos: [foto] }).success).toBe(false);
    // heet JPEG maar is PNG
    expect(
      FotoVraag.safeParse({ ruimte: "toilet", fotos: [{ data: PNG, type: "image/jpeg" }] }).success,
    ).toBe(false);
  });

  it("te grote foto, of samen te groot: geweigerd", () => {
    const groot = jpegVan(MAX_FOTO_BASE64 + 4);
    expect(groot.data.length).toBeGreaterThan(MAX_FOTO_BASE64);
    expect(FotoVraag.safeParse({ ruimte: "toilet", fotos: [groot] }).success).toBe(false);
    const flink = jpegVan(2_100_000);
    expect(flink.data.length).toBeLessThan(MAX_FOTO_BASE64);
    expect(FotoVraag.safeParse({ ruimte: "toilet", fotos: [flink, flink, flink] }).success).toBe(
      true,
    );
    expect(
      FotoVraag.safeParse({ ruimte: "toilet", fotos: [flink, flink, flink, flink] }).success,
    ).toBe(false);
  });
});

describe("metLimiet (daglimiet)", () => {
  function nepDb(antwoord: { data?: unknown; error?: { code: string } | null }) {
    const rpc = vi.fn(async () => ({ data: antwoord.data ?? null, error: antwoord.error ?? null }));
    return { db: { rpc } as unknown as SupabaseClient<Database>, rpc };
  }
  const goed = async () => ({ ok: true as const, data: "uitslag" });

  it("ontbrekende sleutel: niets geboekt, geen aanroep", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { db, rpc } = nepDb({ data: { toegestaan: true, gebruikt: 1, limiet: 30 } });
    const roep = vi.fn(goed);
    expect(await metLimiet(db, "lezen", "GEMINI_API_KEY", roep)).toEqual({
      ok: false,
      fout: "sleutel_ontbreekt",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(roep).not.toHaveBeenCalled();
  });

  it("telt als 'lezen'; daglimiet bereikt: geen aanroep", async () => {
    vi.stubEnv("GEMINI_API_KEY", "x");
    const { db, rpc } = nepDb({ data: { toegestaan: false, gebruikt: 30, limiet: 30 } });
    const roep = vi.fn(goed);
    expect(await metLimiet(db, "lezen", "GEMINI_API_KEY", roep)).toEqual({
      ok: false,
      fout: "limiet_bereikt",
      gebruik: { gebruikt: 30, limiet: 30 },
    });
    expect(rpc).toHaveBeenCalledWith("ai_gebruik_boeken", { _soort: "lezen" });
    expect(roep).not.toHaveBeenCalled();
  });

  it("binnen de limiet: uitslag met gebruik; databasefout: geen toegang", async () => {
    vi.stubEnv("GEMINI_API_KEY", "x");
    const { db } = nepDb({ data: { toegestaan: true, gebruikt: 3, limiet: 30 } });
    expect(await metLimiet(db, "lezen", "GEMINI_API_KEY", goed)).toEqual({
      ok: true,
      data: "uitslag",
      gebruik: { gebruikt: 3, limiet: 30 },
    });
    const fout = nepDb({ error: { code: "42501" } });
    expect(await metLimiet(fout.db, "lezen", "GEMINI_API_KEY", goed)).toEqual({
      ok: false,
      fout: "geen_toegang",
    });
  });
});
