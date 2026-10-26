import { describe, expect, it } from "vitest";
import { KEUKEN_ELEMENTEN, ELEMENTEN } from "./elementen";
import {
  MAX_FOTOS,
  controleerBeoordeling,
  fotoPrompt,
  fotoSchema,
  leesJson,
  type ElementOordeel,
} from "./beoordeling";
import { DEFAULT_NORMEN as NORMEN } from "../normen";

const leeg = (): ElementOordeel => ({
  status: "niet_vast_te_stellen",
  vrijstaand: false,
  aantal: null,
  soort: null,
  bewijs: "Niet te zien.",
  fotos: [],
});

function keukenAntwoord(over: Record<string, Partial<ElementOordeel>> = {}) {
  return {
    elementen: KEUKEN_ELEMENTEN.map((e) => ({
      element: e.sleutel,
      ...leeg(),
      ...(e.telbaar ? { aantal: 0 } : {}),
      ...over[e.sleutel],
    })),
  };
}

describe("elementen", () => {
  it("keuken- en badkamervoorzieningen uit de normen komen allemaal voor", () => {
    const keuken = new Set(KEUKEN_ELEMENTEN.map((e) => e.sleutel));
    const groepen: Record<string, string> = { kook: "kookplaat", oven: "oven", kraan: "kraan" };
    for (const v of NORMEN.voorzKeuken as readonly { k: string; g?: string }[])
      expect(keuken.has(v.g ? groepen[v.g]! : v.k), v.k).toBe(true);
    const bad = new Set(ELEMENTEN.badkamer.map((e) => e.sleutel));
    for (const v of NORMEN.voorzSan) expect(bad.has(v.k), v.k).toBe(true);
  });

  it("toiletruimte: toilet (staand of hangend) en fontein, zoals in de telling", () => {
    expect(ELEMENTEN.toilet.map((e) => e.sleutel)).toEqual(["toilet", "fontein"]);
    expect(ELEMENTEN.toilet[0]!.soorten).toEqual(["staand", "hangend"]);
    expect(fotoPrompt("toilet", 1)).toContain("een foto van een toiletruimte");
  });
});

describe("fotoPrompt en fotoSchema", () => {
  it("noemt de drie statussen, de regel 'bij twijfel lager' en elk element", () => {
    const p = fotoPrompt("keuken", 3);
    expect(p).toContain("3 foto's van een keuken");
    for (const s of ["aanwezig:", "waarschijnlijk_aanwezig:", "niet_vast_te_stellen:"])
      expect(p).toContain(s);
    expect(p).toContain("kies dan de lagere");
    for (const e of KEUKEN_ELEMENTEN) expect(p).toContain(`- ${e.sleutel} (`);
    expect(p).toContain("Beschrijf geen personen");
    expect(p).toContain("telt als oven én als magnetron");
    expect(fotoPrompt("badkamer", 1)).toContain(
      "of een open vakkenkast, in beide gevallen minimaal 40 cm breed en 40 cm hoog",
    );
  });

  it("schema: één platte lijst; element en soort uit vaste lijsten", () => {
    const s = fotoSchema("keuken") as {
      required: string[];
      properties: {
        elementen: { items: { required: string[]; properties: Record<string, unknown> } };
      };
    };
    expect(s.required).toEqual(["elementen"]);
    const regel = s.properties.elementen.items;
    expect(regel.required).toContain("element");
    expect(regel.properties["element"]).toEqual({
      type: "string",
      enum: KEUKEN_ELEMENTEN.map((e) => e.sleutel),
    });
    expect(regel.properties["soort"]).toMatchObject({
      anyOf: [
        { type: "string", enum: expect.arrayContaining(["inductie", "gas", "eenhands"]) },
        { type: "null" },
      ],
    });
    // klein genoeg: geen apart blok per element
    expect(JSON.stringify(s).length).toBeLessThan(2000);
  });
});

describe("controleerBeoordeling", () => {
  it("geldig antwoord: bewijs ingekort, foto's uniek en gesorteerd", () => {
    const b = controleerBeoordeling(
      "keuken",
      3,
      keukenAntwoord({
        vaatwasser: {
          status: "waarschijnlijk_aanwezig",
          bewijs: "  Front naast spoelbak,\n greep hoger. ",
          fotos: [3, 1, 3],
        },
        kookplaat: { status: "aanwezig", soort: "inductie", fotos: [1] },
        kast: { aantal: 4 },
      }),
    );
    expect(b!["vaatwasser"]).toMatchObject({
      status: "waarschijnlijk_aanwezig",
      bewijs: "Front naast spoelbak, greep hoger.",
      fotos: [1, 3],
    });
    expect(b!["kookplaat"]!.soort).toBe("inductie");
    expect(b!["kast"]!.aantal).toBe(4);
  });

  it("ongeldig: ontbrekend of onbekend element, foute status, foto die niet bestaat", () => {
    const goed = keukenAntwoord();
    const zonder = { elementen: goed.elementen.filter((r) => r.element !== "vaatwasser") };
    expect(controleerBeoordeling("keuken", 2, zonder)).toBeNull();
    const dubbel = { elementen: [...goed.elementen, goed.elementen[0]!] };
    expect(controleerBeoordeling("keuken", 2, dubbel)).toBeNull();
    const vreemd = { elementen: [...zonder.elementen, { ...leeg(), element: "sauna" }] };
    expect(controleerBeoordeling("keuken", 2, vreemd)).toBeNull();
    expect(controleerBeoordeling("keuken", 2, { ...goed, extra: 1 })).toBeNull();
    expect(
      controleerBeoordeling("keuken", 2, keukenAntwoord({ oven: { status: "zeker" as never } })),
    ).toBeNull();
    expect(controleerBeoordeling("keuken", 2, keukenAntwoord({ oven: { fotos: [3] } }))).toBeNull();
    // soort van een ander element (kraan) bij de kookplaat
    expect(
      controleerBeoordeling("keuken", 2, keukenAntwoord({ kookplaat: { soort: "eenhands" } })),
    ).toBeNull();
    expect(
      controleerBeoordeling("keuken", 2, keukenAntwoord({ kookplaat: { soort: "hout" } })),
    ).toBeNull();
    expect(controleerBeoordeling("keuken", 2, "geen object")).toBeNull();
  });

  it("velden die bij een element niet horen worden genegeerd", () => {
    const b = controleerBeoordeling(
      "keuken",
      1,
      keukenAntwoord({ vaatwasser: { aantal: 2, soort: "gas" } }),
    );
    expect(b!["vaatwasser"]).toMatchObject({ aantal: null, soort: null });
  });

  it("vrijstaand telt alleen bij inbouwelementen", () => {
    const b = controleerBeoordeling(
      "keuken",
      1,
      keukenAntwoord({ koelkast: { vrijstaand: true }, kraan: { vrijstaand: true } }),
    );
    expect(b!["koelkast"]!.vrijstaand).toBe(true);
    expect(b!["kraan"]!.vrijstaand).toBe(false);
  });

  it("niet meer dan het maximum aantal foto's", () => {
    expect(MAX_FOTOS).toBe(10);
  });
});

describe("leesJson", () => {
  it("haalt het object uit tekst met codeblok; anders null", () => {
    expect(leesJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(leesJson("geen json")).toBeNull();
    expect(leesJson("{kapot")).toBeNull();
  });
});
