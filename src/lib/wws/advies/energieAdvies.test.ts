import { describe, expect, it } from "vitest";
import { calc } from "../calc";
import { legeInput } from "../legeInput";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import type { EnergieAdvies, WwsInput } from "../types";
import { berekenAdvies, berekenRoute, standaardInstellingen } from "./advies";
import {
  beginlabel,
  beginlabelVraag,
  uitgangspuntTekst,
  vergelijkBeginlabel,
  vergelijkOpties,
} from "./energieAdvies";

const N = DEFAULT_NORMEN as unknown as Normen;
const VANDAAG = "2026-10-15";

const ADVIES: EnergieAdvies = {
  bestand: "advies.pdf",
  datum: "2026-03-14",
  huidig: { label: "E" },
  maatregelen: [
    {
      vanLabel: "E",
      naarLabel: "C",
      omschrijving: ["Spouwmuurisolatie"],
      kostenMin: 4000,
      kostenMax: 6000,
    },
    {
      vanLabel: "E",
      naarLabel: "B",
      omschrijving: ["Spouw", "HR++"],
      kostenMin: 9000,
      kostenMax: 11000,
    },
    {
      vanLabel: "E",
      naarLabel: "A",
      omschrijving: ["Spouw", "HR++", "Warmtepomp"],
      kostenMin: 18000,
      kostenMax: 22000,
      besparingMin: 900,
      besparingMax: 1200,
    },
  ],
};

/** Woning met geregistreerd label F (2020) en een advies dat uitgaat van E (2026) */
function woning(ea: Partial<EnergieAdvies> = {}): WwsInput {
  const x = legeInput();
  x.vertrekken.push(
    { type: "woonkamer", m2: 30, verwarmd: true },
    { type: "slaapkamer", m2: 12, verwarmd: true },
  );
  x.energie = { soort: "label", label: "F", indexKlasse: "", bouwjaar: "", datum: "2020-01-01" };
  x.woz.waarde = 300000;
  x.energieAdvies = { ...structuredClone(ADVIES), ...ea };
  return x;
}

const JA = {
  keuze: "advies",
  label: "E",
  door: "Test Gebruiker",
  op: "2026-10-15T09:00:00Z",
} as const;
const NEE = { ...JA, keuze: "registratie" } as const;

const labelStap = (x: WwsInput) => {
  const inst = { ...standaardInstellingen(N), labelsprong: true };
  // de labelsprong is het eerste onderdeel van de labelstap in de route
  return berekenAdvies(x, N, inst, { vandaag: VANDAAG }).stappen.find((s) => s.key === "label");
};

describe("energieadvies: afwijkend beginlabel", () => {
  it("vergelijkt klasse, soort en datum; stelt het advies voor als dat recenter is", () => {
    const x = woning();
    const v = vergelijkBeginlabel(x.energie, x.energieAdvies)!;
    expect(v).toMatchObject({
      advies: { label: "E", datum: "2026-03-14" },
      registratie: { label: "F", datum: "2020-01-01" },
      verschil: true,
      voorstel: "advies",
    });
    // advies ouder dan de registratie, of zonder datum: het geregistreerde label
    expect(vergelijkBeginlabel(x.energie, { ...ADVIES, datum: "2019-05-01" })!.voorstel).toBe(
      "registratie",
    );
    expect(vergelijkBeginlabel(x.energie, (({ datum: _d, ...r }) => r)(ADVIES))!.voorstel).toBe(
      "registratie",
    );
    // zelfde label: geen verschil; een label van vóór 2015 in dezelfde klasse wel
    expect(vergelijkBeginlabel({ ...x.energie, label: "E" }, ADVIES)!.verschil).toBe(false);
    expect(
      vergelijkBeginlabel({ ...x.energie, soort: "labelOud", label: "E" }, ADVIES)!.verschil,
    ).toBe(true);
    // zonder beginlabel in het advies: niets te vergelijken
    expect(vergelijkBeginlabel(x.energie, { ...ADVIES, huidig: null })).toBeNull();
  });

  it("de controlevraag noemt beide labels met datum en de gevolgen", () => {
    const x = woning();
    expect(beginlabelVraag(vergelijkBeginlabel(x.energie, x.energieAdvies)!)).toBe(
      "Het energieadvies van 14 maart 2026 gaat uit van label E. In EP-Online staat label F, " +
        "geregistreerd op 1 januari 2020. Wil je het verbeteradvies baseren op label E uit het " +
        "advies? De WWS-punten van de huidige situatie blijven gebaseerd op label F.",
    );
  });

  it("zonder bevestiging wordt het advieslabel niet gebruikt; punten huidige situatie gelijk", () => {
    const x = woning();
    const R0 = calc(x, N);
    expect(beginlabel(x)).toEqual({ label: "F", bron: "registratie" });
    expect(labelStap(x)?.delen[0]).toBe("Energielabel F naar E");
    expect(berekenAdvies(x, N, standaardInstellingen(N), { vandaag: VANDAAG }).start.totaal).toBe(
      R0.totaal,
    );
  });

  it("na 'Nee, gebruik EP-Online' ook niet", () => {
    const x = woning({ uitgangspunt: NEE });
    const R0 = calc(woning(), N);
    expect(beginlabel(x).bron).toBe("registratie");
    expect(labelStap(x)?.delen[0]).toBe("Energielabel F naar E");
    expect(calc(x, N).totaal).toBe(R0.totaal);
    expect(uitgangspuntTekst(x)).toBe(
      "Het verbeteradvies gaat uit van het geregistreerde label F (EP-Online), niet van label E " +
        "uit het energieadvies (bevestigd door Test Gebruiker op 15 oktober 2026).",
    );
  });

  it("na 'Ja, ga uit van het advies' wel; de punten van de huidige situatie blijven op F", () => {
    const x = woning({ uitgangspunt: JA });
    const R0 = calc(woning(), N);
    expect(beginlabel(x)).toEqual({ label: "E", bron: "advies" });
    expect(labelStap(x)?.delen[0]).toBe("Energielabel E (volgens energieadvies) naar D");
    const A = berekenAdvies(x, N, standaardInstellingen(N), { vandaag: VANDAAG });
    expect(A.start.totaal).toBe(R0.totaal);
    expect(calc(x, N).totaal).toBe(R0.totaal);
    expect(x.energie.label).toBe("F");
    // de opties uit het advies doen mee, vanaf E (kosten uit het advies)
    const route = berekenRoute(x, N, standaardInstellingen(N), 9999, undefined, {
      vandaag: VANDAAG,
    });
    expect(route.vanLabel).toBe("E");
    const label = route.stappen.find((s) => s.key === "label")!;
    expect(label.o).toMatch(/^Energielabel E \(volgens energieadvies\) naar /);
    expect(uitgangspuntTekst(x)).toBe(
      "Het verbeteradvies gaat uit van label E uit het energieadvies van 14 maart 2026 " +
        "(bevestigd door Test Gebruiker op 15 oktober 2026). De WWS-punten van de huidige " +
        "situatie blijven gebaseerd op label F (EP-Online).",
    );
  });

  it("een bevestiging op een ander advieslabel (nieuw advies) telt niet", () => {
    const x = woning({ uitgangspunt: { ...JA, label: "D" } });
    expect(beginlabel(x).bron).toBe("registratie");
  });

  it("brongetrouw: het advieslabel wordt nooit gebruikt", () => {
    const x = woning({ uitgangspunt: JA, gekozenOptie: 1 });
    const inst = { ...standaardInstellingen(N), labelsprong: true };
    const A = berekenAdvies(x, N, inst, { vandaag: VANDAAG, brongetrouw: true });
    expect(A.stappen.find((s) => s.key === "label")?.delen[0]).toBe("Energielabel F naar E");
  });
});

describe("energieadvies: opties naast elkaar", () => {
  it("per optie: stappen vanaf het beginlabel, punten, segment, huur en terugverdientijd", () => {
    const x = woning();
    const R0 = calc(x, N);
    const opties = vergelijkOpties(x, N, VANDAAG);
    expect(opties.map((o) => [o.van, o.naar, o.stappen])).toEqual([
      ["F", "C", 3],
      ["F", "B", 4],
      ["F", "A", 5],
    ]);
    // met het advieslabel als begin: minder stappen, zelfde punten (het eindlabel telt)
    const ja = vergelijkOpties(woning({ uitgangspunt: JA }), N, VANDAAG);
    expect(ja.map((o) => o.stappen)).toEqual([2, 3, 4]);
    expect(ja.map((o) => o.totaal)).toEqual(opties.map((o) => o.totaal));
    for (const o of opties) {
      expect(o.puntenErbij).toBe(o.totaal - R0.totaal);
      expect(o.puntenErbij).toBeGreaterThan(0);
      expect(o.kosten).toBe((o.kostenMin + o.kostenMax) / 2);
      expect(o.extraHuurMaand).toBeGreaterThan(0);
      expect(o.terugverdienJaren).toBeCloseTo(o.kosten / (o.extraHuurMaand * 12), 1);
    }
    expect(opties[0]!.totaal).toBeLessThan(opties[2]!.totaal);
    expect(opties[2]).toMatchObject({ besparingMin: 900, besparingMax: 1200 });
  });

  it("de gekozen optie wordt de labelmaatregel, ook als die niet de goedkoopste is", () => {
    const x = woning({ uitgangspunt: JA, gekozenOptie: 2 });
    const A = berekenAdvies(x, N, standaardInstellingen(N), { vandaag: VANDAAG });
    const label = A.stappen.find((s) => s.key === "label")!;
    expect(label.forced).toBe(true);
    expect(label.bron).toBe("advies");
    expect(label.o).toBe("Energielabel E (volgens energieadvies) naar A");
    expect(label.c).toBe(20000);
    expect(A.input.energie.label).toBe("A");
    // geen andere labelmaatregelen in "Alle maatregelen"
    expect(A.los.filter((s) => s.key === "label").map((s) => s.o)).toEqual([
      "Energielabel E (volgens energieadvies) naar A (4 stappen)",
    ]);
    // andere optie kiezen: ander eindlabel
    const y = woning({ uitgangspunt: JA, gekozenOptie: 0 });
    expect(
      berekenAdvies(y, N, standaardInstellingen(N), { vandaag: VANDAAG }).input.energie.label,
    ).toBe("C");
  });

  it("gekozen optie zonder bevestigd advieslabel: gerekend vanaf het geregistreerde label", () => {
    const x = woning({ gekozenOptie: 1 });
    const A = berekenAdvies(x, N, standaardInstellingen(N), { vandaag: VANDAAG });
    const label = A.stappen.find((s) => s.key === "label")!;
    expect(label.o).toBe("Energielabel F naar B");
    expect(label.h).toBe("lastig");
    expect(label.c).toBe(10000);
  });
});
