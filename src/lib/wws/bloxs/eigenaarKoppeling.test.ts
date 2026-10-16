import { describe, expect, it } from "vitest";
import { kiesGohomeEigenaar } from "./eigenaarKoppeling";

const klanten = [
  { id: "k1", naam: "Amstel Wonen" },
  { id: "k2", naam: "Rijn  Vastgoed B.V." },
];

describe("GoHome-eigenaar bij een Bloxs-eigenaar", () => {
  it("1. eerdere portefeuille van dezelfde Bloxs-eigenaar gaat voor", () => {
    expect(
      kiesGohomeEigenaar(
        { id: 7, naam: "Amstel Wonen" },
        [{ bron: "bloxs", bloxsEigenaarRef: "7", klantId: "k2" }],
        klanten,
      ),
    ).toEqual({ soort: "bestaand", klantId: "k2" });
  });

  it("eerdere koppeling naar een verwijderde eigenaar telt niet", () => {
    expect(
      kiesGohomeEigenaar(
        { id: 7, naam: "Amstel Wonen" },
        [{ bron: "bloxs", bloxsEigenaarRef: "7", klantId: "weg" }],
        klanten,
      ),
    ).toEqual({ soort: "bestaand", klantId: "k1" });
  });

  it("2. zelfde naam, ongeacht hoofdletters en spaties", () => {
    expect(kiesGohomeEigenaar({ id: 8, naam: " rijn vastgoed b.v. " }, [], klanten)).toEqual({
      soort: "bestaand",
      klantId: "k2",
    });
  });

  it("3. anders nieuw, met de naam uit Bloxs; CSV-portefeuilles tellen niet mee", () => {
    expect(
      kiesGohomeEigenaar(
        { id: 9, naam: "Nieuwe  Eigenaar" },
        [{ bron: "import", bloxsEigenaarRef: "9", klantId: "k1" }],
        klanten,
      ),
    ).toEqual({ soort: "nieuw", naam: "Nieuwe Eigenaar" });
  });
});
