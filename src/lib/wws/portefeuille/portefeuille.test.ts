import { describe, expect, it } from "vitest";
import { adresSleutel, adresTekst, epVraagVoor, normaliseerAdres } from "./adres";
import {
  PORTEFEUILLE_STANDAARD,
  analyseer,
  categorie,
  efgOmschrijving,
  portefeuilleNormen,
  verloopdatum,
  type AnalyseAdres,
  type LabelResultaat,
} from "./analyse";
import { isIsoDatum, plusJaren, plusMaanden } from "./datum";

const D = "2026-10-15";
const N = PORTEFEUILLE_STANDAARD;
const label = (
  klasse: string | null,
  reg: string | null,
  tot: string | null = null,
): LabelResultaat => ({
  status: "gevonden",
  energieklasse: klasse,
  registratiedatum: reg,
  geldigTot: tot,
  opgehaaldOp: "2026-10-14T09:00:00Z",
});
let teller = 0;
function adres(hn: number | string, r: LabelResultaat | null, toevoeging = ""): AnalyseAdres {
  const a = normaliseerAdres({ postcode: "1053 zd", huisnummer: hn, toevoeging });
  if (!a.ok) throw new Error(a.fout);
  return { ...a.adres, id: "a" + ++teller, resultaat: r };
}

describe("datums", () => {
  it("maanden en jaren erbij, met de laatste dag als de dag niet bestaat", () => {
    expect(plusMaanden("2026-10-15", 3)).toBe("2027-01-15");
    expect(plusMaanden("2026-10-15", -3)).toBe("2026-07-15");
    expect(plusMaanden("2026-08-31", 3)).toBe("2026-11-30");
    expect(plusMaanden("2027-11-30", 3)).toBe("2028-02-29"); // schrikkeljaar
    expect(plusJaren("2016-02-29", 10)).toBe("2026-02-28");
    expect(plusJaren("2016-02-29", 12)).toBe("2028-02-29");
    expect(plusMaanden("2026-01-31", -2)).toBe("2025-11-30");
  });
  it("geldige ISO-datums", () => {
    expect(isIsoDatum("2028-02-29")).toBe(true);
    expect(isIsoDatum("2027-02-29")).toBe(false);
    expect(isIsoDatum("2026-04-31")).toBe(false);
    expect(isIsoDatum("15-10-2026")).toBe(false);
    expect(isIsoDatum(null)).toBe(false);
  });
});

describe("adressen", () => {
  it("normaliseert postcode, huisnummer, huisletter en toevoeging", () => {
    const n = (hn: string, t = "", hl = "") =>
      normaliseerAdres({ postcode: " 1053zd ", huisnummer: hn, toevoeging: t, huisletter: hl });
    expect(n("49")).toEqual({
      ok: true,
      adres: { postcode: "1053ZD", huisnummer: 49, huisletter: "", toevoeging: "" },
    });
    expect(n("49a")).toMatchObject({ adres: { huisnummer: 49, huisletter: "A", toevoeging: "" } });
    expect(n("49-2")).toMatchObject({ adres: { huisletter: "", toevoeging: "2" } });
    expect(n("49", "bis")).toMatchObject({ adres: { toevoeging: "BIS" } });
    expect(n("49", "a")).toMatchObject({ adres: { huisletter: "A", toevoeging: "" } });
    expect(n("49", "-2")).toMatchObject({ adres: { toevoeging: "2" } });
    expect(n("49", "2", "B")).toMatchObject({ adres: { huisletter: "B", toevoeging: "2" } });
    expect(normaliseerAdres({ postcode: "0123AB", huisnummer: "1" })).toEqual({
      ok: false,
      fout: "postcode",
    });
    expect(normaliseerAdres({ postcode: "1053ZD", huisnummer: "" })).toEqual({
      ok: false,
      fout: "huisnummer",
    });
    expect(normaliseerAdres({ postcode: "1053ZD", huisnummer: "0" })).toEqual({
      ok: false,
      fout: "huisnummer",
    });
    expect(normaliseerAdres({ postcode: "1053ZD", huisnummer: 49, huisletter: "AB" })).toEqual({
      ok: false,
      fout: "toevoeging",
    });
  });
  it("tekst, sleutel en EP-Online-vraag", () => {
    const a = adres("49a", null, "2");
    expect(adresTekst(a)).toBe("1053 ZD 49A-2");
    expect(adresSleutel(a)).toBe("1053ZD|49|A|2");
    expect(epVraagVoor(a)).toEqual({
      postcode: "1053ZD",
      huisnummer: "49",
      huisletter: "A",
      huisnummertoevoeging: "2",
    });
  });
});

describe("verloopdatum en categorie (analysedatum 15-10-2026, venster 3 maanden)", () => {
  const cat = (r: LabelResultaat, m = 3) => categorie(r, D, m, N.verouderdVoor);
  it("verloopdatum: Geldig tot, anders registratie + 10 jaar, anders onbekend", () => {
    expect(verloopdatum(label("B", "2020-01-01", "2030-06-30"))).toBe("2030-06-30");
    expect(verloopdatum(label("B", "2020-02-29"))).toBe("2030-02-28");
    expect(verloopdatum(label("B", null))).toBeNull();
    expect(verloopdatum(label("B", "onzin", "ook-onzin"))).toBeNull();
  });
  it("randen van het venster: precies 3 maanden telt mee, één dag later niet", () => {
    expect(cat(label("C", "2017-01-15"))).toBe("verloopt"); // verloopt 2027-01-15 = D + 3 mnd
    expect(cat(label("C", "2017-01-16"))).toBe("verouderd"); // één dag na het venster
    expect(cat(label("C", "2016-10-15"))).toBe("verloopt"); // verloopt vandaag
    expect(cat(label("C", "2016-10-14"))).toBe("verlopen"); // gisteren verlopen
    expect(cat(label("C", "2017-03-01"), 6)).toBe("verloopt"); // ander venster
  });
  it("verouderd vs. NTA 8800, geen label en ontbrekende datums", () => {
    expect(cat(label("A", "2020-12-31"))).toBe("verouderd");
    expect(cat(label("A", "2021-01-01"))).toBe("in_orde");
    expect(cat(label(null, "2022-05-01"))).toBe("geen_label");
    expect(cat(label("X", "2022-05-01"))).toBe("geen_label");
    expect(cat({ ...label(null, null), status: "niet_gevonden" })).toBe("geen_label");
    expect(cat(label("B", null))).toBe("in_orde"); // klasse zonder datums
    expect(cat(label("b", "2022-05-01"))).toBe("in_orde"); // kleine letter
  });
});

describe("analyse van een portefeuille", () => {
  const adressen = (): AnalyseAdres[] => [
    adres(1, label("A", "2023-03-01")), // in orde
    adres(2, label("C", "2016-11-20")), // verloopt 2026-11-20
    adres(3, label("E", "2016-09-01")), // verlopen 2026-09-01 (binnen −3 mnd)
    adres(4, label("G", "2012-01-01")), // verlopen 2022 (buiten de lijst)
    adres(5, label("F", "2019-05-05")), // verouderd, EFG
    adres(6, { ...label(null, null), status: "niet_gevonden" }), // geen label
    adres(7, { ...label(null, null), status: "meerdere" }), // te controleren
    adres(8, { ...label(null, null), status: "fout" }), // te controleren
    adres(9, null), // nog niet opgehaald
    adres(1, label("A", "2023-03-01")), // dubbel: telt één keer
  ];

  it("telt per klasse, risico (samen 100%), verlooplijst en te controleren", () => {
    const u = analyseer(adressen(), D, 3, N);
    expect(u.aantalAdressen).toBe(9);
    expect(u.aantalBeoordeeld).toBe(6);
    expect(u.perKlasse.find((k) => k.klasse === "C")!.aantal).toBe(1);
    expect(u.perKlasse.at(-1)).toEqual({ klasse: "geen label", aantal: 1 });
    expect(u.perKlasse.reduce((s, k) => s + k.aantal, 0)).toBe(6);
    expect(Object.fromEntries(u.risico.map((r) => [r.categorie, r.aantal]))).toEqual({
      geen_label: 1,
      verlopen: 2,
      verloopt: 1,
      verouderd: 1,
      in_orde: 1,
    });
    expect(u.risico.find((r) => r.categorie === "verlopen")!.pct).toBe(33.3);
    expect(u.risico.find((r) => r.categorie === "verloopt")!.naam).toBe(
      "Label verloopt binnen 3 maanden",
    );
    expect(u.verloopLijst.map((r) => [r.adres, r.verloopdatum, r.status])).toEqual([
      ["1053 ZD 3", "2026-09-01", "verlopen"],
      ["1053 ZD 2", "2026-11-20", "verloopt"],
    ]);
    expect(u.teControleren).toEqual({
      nietGevonden: ["1053 ZD 6"],
      meerdere: ["1053 ZD 7"],
      fout: ["1053 ZD 8"],
      nietOpgehaald: ["1053 ZD 9"],
    });
    expect(u.epOpgehaaldVan).toBe("2026-10-14T09:00:00Z");
  });

  it("EFG: klassen en 'geen label' volgens de instellingen", () => {
    const apart = analyseer(adressen(), D, 3, N);
    expect(apart.efg.woningen.map((w) => w.adres)).toEqual(["1053 ZD 3", "1053 ZD 4", "1053 ZD 5"]);
    expect([apart.efg.aantal, apart.efg.pct, apart.efg.geenLabelApart]).toEqual([3, 50, 1]);
    const mee = analyseer(adressen(), D, 3, { ...N, efg: { ...N.efg, geenLabel: "meetellen" } });
    expect([mee.efg.aantal, mee.efg.geenLabelApart]).toEqual([4, null]);
    const alleenG = analyseer(adressen(), D, 3, {
      ...N,
      efg: { ...N.efg, klassen: ["G"], geenLabel: "negeren" },
    });
    expect([alleenG.efg.aantal, alleenG.efg.geenLabelApart]).toEqual([1, null]);
  });

  it("lege portefeuille: geen deling door nul", () => {
    const u = analyseer([], D, 3, N);
    expect(u.risico.every((r) => r.pct === 0)).toBe(true);
    expect(u.efg.pct).toBe(0);
    expect(u.epOpgehaaldVan).toBeNull();
  });
});

describe("instellingen en omschrijving", () => {
  it("vult ontbrekende of ongeldige instellingen aan met de standaard", () => {
    expect(portefeuilleNormen(undefined)).toEqual(PORTEFEUILLE_STANDAARD);
    expect(
      portefeuilleNormen({
        epPerSeconde: 50,
        verouderdVoor: "31-12-2020",
        efg: { ingangsdatum: "2030-01-01", klassen: ["G", "Z", "E"], geenLabel: "x" as never },
      }),
    ).toEqual({
      epPerSeconde: 2,
      verouderdVoor: "2021-01-01",
      efg: { ingangsdatum: "2030-01-01", klassen: ["E", "G"], geenLabel: "apart" },
    });
  });
  it("neutrale omschrijving uit de instellingen", () => {
    expect(efgOmschrijving(N.efg)).toBe(
      "Woningen met label E, F of G per 1 januari 2029 (instelling in Normen; de wettelijke invulling is nog te controleren). Woningen zonder geregistreerd label staan apart vermeld.",
    );
    expect(
      efgOmschrijving({ ingangsdatum: "2030-07-01", klassen: ["G"], geenLabel: "meetellen" }),
    ).toBe(
      "Woningen met label G per 1 juli 2030 (instelling in Normen; de wettelijke invulling is nog te controleren). Woningen zonder geregistreerd label tellen mee.",
    );
  });
});
