import { describe, expect, it } from "vitest";
import {
  allePaden,
  MAX_RAPPORT_PLATTEGRONDEN,
  ongebruikteRapportPaden,
  paginaTitel,
  rapportPlattegronden,
} from "./rapport";

const T = "11111111-1111-4111-8111-111111111111";
const pad = (n: number) => `${T}/00000000-0000-4000-8000-${String(n).padStart(12, "0")}.jpg`;

describe("rapport-plattegronden", () => {
  it("laat alleen geldige verwijzingen door", () => {
    const lijst = rapportPlattegronden({
      rapportPlattegronden: [
        { pad: pad(1), breedte: 1200, hoogte: 1600, soort: "2d" },
        { pad: "../ander/bestand.jpg", breedte: 10, hoogte: 10, soort: "2d" },
        { pad: pad(2), breedte: 0, hoogte: 10, soort: "3d" },
        { pad: pad(3), breedte: 10, hoogte: 10, soort: "onbekend" },
        {
          pad: pad(4),
          breedte: 10,
          hoogte: 10,
          soort: "eigen",
          titel: "  Zolder  " + "x".repeat(80),
        },
        null,
      ],
    });
    expect(lijst.map((p) => p.pad)).toEqual([pad(1), pad(4)]);
    expect(lijst[1]!.titel!.startsWith("Zolder")).toBe(true);
    expect(lijst[1]!.titel!.length).toBe(60);
    expect(rapportPlattegronden({})).toEqual([]);
    expect(rapportPlattegronden({ rapportPlattegronden: "geen lijst" })).toEqual([]);
  });

  it("hoogstens het maximum", () => {
    const veel = Array.from({ length: 12 }, (_, i) => ({
      pad: pad(i + 1),
      breedte: 10,
      hoogte: 10,
      soort: "2d",
    }));
    expect(rapportPlattegronden({ rapportPlattegronden: veel })).toHaveLength(
      MAX_RAPPORT_PLATTEGRONDEN,
    );
  });

  it("paginatitel zoals de CBRE-rapporten", () => {
    expect(paginaTitel(1, { soort: "2d" })).toBe("Plattegrond 1 - 2D");
    expect(paginaTitel(3, { soort: "situatie" })).toBe("Plattegrond 3 - Situatie");
    expect(paginaTitel(4, { soort: "eigen", titel: "Zolder" })).toBe("Plattegrond 4 - Zolder");
    expect(paginaTitel(5, { soort: "eigen", titel: " " })).toBe("Plattegrond 5");
  });

  it("opruimen: alleen wat nergens meer gebruikt wordt", () => {
    const versie = { rapportPlattegronden: [{ pad: pad(2), breedte: 1, hoogte: 1, soort: "2d" }] };
    expect(ongebruikteRapportPaden([pad(1), pad(2), pad(3)], [pad(3)], [versie])).toEqual([pad(1)]);
    expect(allePaden({ plattegrond: { pad: pad(9) }, ...versie })).toEqual([pad(9), pad(2)]);
  });
});
