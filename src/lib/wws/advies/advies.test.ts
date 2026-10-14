import { describe, expect, it } from "vitest";
import { calc } from "../calc";
import { legeInput } from "../legeInput";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import type { WwsInput } from "../types";
import { berekenAdvies, selectieResultaat, standaardInstellingen } from "./advies";

const N = DEFAULT_NORMEN as unknown as Normen;
const VANDAAG = "2026-10-14";

function woning(energie: Partial<WwsInput["energie"]>): WwsInput {
  const x = legeInput();
  x.vertrekken.push(
    { type: "woonkamer", m2: 30, verwarmd: true },
    { type: "keuken", m2: 8, verwarmd: true },
    { type: "slaapkamer", m2: 12, verwarmd: false },
    { type: "badkamer", m2: 5, verwarmd: true },
  );
  x.energie = { ...x.energie, ...energie };
  x.woz.waarde = 350000;
  return x;
}

describe("berekenAdvies", () => {
  it("standaardinstellingen: kosten uit de normen, laadpaal uit", () => {
    const inst = standaardInstellingen(N);
    expect(inst.kosten.labelStap).toBe(7500);
    expect(inst.uit).toEqual({ laadpaal: true });
    expect(inst.marge).toBe(0);
  });

  it("doel is de grens van de vrije sector plus de marge", () => {
    const x = woning({ soort: "label", label: "D", datum: "2024-01-01" });
    const inst = { ...standaardInstellingen(N), marge: 5 };
    expect(berekenAdvies(x, N, inst, { vandaag: VANDAAG }).doel).toBe(N.grensMidden + 1 + 5);
  });

  it("wijzigt de invoer niet", () => {
    const x = woning({ soort: "label", label: "E", datum: "2024-01-01" });
    const voor = structuredClone(x);
    berekenAdvies(x, N, standaardInstellingen(N), { vandaag: VANDAAG });
    expect(x).toEqual(voor);
  });

  it("telling op bouwjaar: stelt een nieuw label (NTA 8800) voor, met kosten (niet €0)", () => {
    const x = woning({ soort: "bouwjaar", label: "", bouwjaar: 1975 });
    const A = berekenAdvies(x, N, standaardInstellingen(N), { vandaag: VANDAAG });
    const label = A.stappen.find((s) => s.key === "label");
    expect(label?.o).toMatch(
      /^Nieuw energielabel \(vanaf 2021, NTA 8800\) laten opnemen: bouwjaar 1975 naar label /,
    );
    expect(label?.c).toBeGreaterThan(0);
    expect(label?.h).toBe("gemiddeld");
  });

  it("labelsprong: één stap beter label gaat altijd mee, als zelf gekozen", () => {
    const x = woning({ soort: "label", label: "C", datum: "2024-01-01" });
    const inst = { ...standaardInstellingen(N), labelsprong: true };
    const A = berekenAdvies(x, N, inst, { vandaag: VANDAAG });
    const label = A.stappen.find((s) => s.key === "label");
    expect(label?.forced).toBe(true);
    expect(label?.delen[0]).toBe("Energielabel C naar B");
  });

  it("stappen tellen op tot het eindtotaal; de selectie zonder overslaan is de hele route", () => {
    const x = woning({ soort: "label", label: "E", datum: "2024-01-01" });
    const A = berekenAdvies(x, N, standaardInstellingen(N), { vandaag: VANDAAG });
    expect(A.stappen.length).toBeGreaterThan(0);
    expect(A.stappen.at(-1)?.tot).toBe(A.eind.totaal);
    const S = selectieResultaat(x, N, A);
    expect(S.n).toBe(A.stappen.length);
    expect(S.R.totaal).toBe(A.eind.totaal);
    expect(S.kosten).toBe(A.stappen.reduce((s, g) => s + g.c, 0));
    // één stap overslaan: minder punten en kosten
    const zonder = selectieResultaat(x, N, A, { 0: true });
    expect(zonder.n).toBe(A.stappen.length - 1);
    expect(zonder.R.totaal).toBeLessThanOrEqual(A.eind.totaal);
    expect(calc(zonder.input, N).totaal).toBe(zonder.R.totaal);
  });
});
