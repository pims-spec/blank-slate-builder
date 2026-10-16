import { describe, expect, it } from "vitest";
import { eigenaarNamen, zoekAnalyses } from "./archief";
import type { ArchiefAnalyse } from "./opslag";

const rij = (x: Partial<ArchiefAnalyse>): ArchiefAnalyse => ({
  soort: "portefeuille",
  id: "a",
  titel: "Oost",
  portefeuilleIds: ["p1"],
  portefeuilleNamen: ["Oost"],
  klantIds: [],
  analyseDatum: "2026-10-16",
  vensterMaanden: 3,
  aantalAdressen: 10,
  gemaaktOp: "2026-10-16T10:00:00Z",
  gemaaktDoor: null,
  gemaaktDoorNaam: "Anna",
  ...x,
});

describe("archief: portefeuille-analyses", () => {
  const klanten = new Map([
    ["k1", "Amstel Wonen"],
    ["k2", "Rijn Vastgoed"],
  ]);
  const rijen = [
    rij({ id: "1", klantIds: ["k1"] }),
    rij({
      id: "2",
      soort: "combi",
      titel: "Alles samen",
      portefeuilleNamen: ["Oost", "West"],
      klantIds: ["k1", "k2", "weg"],
      gemaaktDoorNaam: "Bas",
    }),
  ];

  it("eigenaarnamen; onbekende ids weggelaten", () => {
    expect(eigenaarNamen(rijen[1]!, klanten)).toEqual(["Amstel Wonen", "Rijn Vastgoed"]);
  });

  it("zoeken op titel, portefeuille, eigenaar en maker; alle woorden", () => {
    expect(zoekAnalyses(rijen, "", klanten).map((r) => r.id)).toEqual(["1", "2"]);
    expect(zoekAnalyses(rijen, "west", klanten).map((r) => r.id)).toEqual(["2"]);
    expect(zoekAnalyses(rijen, "rijn", klanten).map((r) => r.id)).toEqual(["2"]);
    expect(zoekAnalyses(rijen, "amstel oost", klanten).map((r) => r.id)).toEqual(["1", "2"]);
    expect(zoekAnalyses(rijen, "anna", klanten).map((r) => r.id)).toEqual(["1"]);
  });
});
