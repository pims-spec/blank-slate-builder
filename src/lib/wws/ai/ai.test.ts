import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OVERIG_TYPES, VERTREK_TYPES } from "../basis";
import { rng } from "../testdata";
import { jsonUitTekst } from "./antwoorden";
import {
  CLAUDE_URL,
  GEMINI_URL,
  STANDAARD_CLAUDE_MODEL,
  typeVanBase64,
  vraagClaude,
  vraagGeminiAfbeelding,
  zoekAfbeelding,
} from "./dienst";
import { anonimiseer, verwijderPatronen } from "./privacy";
import {
  INDELING_EXTRA_REGELS,
  PLAT_EXTRA_REGELS,
  ENERGIEADVIES_EXTRA_REGELS,
  energieAdviesPrompt,
  indelingAIPrompt,
  platPrompt,
  type VariantRuimte,
} from "./prompts";
import { verwerkEnergieAdvies, verwerkPlattegrond } from "./verwerken";
import { AfbeeldingVraag, VariantAfbeeldingVraag } from "./vragen";

const require = createRequire(import.meta.url);
const BRON = require("../../../../reference/wws-site-ai.cjs") as {
  platPrompt: (n: number, notitie: string) => string;
  energieAdviesPrompt: (t: string) => string;
  indelingAIPrompt: (v: unknown) => string;
};

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes, ...new Array(30).fill(0)));
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const waarschuwingen: string[] = [];
vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
  waarschuwingen.push(a.join(" "));
});
afterEach(() => {
  waarschuwingen.length = 0;
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

describe("instructies gelijk aan wws-site.html", () => {
  it("platPrompt en energieAdviesPrompt", () => {
    for (const notitie of ["", "maten in mm, 2e verdieping", "x".repeat(800)])
      for (const n of [1, 3])
        // bewuste afwijking: regels over raam en open keuken, en die velden in het voorbeeld
        expect(platPrompt(n, notitie)).toBe(
          BRON.platPrompt(n, notitie)
            .replace(
              "waar de ruimte op de tekening staat.",
              "waar de ruimte op de tekening staat.\n" + PLAT_EXTRA_REGELS.join("\n"),
            )
            .replace(
              '"opmerking":"","bbox"',
              '"opmerking":"","raam":true,"open_keuken":null,"bbox"',
            ),
        );
    // bewuste afwijking: extra regels na de regel over meerdere opties, en een datum in het voorbeeld
    const meerdere = "de tool kiest er later zelf uit.";
    for (const t of ["", "Advies voor de woning: label G naar A, € 12.000"])
      expect(energieAdviesPrompt(t)).toBe(
        BRON.energieAdviesPrompt(t)
          .replace(meerdere, meerdere + "\n" + ENERGIEADVIES_EXTRA_REGELS.join("\n"))
          .replace('{"huidig":{', '{"datum":"2026-03-14","huidig":{'),
      );
  });

  it("indelingAIPrompt: 100 willekeurige varianten (bron met standaardnamen)", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const R = rng(seed + 41_000_003);
      const ruimten: VariantRuimte[] = Array.from({ length: 1 + Math.floor(R() * 9) }, () => {
        const groep = R() < 0.6 ? "vertrekken" : "overig";
        const lijst = groep === "vertrekken" ? VERTREK_TYPES : OVERIG_TYPES;
        return {
          groep,
          type: lijst[Math.floor(R() * lijst.length)]!.k,
          m2: R() < 0.1 ? 0 : Math.round(R() * 3000) / 100,
          vast: R() < 0.4,
        };
      });
      // de bron met lege namen: dan gebruikt hij ook de standaardnaam van het type
      const v = {
        vertrekken: ruimten
          .filter((r) => r.groep === "vertrekken")
          .map((r) => ({ type: r.type, naam: "", m2: r.m2, _indVast: r.vast, _indNieuw: !r.vast })),
        overig: ruimten
          .filter((r) => r.groep === "overig")
          .map((r) => ({ type: r.type, naam: "", m2: r.m2, _indVast: r.vast, _indNieuw: !r.vast })),
      };
      // de bron zet vertrekken vóór overig; doe dat hier ook
      const geordend = [
        ...ruimten.filter((r) => r.groep === "vertrekken"),
        ...ruimten.filter((r) => r.groep === "overig"),
      ];
      // bewuste afwijking: de extra regels staan vóór de slotzin
      const bron = BRON.indelingAIPrompt(v).replace(
        "Nogmaals:",
        INDELING_EXTRA_REGELS + "Nogmaals:",
      );
      expect(indelingAIPrompt(geordend)).toBe(bron);
    }
  });

  it("extra regels: trappenhuis blijft buiten de woning, geen nieuwe ramen, alle ruimtes erop", () => {
    const p = indelingAIPrompt([
      { groep: "vertrekken", type: "badkamer", m2: 4, vast: true },
      { groep: "vertrekken", type: "slaapkamer", m2: 10, vast: false },
    ]);
    expect(p).toContain("algemene trappenhuis");
    expect(p).toContain("woningscheidende wand) krijgt nooit een raam");
    expect(p).toContain("ook de badkamer en het toilet");
    // een slaapkamer nooit alleen via de badkamer
    expect(p).toContain("Elke slaapkamer heeft een eigen deur vanuit de hal");
    expect(p).toContain("nooit alleen bereikbaar via een badkamer");
    expect(p.indexOf("Teken alleen binnen deze woning")).toBeLessThan(p.indexOf("Nogmaals:"));
  });

  it("gebruikt geen vrije ruimtenamen (bewuste afwijking)", () => {
    const p = indelingAIPrompt([{ groep: "vertrekken", type: "slaapkamer", m2: 12, vast: true }]);
    expect(p).toContain("Slaapkamer (12 m²)");
  });
});

describe("privacy", () => {
  it("haalt telling-gegevens en algemene patronen weg", () => {
    const meta = {
      naam: "Woning Jansen",
      adres: "Lange Nieuwstraat",
      huisnummer: "12 A",
      postcode: "1234 AB",
      plaats: "Utrecht",
      opsteller: "Pim Smit",
    };
    const t = anonimiseer(
      "Advies voor Woning Jansen, Lange Nieuwstraat 12 A, 1234AB Utrecht. Opgesteld door Pim Smit, " +
        "pim@example.nl, 06-12345678, +31 20 123 4567, IBAN NL91 ABNA 0417 1643 00. Postcode 9999 ZZ. " +
        "Label G naar A kost € 12.000, besparing € 950 per jaar, bouwjaar 1975.",
      meta,
    );
    for (const weg of [
      "Jansen",
      "Nieuwstraat",
      "12 A",
      "1234AB",
      "Utrecht",
      "Pim",
      "pim@",
      "12345678",
      "123 4567",
      "NL91",
      "9999",
    ])
      expect(t).not.toContain(weg);
    for (const blijft of ["Label G naar A", "€ 12.000", "€ 950", "1975"])
      expect(t).toContain(blijft);
  });

  it("verwijderPatronen laat bedragen, jaartallen en labels staan", () => {
    expect(verwijderPatronen("€ 10.000 - € 14.000, 2024, label B, 3750 mm, 4120 MM")).toBe(
      "€ 10.000 - € 14.000, 2024, label B, 3750 mm, 4120 MM",
    );
  });
});

describe("antwoorden van Claude", () => {
  it("JSON uit tekst met uitleg eromheen", () => {
    expect(jsonUitTekst('Hier is het:\n{"a":1}\nKlaar.')).toEqual({ a: 1 });
    expect(jsonUitTekst("geen json")).toBeNull();
    expect(jsonUitTekst("{kapot")).toBeNull();
  });

  it("plattegrond: vreemde waarden worden veilig, te veel of te lang wordt geweigerd", () => {
    const p = verwerkPlattegrond(
      JSON.stringify({
        maatvoering: "mm",
        ruimten: [
          {
            soort: "vertrek",
            type: "slaapkamer",
            naam: "Slaapkamer 1",
            m2: "12,5",
            bron: "x",
            bbox: "?",
            raam: "ja",
          },
          { soort: "raar", m2: null },
          { soort: "vertrek", type: "keuken", raam: false, open_keuken: true },
        ],
        sanitair: { douche: 99, bad: "1" },
        geheim: "weg",
      }),
    )!;
    expect(p.ruimten[0]).toMatchObject({
      m2: 12.5,
      bron: "ingeschat",
      bbox: undefined,
      raam: null,
    });
    expect(p.ruimten[2]).toMatchObject({ raam: false, open_keuken: true });
    expect(p.ruimten[1]!.soort).toBe("overig");
    expect(p.sanitair).toEqual({ douche: 20, bad: 1 });
    expect("geheim" in p).toBe(false);
    expect(verwerkPlattegrond('{"ruimten":"x"}')).toBeNull();
    expect(verwerkPlattegrond(JSON.stringify({ ruimten: Array(61).fill({}) }))).toBeNull();
  });

  it("verduurzamingsadvies: zoals runEnergieAdvies (geldige labels, max 8 regels van 160)", () => {
    const v = verwerkEnergieAdvies(
      JSON.stringify({
        huidig: { label: "G", bouwjaar: 1975 },
        maatregelen: [
          {
            vanLabel: "G",
            naarLabel: "A",
            omschrijving: Array(10).fill("x".repeat(200)),
            kosten_min: 10000,
            kosten_max: null,
            besparing_min: "600",
            besparing_max: 950,
          },
          { vanLabel: "Z", naarLabel: "A", omschrijving: [] },
        ],
      }),
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.advies.maatregelen).toHaveLength(1);
    const m = v.advies.maatregelen![0]!;
    expect(m.omschrijving).toHaveLength(8);
    expect(m.omschrijving![0]).toHaveLength(160);
    expect([m.kostenMin, m.kostenMax, m.besparingMin, m.besparingMax]).toEqual([
      10000, 10000, 600, 950,
    ]);
    expect(v.advies.datum).toBeUndefined();
    expect(v.advies.huidig?.label).toBe("G");
    expect(verwerkEnergieAdvies('{"maatregelen":[]}')).toEqual({
      ok: false,
      fout: "geen_maatregelen",
    });
    expect(verwerkEnergieAdvies("nee")).toEqual({ ok: false, fout: "onbruikbaar_antwoord" });
  });
});

describe("Claude-aanroep", () => {
  it("stuurt alleen afbeelding en instructie, met sleutel en standaardmodel", async () => {
    const { fn, aanroepen } = nepFetch(200, { content: [{ type: "text", text: '{"ok":1}' }] });
    const r = await vraagClaude(fn, "SLEUTEL", undefined, "INSTRUCTIE", [
      { data: JPEG, type: "image/jpeg" },
    ]);
    expect(r).toEqual({ ok: true, data: '{"ok":1}' });
    const { url, init } = aanroepen[0]!;
    expect(url).toBe(CLAUDE_URL);
    const h = new Headers(init.headers);
    expect(h.get("x-api-key")).toBe("SLEUTEL");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(STANDAARD_CLAUDE_MODEL);
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: JPEG } },
          { type: "text", text: "INSTRUCTIE" },
        ],
      },
    ]);
    expect(Object.keys(body).sort()).toEqual(["max_tokens", "messages", "model"]);
  });

  it("model instelbaar; zonder sleutel geen aanroep", async () => {
    const { fn, aanroepen } = nepFetch(200, { content: [{ type: "text", text: "x" }] });
    await vraagClaude(fn, "S", "claude-opus-5-5", "p");
    expect(JSON.parse(aanroepen[0]!.init.body as string).model).toBe("claude-opus-5-5");
    expect(await vraagClaude(fn, undefined, undefined, "p")).toEqual({
      ok: false,
      fout: "sleutel_ontbreekt",
    });
    expect(aanroepen).toHaveLength(1);
  });

  it("foutcodes, zonder details of sleutel in de log", async () => {
    const met = [{ data: JPEG, type: "image/jpeg" as const }];
    const cases: [number, string, typeof met | []][] = [
      [401, "sleutel_ongeldig", []],
      [429, "te_veel_verzoeken", []],
      [400, "afbeelding_geweigerd", met],
      [413, "afbeelding_geweigerd", met],
      [400, "dienst_onbereikbaar", []],
      [529, "dienst_onbereikbaar", []],
    ];
    for (const [status, fout, afb] of cases)
      expect(
        await vraagClaude(
          nepFetch(status, "geheim detail INSTRUCTIE").fn,
          "SLEUTEL",
          "",
          "INSTRUCTIE",
          afb,
        ),
      ).toEqual({
        ok: false,
        fout,
      });
    const te = new Error("x");
    te.name = "TimeoutError";
    expect(await vraagClaude(nepFetch(0, null, te).fn, "S", "", "p")).toEqual({
      ok: false,
      fout: "time_out",
    });
    expect(await vraagClaude(nepFetch(200, { content: [] }).fn, "S", "", "p")).toEqual({
      ok: false,
      fout: "onbruikbaar_antwoord",
    });
    expect(waarschuwingen.join("\n")).not.toMatch(/SLEUTEL|geheim|INSTRUCTIE/);
  });
});

describe("Gemini-aanroep", () => {
  it("stuurt instructie en referentie, niet bewaren; neemt alleen een echte afbeelding aan", async () => {
    const { fn, aanroepen } = nepFetch(200, {
      id: "x",
      steps: [
        {
          type: "model_output",
          content: [
            { type: "text", text: "hier" },
            { type: "image", data: PNG },
          ],
        },
      ],
    });
    const r = await vraagGeminiAfbeelding(fn, "SLEUTEL", undefined, "INSTRUCTIE", {
      data: JPEG,
      type: "image/jpeg",
    });
    expect(r).toEqual({ ok: true, data: { data: PNG, type: "image/png" } });
    const { url, init } = aanroepen[0]!;
    expect(url).toBe(GEMINI_URL);
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("SLEUTEL");
    const body = JSON.parse(init.body as string);
    expect(body.store).toBe(false);
    expect(body.input).toEqual([
      { type: "text", text: "INSTRUCTIE" },
      { type: "image", mime_type: "image/jpeg", data: JPEG },
    ]);
  });

  it("geen of nep-afbeelding in het antwoord: onbruikbaar", async () => {
    const svg = btoa("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>");
    for (const body of [{}, { steps: [{ content: [{ type: "image", data: svg }] }] }])
      expect(
        await vraagGeminiAfbeelding(nepFetch(200, body).fn, "S", "", "p", {
          data: JPEG,
          type: "image/jpeg",
        }),
      ).toEqual({ ok: false, fout: "onbruikbaar_antwoord" });
  });

  it("zoekAfbeelding: ook inlineData (generateContent-vorm)", () => {
    expect(
      zoekAfbeelding({ candidates: [{ content: { parts: [{ inlineData: { data: PNG } }] } }] }),
    ).toBe(PNG);
  });
});

describe("invoer van de browser", () => {
  it("afbeelding: inhoud moet bij het type passen", () => {
    expect(AfbeeldingVraag.safeParse({ data: JPEG, type: "image/jpeg" }).success).toBe(true);
    expect(AfbeeldingVraag.safeParse({ data: JPEG, type: "image/png" }).success).toBe(false);
    expect(
      AfbeeldingVraag.safeParse({ data: btoa("%PDF-1.7 xxxxxxxxxxxxxxxx"), type: "image/jpeg" })
        .success,
    ).toBe(false);
    expect(
      AfbeeldingVraag.safeParse({ data: "data:image/jpeg;base64," + JPEG, type: "image/jpeg" })
        .success,
    ).toBe(false);
    expect(typeVanBase64(PNG)).toBe("image/png");
  });

  it("variant: alleen bekende ruimtetypen, geen vrije tekst", () => {
    const afbeelding = { data: JPEG, type: "image/jpeg" };
    const ok = { groep: "vertrekken", type: "slaapkamer", m2: 12, vast: false };
    expect(VariantAfbeeldingVraag.safeParse({ afbeelding, ruimten: [ok] }).success).toBe(true);
    expect(
      VariantAfbeeldingVraag.safeParse({ afbeelding, ruimten: [{ ...ok, type: "Kamer van Jan" }] })
        .success,
    ).toBe(false);
    expect(
      VariantAfbeeldingVraag.safeParse({ afbeelding, ruimten: [{ ...ok, naam: "Jan" }] }).data
        ?.ruimten[0],
    ).toEqual(ok);
  });

  it("verduurzamingsadvies: datum en beginlabel alleen als ze geldig zijn; alle opties", () => {
    const opties = ["C", "B", "A"].map((naar) => ({
      vanLabel: "E",
      naarLabel: naar,
      omschrijving: ["Optie " + naar],
      kosten_min: 1000,
      kosten_max: 2000,
    }));
    const v = verwerkEnergieAdvies(
      JSON.stringify({ datum: "2026-03-14", huidig: { label: "E" }, maatregelen: opties }),
    );
    expect(v.ok && v.advies.datum).toBe("2026-03-14");
    expect(v.ok && v.advies.maatregelen!.map((m) => m.naarLabel)).toEqual(["C", "B", "A"]);
    for (const datum of ["14-03-2026", "2026-13-45", 20260314, "morgen"]) {
      const w = verwerkEnergieAdvies(
        JSON.stringify({ datum, huidig: { label: "X" }, maatregelen: opties }),
      );
      expect(w.ok && w.advies.datum).toBeUndefined();
      expect(w.ok && w.advies.huidig?.label).toBeUndefined();
    }
  });
});
