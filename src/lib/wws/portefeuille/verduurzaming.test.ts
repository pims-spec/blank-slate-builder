import { describe, expect, it } from "vitest";
import {
  RAMING_STANDAARD,
  bouwjaarKlasse,
  labelStappen,
  maakRaming,
  ramingNormen,
  type RamingNormen,
} from "./verduurzaming";

const N: RamingNormen = {
  ingesteld: true,
  perM2Laag: 100,
  perM2Hoog: 150,
  factor: { tot1945: 1.5, "1945-1974": 1.2, "1975-1991": 1, vanaf1992: 1 },
  aangenomen: { tot1945: "G", "1945-1974": "G", "1975-1991": "E", vanaf1992: "C" },
};
const bag = (oppervlakte: number | null, bouwjaar: number | null) => ({
  status: "gevonden",
  oppervlakte,
  bouwjaar,
});

describe("verduurzamingsraming", () => {
  it("labelstappen en bouwjaarklassen", () => {
    expect(labelStappen("G", "D")).toBe(3);
    expect(labelStappen("E", "C")).toBe(2);
    expect(labelStappen("D", "D")).toBe(0);
    expect(labelStappen("A", "C")).toBe(0);
    expect(labelStappen("X", "C")).toBe(0);
    expect([1900, 1944, 1945, 1974, 1975, 1991, 1992, null].map(bouwjaarKlasse)).toEqual([
      "tot1945",
      "tot1945",
      "1945-1974",
      "1945-1974",
      "1975-1991",
      "1975-1991",
      "vanaf1992",
      null,
    ]);
  });

  it("stappen × m² × €/m² × factor, laag en hoog, afgerond op € 100", () => {
    const r = maakRaming([{ adres: "A 1", klasse: "F", bag: bag(60, 1930) }], N);
    // F→D 2 stappen, F→C 3 stappen; factor 1,5
    expect(r.regels[0]).toMatchObject({
      label: "F",
      labelGeschat: false,
      stappenD: 2,
      stappenC: 3,
      naarD: { laag: 18000, hoog: 27000 },
      naarC: { laag: 27000, hoog: 40500 },
    });
    expect(r.totaalC).toEqual({ laag: 27000, hoog: 40500 });
  });

  it("woningen met C of beter staan er niet in; D alleen met kosten naar C", () => {
    const r = maakRaming(
      [
        { adres: "A 1", klasse: "B", bag: bag(60, 2000) },
        { adres: "A 2", klasse: "D", bag: bag(50, 1980) },
      ],
      N,
    );
    expect(r.regels.map((x) => [x.adres, x.stappenD, x.stappenC])).toEqual([["A 2", 0, 1]]);
    expect(r.regels[0]!.naarD).toEqual({ laag: 0, hoog: 0 });
  });

  it("zonder label: aangenomen label op grond van het bouwjaar; anders zonder bedrag", () => {
    const r = maakRaming(
      [
        { adres: "A 1", klasse: null, bag: bag(70, 1960) },
        { adres: "A 2", klasse: null, bag: bag(70, 2005) },
        { adres: "A 3", klasse: null, bag: bag(70, null) },
        { adres: "A 4", klasse: "G", bag: null },
      ],
      N,
    );
    expect(r.regels.map((x) => [x.adres, x.label, x.labelGeschat, x.opmerking])).toEqual([
      ["A 1", "G", true, ""],
      ["A 3", null, false, "Geen label en geen bouwjaar"],
      ["A 4", "G", false, "BAG nog niet opgehaald"],
    ]);
    expect(r.regels[1]!.naarC).toBeNull();
    expect(r.zonderBedrag).toBe(2);
    expect(r.bagNietOpgehaald).toBe(1);
  });

  it("standaardinschatting: € 7.500 per stap bij 70 m² (€ 107 per m²), oudere woningen duurder", () => {
    expect(RAMING_STANDAARD).toMatchObject({ ingesteld: true, perM2Laag: 107, perM2Hoog: 107 });
    // 70 m², 1975–1991 (×1): één stap ≈ € 7.500
    const een = maakRaming([{ adres: "A 1", klasse: "D", bag: bag(70, 1980) }], ramingNormen(null));
    expect(een.regels[0]!.naarC).toEqual({ laag: 7500, hoog: 7500 });
    // G, 60 m², vóór 1945 (×1,3): naar D 3 stappen = 60×107×3×1,3 = 25.038 → 25.000
    const r = maakRaming([{ adres: "A 1", klasse: "G", bag: bag(60, 1930) }], ramingNormen(null));
    expect(r.regels[0]!.naarD).toEqual({ laag: 25000, hoog: 25000 });
  });

  it("bedragen niet ingesteld: wel stappen, geen bedragen", () => {
    const r = maakRaming([{ adres: "A 1", klasse: "G", bag: bag(60, 1930) }], {
      ...RAMING_STANDAARD,
      ingesteld: false,
    });
    expect(r.ingesteld).toBe(false);
    expect(r.regels[0]).toMatchObject({ stappenD: 3, naarD: null, naarC: null });
    expect(r.totaalC).toEqual({ laag: 0, hoog: 0 });
  });

  it("instellingen controleren: ongeldige waarden → standaard, hoog nooit onder laag", () => {
    expect(ramingNormen(null)).toEqual(RAMING_STANDAARD);
    const n = ramingNormen({
      ingesteld: true,
      perM2Laag: 120,
      perM2Hoog: 80,
      factor: { tot1945: -1, "1945-1974": 1.3 } as never,
      aangenomen: { tot1945: "Q", "1975-1991": "F" } as never,
    });
    expect([n.perM2Laag, n.perM2Hoog, n.ingesteld]).toEqual([120, 120, true]);
    expect(n.factor).toEqual({ ...RAMING_STANDAARD.factor, "1945-1974": 1.3 });
    expect(n.aangenomen["tot1945"]).toBe("G");
    expect(n.aangenomen["1975-1991"]).toBe("F");
    expect(ramingNormen({ ingesteld: true, perM2Laag: 0, perM2Hoog: 0 }).ingesteld).toBe(false);
  });
});
