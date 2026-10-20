import { describe, expect, it } from "vitest";
import { facDefault } from "../basis";
import { calc } from "../calc";
import { legeInput } from "../legeInput";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import type { WwsInput } from "../types";
import { berekenRoute, kandidaten, standaardInstellingen } from "./advies";
import { MAATREGELEN } from "./maatregelen";
import { MAATREGEL_NIVEAU, niveauVan } from "./niveaus";
import type { AdviesInstellingen, MaatregelKey } from "./types";

const N = DEFAULT_NORMEN as unknown as Normen;
const VANDAAG = "2026-10-15";

/** Woning met een badkamer (wastafel + douche, voldoet aan de eisen) zonder extra's */
function woning(): WwsInput {
  const x = legeInput();
  const bad = facDefault("badkamer", false);
  if (bad.kind === "badkamer") {
    bad.san = { ...bad.san, wastafel: 1, douche: 1, bad: 0, eisenOk: true, voorz: {} };
  }
  x.vertrekken.push(
    { type: "woonkamer", m2: 30, verwarmd: true },
    { type: "slaapkamer", m2: 12, verwarmd: true },
    { type: "badkamer", m2: 5, verwarmd: true, fac: bad },
  );
  x.energie = { ...x.energie, soort: "label", label: "C", datum: "2024-01-01" };
  x.woz.waarde = 250000;
  return x;
}

/** Alleen de extra sanitaire voorzieningen aan, zodat de keuze tussen die voorzieningen telt */
function alleenSanExtra(): AdviesInstellingen {
  const inst = standaardInstellingen(N);
  const uit: Partial<Record<MaatregelKey, boolean>> = {};
  for (const m of MAATREGELEN) if (m.key !== "sanExtra") uit[m.key] = true;
  return { ...inst, uit };
}

const sanDelen = (x: WwsInput, doel: number, brongetrouw: boolean) =>
  berekenRoute(x, N, alleenSanExtra(), doel, undefined, {
    vandaag: VANDAAG,
    brongetrouw,
  }).stappen.flatMap((s) => s.delen);

describe("verbeteradvies: eenvoudigste maatregel eerst", () => {
  it("standaardniveaus: maatregelen gelijk aan de bron; voorzieningen eigen niveau", () => {
    for (const m of MAATREGELEN)
      if (m.key !== "indexKlasse") expect(MAATREGEL_NIVEAU[m.key]).toBe(m.h);
    expect(niveauVan(N, "sanExtra.kastje")).toBe("eenvoudig");
    expect(niveauVan(N, "sanExtra.kastruimte")).toBe("eenvoudig");
    expect(niveauVan(N, "sanExtra.stopcontact")).toBe("gemiddeld");
    expect(niveauVan(N, "sanExtra.handdoekrad")).toBe("gemiddeld");
  });

  it("instelbaar in de normen; een ongeldige waarde valt terug op de standaard", () => {
    const eigen = {
      ...N,
      adviesNiveaus: { "sanExtra.stopcontact": "eenvoudig", bad: "nee" },
    } as unknown as Normen;
    expect(niveauVan(eigen, "sanExtra.stopcontact")).toBe("eenvoudig");
    expect(niveauVan(eigen, "bad")).toBe("lastig");
  });

  it("wastafel met ingebouwd kastje vóór stopcontacten (elektricien nodig)", () => {
    const x = woning();
    const k = kandidaten(x, N, alleenSanExtra(), false, undefined, VANDAAG);
    const plek = (t: RegExp) => k.findIndex((c) => t.test(c.o));
    expect(plek(/^Ingebouwd kastje/)).toBeGreaterThanOrEqual(0);
    expect(plek(/^Ingebouwd kastje/)).toBeLessThan(plek(/^Stopcontact/));
    expect(k.find((c) => /^Stopcontact/.test(c.o))?.h).toBe("gemiddeld");
  });

  it("kastruimte (40 × 40) vóór een extra handdoekradiator (leidingwerk of elektra)", () => {
    const x = woning();
    const k = kandidaten(x, N, alleenSanExtra(), false, undefined, VANDAAG);
    const plek = (t: RegExp) => k.findIndex((c) => t.test(c.o));
    expect(plek(/^Kastruimte/)).toBeLessThan(plek(/^Handdoekenradiator/));
    // de bron: zelfde kosten per punt, dus de volgorde van de lijst (radiator eerst)
    const bron = kandidaten(x, N, alleenSanExtra(), false, undefined, VANDAAG, true);
    expect(bron.findIndex((c) => /^Handdoekenradiator/.test(c.o))).toBeLessThan(
      bron.findIndex((c) => /^Kastruimte/.test(c.o)),
    );
  });

  it("route: met alleen eenvoudige voorzieningen gehaald, dan geen radiator of stopcontact", () => {
    const x = woning();
    const doel = calc(x, N).totaal + 2;
    const delen = sanDelen(x, doel, false);
    expect(delen.length).toBeGreaterThan(0);
    expect(delen.join("; ")).not.toMatch(/Handdoekenradiator|Stopcontact/);
    expect(delen.join("; ")).toMatch(/Ingebouwd kastje/);
    // de bron neemt de radiator wél mee
    expect(sanDelen(x, doel, true).join("; ")).toMatch(/Handdoekenradiator/);
  });

  it("een lastigere voorziening alleen als het doel anders niet gehaald wordt", () => {
    const x = woning();
    // meer dan alle eenvoudige samen (afscheiding 1,25, kastje 1, kastruimte 0,75, kranen 0,75)
    const doel = calc(x, N).totaal + 4;
    const delen = sanDelen(x, doel, false).join("; ");
    expect(delen).toMatch(/Ingebouwd kastje/);
    expect(delen).toMatch(/Handdoekenradiator|Stopcontact/);
  });

  it("aftopping blijft: extra sanitair nooit meer dan de punten van douche en bad", () => {
    const x = woning();
    const R0 = calc(x, N);
    const R = calc(
      berekenRoute(x, N, alleenSanExtra(), 9999, undefined, { vandaag: VANDAAG }).input,
      N,
    );
    expect(R.exact - R0.exact).toBeLessThanOrEqual(N.san.douche + 0.001);
  });
});
