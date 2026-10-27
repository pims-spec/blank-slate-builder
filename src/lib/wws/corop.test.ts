import { describe, expect, it } from "vitest";
import { calc } from "./calc";
import { beoordeelKleinCorop, coropRegio, kleinCoropActief } from "./corop";
import { legeInput } from "./legeInput";
import type { CoropGegevens } from "./types";

const ams = (bouwjaar: number | null): CoropGegevens => ({
  gemeentecode: "0363",
  gemeente: "Amsterdam",
  bouwjaar,
});

describe("kengetal kleine nieuwbouw COROP", () => {
  it("kent de gemeenten van Groot-Amsterdam en Utrecht (CBS), Zaanstad niet", () => {
    expect(coropRegio("0363")).toBe("Groot-Amsterdam");
    expect(coropRegio("0394")).toBe("Groot-Amsterdam"); // Haarlemmermeer
    expect(coropRegio("0344")).toBe("Utrecht");
    expect(coropRegio("1961")).toBe("Utrecht"); // Vijfheerenlanden
    expect(coropRegio("0479")).toBeNull(); // Zaanstad
    expect(coropRegio("0599")).toBeNull(); // Rotterdam
  });

  it("aan bij < 40 m², bouwjaar 2018–2022 en de juiste regio", () => {
    expect(beoordeelKleinCorop(ams(2018), 39.5).aan).toBe(true);
    expect(beoordeelKleinCorop(ams(2022), 25).aan).toBe(true);
    expect(beoordeelKleinCorop(ams(2023), 25).aan).toBe(false);
    expect(beoordeelKleinCorop(ams(2020), 40).aan).toBe(false);
    expect(beoordeelKleinCorop(ams(2020), 0).aan).toBe(false);
    expect(beoordeelKleinCorop({ ...ams(2020), gemeentecode: "0599" }, 30).aan).toBe(false);
  });

  it("! alleen bij een onbekend bouwjaar; bij een oud pand een tip over ombouw", () => {
    const onbekend = beoordeelKleinCorop(ams(null), 30);
    expect(onbekend.aan).toBe(false);
    expect(onbekend.twijfel).toMatch(/bouwjaar/);
    const oud = beoordeelKleinCorop(ams(1975), 30);
    expect(oud.twijfel).toBeNull();
    expect(oud.uitleg).toMatch(/ombouw/);
    expect(beoordeelKleinCorop(ams(null), 60).twijfel).toBeNull();
  });

  it("het zelf gezette vinkje gaat voor; zonder gegevens telt alleen het vinkje", () => {
    const w = legeInput().woz;
    expect(kleinCoropActief({ ...w, kleinCorop: true }, 30)).toBe(true);
    expect(kleinCoropActief({ ...w, corop: ams(2020) }, 30)).toBe(true);
    expect(kleinCoropActief({ ...w, corop: ams(2020) }, 45)).toBe(false);
    expect(kleinCoropActief({ ...w, corop: ams(2020), kleinCoropZelf: true }, 30)).toBe(false);
  });

  it("de berekening gebruikt het automatisch bepaalde kengetal", () => {
    const i = legeInput();
    i.vertrekken = [{ type: "woonkamer", m2: 30, verwarmd: true, verkoeld: false }];
    i.woz = { ...i.woz, waarde: 300000, corop: ams(2020) };
    const met = calc(i);
    expect(met.rows.find((r) => r.nr === 11)?.t).toMatch(/kleine nieuwbouw COROP/);
    const zonder = calc({ ...i, woz: { ...i.woz, kleinCoropZelf: true } });
    expect(met.exact).not.toBe(zonder.exact);
  });
});
