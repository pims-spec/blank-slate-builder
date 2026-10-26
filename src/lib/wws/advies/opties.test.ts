import { describe, expect, it } from "vitest";
import { ensureFac } from "../basis";
import { calc } from "../calc";
import { legeInput } from "../legeInput";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import type { EnergieAdvies, FacBadkamer, FacKeuken, Vertrek, WwsInput } from "../types";
import { berekenAdvies, berekenRoute, standaardInstellingen } from "./advies";
import { terugvalBijAfmelden, terugvalTekst } from "./energieAdvies";
import { adviesDoelen, adviesOpties, doelzin } from "./opties";
import type { RouteResultaat } from "./types";

const N = DEFAULT_NORMEN as unknown as Normen;
const VANDAAG = "2026-10-26";
const inst = () => standaardInstellingen(N);
/** Zonder labelverbetering: dan blijft afmelden een eigen stap */
const zonderLabelwerk = () => ({ ...inst(), uit: { label: true } });

function vertrek(type: Vertrek["type"], m2: number): Vertrek {
  const r: Vertrek = { type, m2, verwarmd: true, verkoeld: false };
  ensureFac("vertrekken", r, true);
  return r;
}

/** Appartement van ± 160 punten, label D, met een eenvoudige keuken en badkamer */
function woning(label: "D" | "F" = "D", advieslabel?: string, bevestigd = true): WwsInput {
  const x = legeInput();
  const keuken = vertrek("keuken", 7);
  (keuken.fac as FacKeuken).keuken.lengte = "1-2";
  const bad = vertrek("badkamer", 5);
  Object.assign((bad.fac as FacBadkamer).san, { wastafel: 1, douche: 1, eisenOk: true });
  x.vertrekken = [
    vertrek("woonkamer", 24),
    vertrek("slaapkamer", 12),
    vertrek("slaapkamer", 9),
    keuken,
    bad,
  ];
  x.energie = { soort: "label", label, indexKlasse: "", bouwjaar: "", datum: "2022-01-01" };
  x.woz.waarde = 420000;
  x.buiten.ruimten = [{ soort: "balkon", groep: "priv", m2: 5 }];
  if (advieslabel) {
    const ea: EnergieAdvies = {
      datum: "2026-09-01",
      huidig: { label: advieslabel },
      maatregelen: [],
    };
    if (bevestigd)
      ea.uitgangspunt = {
        keuze: "advies",
        label: advieslabel,
        door: "Test",
        op: "2026-10-26T09:00:00Z",
      };
    x.energieAdvies = ea;
  }
  return x;
}

describe("energielabel afmelden", () => {
  it("met een bevestigd hoger advieslabel: eerste stap, € 350, zonder werkzaamheden", () => {
    const A = berekenAdvies(woning("D", "B"), N, zonderLabelwerk(), { vandaag: VANDAAG });
    const eerste = A.stappen[0]!;
    expect(eerste.key).toBe("afmelden");
    expect(eerste.o).toBe("Energielabel afmelden: label D naar label B (zonder werkzaamheden)");
    expect(eerste.c).toBe(350);
    expect(eerste.g).toBeGreaterThan(0);
  });

  it("niet zonder bevestiging, niet brongetrouw, niet als het uit staat", () => {
    const zonder = berekenAdvies(woning("D", "B", false), N, inst(), { vandaag: VANDAAG });
    expect(zonder.stappen.some((s) => s.key === "afmelden")).toBe(false);
    const bron = berekenAdvies(woning("D", "B"), N, inst(), {
      vandaag: VANDAAG,
      brongetrouw: true,
    });
    expect(bron.stappen.some((s) => s.key === "afmelden")).toBe(false);
    const uit = berekenAdvies(
      woning("D", "B"),
      N,
      { ...inst(), uit: { afmelden: true } },
      {
        vandaag: VANDAAG,
      },
    );
    expect(uit.stappen.some((s) => s.key === "afmelden")).toBe(false);
  });

  it("kosten van afmelden instelbaar", () => {
    const A = berekenAdvies(
      woning("D", "B"),
      N,
      { ...zonderLabelwerk(), kosten: { ...inst().kosten, afmelden: 500 } },
      { vandaag: VANDAAG },
    );
    expect(A.stappen[0]!.c).toBe(500);
  });

  it("met labelwerk in dezelfde route vervalt de aparte afmeldstap (zoals in de rapporten)", () => {
    const A = berekenAdvies(woning("D", "B"), N, inst(), { vandaag: VANDAAG });
    const label = A.stappen.find((s) => s.key === "label");
    if (label) {
      expect(A.stappen.some((s) => s.key === "afmelden")).toBe(false);
      expect(label.o).toContain("(volgens energieadvies)");
    }
  });

  it("een lager advieslabel wordt geen stap", () => {
    const A = berekenAdvies(woning("D", "F"), N, inst(), { vandaag: VANDAAG });
    expect(A.stappen.some((s) => s.key === "afmelden")).toBe(false);
  });
});

describe("waarschuwing bij terugval", () => {
  it("advieslabel lager dan het geregistreerde: van, naar en tekst (ook zonder bevestiging)", () => {
    const x = woning("D", "F", false);
    const t = terugvalBijAfmelden(x, N, VANDAAG)!;
    expect(t.van).toBe(calc(x, N).totaal);
    expect(t.naar).toBeLessThan(t.van);
    expect(terugvalTekst(t)).toMatch(
      /^Let op: bij afmelden van het energielabel volgens het energieadvies \(label F in plaats van label D\) daalt de woning van \d+ naar \d+ punten/,
    );
  });

  it("geen waarschuwing bij een hoger of gelijk advieslabel of zonder advies", () => {
    expect(terugvalBijAfmelden(woning("D", "B"), N, VANDAAG)).toBeNull();
    expect(terugvalBijAfmelden(woning("D", "D"), N, VANDAAG)).toBeNull();
    expect(terugvalBijAfmelden(woning("D"), N, VANDAAG)).toBeNull();
  });
});

describe("adviesDoelen", () => {
  it("standaard 186, 188 en 195; instelbaar in de normen", () => {
    expect(adviesDoelen(N)).toEqual({ middenhuur: 186, klein: 188, ruim: 195 });
    expect(adviesDoelen({ ...N, adviesDoelen: { kleineMarge: 4, ruimeMarge: 12 } })).toEqual({
      middenhuur: 186,
      klein: 190,
      ruim: 198,
    });
    expect(adviesDoelen({ ...N, adviesDoelen: { kleineMarge: -1 } }).klein).toBe(188);
  });
});

describe("adviesOpties", () => {
  const opties = adviesOpties(woning("D", "B"), N, inst(), { vandaag: VANDAAG });
  const zonderWerk = adviesOpties(woning("D", "B"), N, zonderLabelwerk(), { vandaag: VANDAAG });

  it("oplopende opties met de vaste doelen; middenhuur alleen precies op 186", () => {
    expect(opties.length).toBeGreaterThanOrEqual(2);
    let vorig = calc(woning("D", "B"), N).totaal;
    for (const o of opties) {
      expect(o.route.eind.totaal).toBeGreaterThan(vorig);
      vorig = o.route.eind.totaal;
      if (o.soort === "middenhuur") expect(o.route.eind.totaal).toBe(186);
      if (o.soort === "klein") expect(o.route.eind.totaal).toBeGreaterThanOrEqual(188);
      if (o.soort === "ruim") expect(o.route.eind.totaal).toBeGreaterThanOrEqual(195);
    }
  });

  it("elke optie bouwt voort op de vorige; zonder labelwerk begint de eerste met afmelden", () => {
    expect(zonderWerk[0]!.route.stappen[0]!.key).toBe("afmelden");
    expect(zonderWerk[0]!.doelzin).toContain("het energielabel worden afgemeld");
    for (let i = 1; i < opties.length; i++) {
      const vorige = opties[i - 1]!.route.stappen.map((s) => s.key);
      const deze = opties[i]!.route.stappen.map((s) => s.key);
      for (const k of vorige) expect(deze).toContain(k);
    }
  });

  it("elke optie heeft een doelzin", () => {
    for (const o of [...opties, ...zonderWerk]) expect(o.doelzin).toMatch(/^Om de woning .+\.$/);
  });

  it("woning al boven de ruime marge: geen opties", () => {
    const x = woning("D");
    x.vertrekken.push(vertrek("woonkamer", 60), vertrek("slaapkamer", 20));
    x.woz.waarde = 900000;
    x.energie.label = "A";
    expect(calc(x, N).totaal).toBeGreaterThanOrEqual(195);
    expect(adviesOpties(x, N, inst(), { vandaag: VANDAAG })).toEqual([]);
  });

  it("ruime marge niet haalbaar: het hoogst haalbare", () => {
    const x = woning("D");
    const o = adviesOpties(
      x,
      N,
      { ...inst(), uit: { label: true, balkon: true } },
      { vandaag: VANDAAG },
    );
    const laatste = o[o.length - 1];
    if (laatste && laatste.route.eind.totaal < 195) expect(laatste.soort).toBe("max");
  });
});

describe("labelstappen in de opties niet lastig", () => {
  it("label G: de opties nemen een grote labelsprong mee, de route in het venster niet", () => {
    const x = woning("D");
    x.energie.label = "G";
    const route = berekenAdvies(x, N, inst(), { vandaag: VANDAAG });
    const sprong = (o: string) => /naar A/.test(o);
    expect(route.stappen.some((s) => s.key === "label" && sprong(s.o))).toBe(false);
    const opties = adviesOpties(x, N, inst(), { vandaag: VANDAAG });
    expect(
      opties.some((o) => o.route.stappen.some((s) => s.key === "label" && /naar A/.test(s.o))),
    ).toBe(true);
    // brongetrouw blijft het oude gedrag
    const bron = berekenRoute(x, N, inst(), 9999, undefined, {
      vandaag: VANDAAG,
      brongetrouw: true,
      labelNietLastig: true,
    });
    expect(
      bron.stappen.some((s) => s.key === "label" && /\(([3-9]) stappen\)|naar A/.test(s.o)),
    ).toBe(false);
  });
});

describe("doelzin", () => {
  const route = (
    stappen: { key: string; delen: string[]; naarLabel?: string }[],
    rij6 = "",
    label = "B",
  ) =>
    ({
      stappen,
      vanLabel: "D",
      input: { energie: { label } },
      eind: {
        rows: [
          { nr: 6, t: rij6 },
          { nr: 5, t: "" },
        ],
      },
    }) as unknown as RouteResultaat;

  it("afmelden en badkamer maximaliseren", () => {
    const r = route(
      [
        { key: "afmelden", delen: ["afmelden"] },
        { key: "sanExtra", delen: ["Kastruimte"] },
      ],
      "extra 3,5 (afgetopt)",
    );
    expect(doelzin("middenhuur", r, undefined)).toBe(
      "Om de woning optimaal binnen de middenhuur te positioneren, moet het energielabel worden afgemeld en de badkamer worden gemaximaliseerd.",
    );
  });

  it("alleen wat er bij komt; het label met van en naar", () => {
    const vorige = route([{ key: "afmelden", delen: ["afmelden"] }]);
    const r = route(
      [
        { key: "afmelden", delen: ["afmelden"] },
        { key: "label", delen: ["B naar A"], naarLabel: "A" },
        { key: "keukenExtra", delen: ["vaatwasser"] },
      ],
      "",
      "A",
    );
    (vorige as unknown as { input: { energie: { label: string } } }).input.energie.label = "B";
    expect(doelzin("klein", r, vorige)).toBe(
      "Om de woning met een kleine marge in de vrije sector te positioneren, moet het energielabel worden verbeterd (van B naar A) en de keuken worden uitgebreid.",
    );
  });

  it("drie onderdelen met komma; geen nieuwe maatregelen", () => {
    const r = route([
      { key: "afmelden", delen: ["a"] },
      { key: "aanrecht", delen: ["b"] },
      { key: "balkon", delen: ["c"] },
    ]);
    expect(doelzin("ruim", r, undefined)).toBe(
      "Om de woning met een ruime marge in de vrije sector te positioneren, moet het energielabel worden afgemeld, de keuken worden uitgebreid en een buitenruimte worden toegevoegd.",
    );
    expect(doelzin("max", r, r)).toBe(
      "Om de woning zo hoog mogelijk te waarderen, zijn geen extra maatregelen nodig.",
    );
  });

  it("berekenRoute blijft werken voor een eigen doel", () => {
    const r = berekenRoute(woning("D", "B"), N, zonderLabelwerk(), 188, undefined, {
      vandaag: VANDAAG,
    });
    expect(r.stappen[0]!.key).toBe("afmelden");
  });
});
