// Leesbare voorbeelden met met de hand nagerekende uitkomsten.
// De volledige gelijkheid met wws-site.html staat in calc.vergelijk.test.ts.
import { describe, expect, it } from "vitest";
import { calc, huurVoorPunten, wozCap, zetBronAfronding } from "./calc";
import { ensureFac, m2r, q, r2 } from "./basis";
import { legeInput } from "./legeInput";
import type {
  FacBadkamer,
  FacKeuken,
  FacToilet,
  OverigeRuimte,
  Vertrek,
  WwsInput,
  WwsResultaat,
} from "./types";

const PEIL = new Date("2026-10-14");
const reken = (i: WwsInput) => calc(i, undefined, { peildatum: PEIL });
const p = (r: WwsResultaat, nr: number) => r.rows.find((x) => x.nr === nr)!.p;
const heeftWarn = (r: WwsResultaat, deel: string) => r.warn.some((w) => w.includes(deel));

function vertrek(
  type: Vertrek["type"],
  m2: number | string,
  extra: Partial<Vertrek> = {},
): Vertrek {
  const r: Vertrek = { type, m2, verwarmd: true, verkoeld: false, ...extra };
  ensureFac("vertrekken", r, true);
  return r;
}
function overig(type: OverigeRuimte["type"], m2: number | string, verwarmd = false): OverigeRuimte {
  const r: OverigeRuimte = { type, m2, verwarmd };
  ensureFac("overig", r, true);
  return r;
}

/** Doorsnee appartement */
function voorbeeld(): WwsInput {
  const i = legeInput();
  const keuken = vertrek("keuken", 6, { verkoeld: true });
  Object.assign((keuken.fac as FacKeuken).keuken, {
    lengte: "1-2",
    voorz: { kook_ind: true, koelkast: true, afzuig: true },
  });
  const bad = vertrek("badkamer", 4.5);
  Object.assign((bad.fac as FacBadkamer).san, {
    wastafel: 1,
    douche: 1,
    eisenOk: true,
    voorz: { afscheiding: true, stopcontact: "3", handdoekrad: "1" },
  });
  const wc = overig("toilet", 1.2);
  (wc.fac as FacToilet).toilet = { toilet: "hangend", fontein: true };
  i.vertrekken = [
    vertrek("woonkamer", "25,4"),
    vertrek("slaapkamer", 12.3),
    vertrek("slaapkamer", 8.2),
    keuken,
    bad,
  ];
  i.overig = [overig("hal", 5, true), overig("berging_in", 4.4), wc];
  i.energie = { soort: "label", label: "A", indexKlasse: "", datum: "2022-05-01", bouwjaar: 1995 };
  i.buiten.ruimten = [{ soort: "balkon", groep: "priv", m2: 6.4 }];
  i.woz = { soort: "woz", waarde: 300000, jaar: "2026", nieuwbouw1519: false, kleinCorop: false };
  return i;
}

describe("afronding", () => {
  it("kwart punten vanaf een achtste, m² vanaf een halve", () => {
    expect(q(3.1)).toBe(3);
    expect(q(3.125)).toBe(3.25);
    expect(m2r(51.49)).toBe(51);
    expect(m2r(51.5)).toBe(52);
  });
});

describe("voorbeeldappartement", () => {
  const r = reken(voorbeeld());
  it("rubrieken", () => {
    expect(p(r, 1)).toBe(56); // 25,4+12,3+8,2+6+4,5 = 56,4 → 56
    expect(p(r, 2)).toBe(3); // berging 4,4 → 4 × 0,75 (toilet 1,2 m² < 2 m²: telt niet)
    expect(p(r, 3)).toBe(12); // 5 verwarmde vertrekken × 2 + hal 1 + keuken verkoeld 1
    expect(p(r, 4)).toBe(37);
    expect(p(r, 5)).toBe(7.5); // 4 + 1,75 + 1 + 0,75
    expect(p(r, 6)).toBe(12.25); // hangend 3,75 + wastafel 1 + fontein 1 + douche 4 + extra (1,25 + 2×0,25 + 0,75)
    expect(p(r, 8)).toBe(4); // 6,4 → 6 m²: 2 + 6 × 0,35 = 4,1 → 4
  });
  it("WOZ op kwarten; m² van vertrekken en overige ruimten onafgerond opgeteld", () => {
    expect(p(r, 11)).toBe(q(300000 / 16954 + 300000 / 61 / 268)); // 56,4 + 4,4 = 60,8 → 61 m²
  });
  it("totaal, segment en huur", () => {
    expect(r.totaal).toBe(Math.round(56 + 3 + 12 + 37 + 7.5 + 12.25 + 4 + p(r, 11)));
    expect(r.seg).toBe("midden");
    expect(r.maxHuur).toBe(huurVoorPunten(r.totaal));
    expect(heeftWarn(r, "Stopcontacten tellen tot maximaal 2 per wastafel")).toBe(true);
    expect(heeftWarn(r, "kleiner dan 2 m²")).toBe(true);
  });
});

describe("afronding zoals de Huurprijscheck (bewuste afwijking van de bron)", () => {
  // Uit de Huurprijscheck-bijlagen van de CBRE-rapporten (Huurcommissie leidend)
  function woning(buiten: number) {
    const i = legeInput();
    i.vertrekken = [vertrek("woonkamer", 30.2), vertrek("slaapkamer", 30.1)];
    i.overig = [overig("berging_in", 6.4)];
    i.buiten.ruimten = buiten ? [{ soort: "balkon", groep: "priv", m2: buiten }] : [];
    i.woz = { soort: "woz", waarde: 431000, jaar: "2026", nieuwbouw1519: false, kleinCorop: false };
    return i;
  }
  it("buitenruimte: eerst afronden op hele m²", () => {
    expect(p(reken(woning(3.6)), 8)).toBe(3.5); // 4 m²: 2 + 1,4 = 3,4 → 3,5
    expect(p(reken(woning(29.5)), 8)).toBe(12.5); // 30 m²
    expect(p(reken(woning(0.4)), 8)).toBe(2); // 0 m², wel een buitenruimte
  });
  it("WOZ-m²: vertrekken en overige ruimten onafgerond opgeteld (Aalbersestraat 88)", () => {
    // 60,3 + 6,4 = 66,7 → 67 m² (de bron: 60 + 6 = 66 m², 49,75 punten)
    expect(p(reken(woning(0)), 11)).toBe(49.5);
  });
  it("met de afronding van de bron (alleen voor de vergelijkingstests)", () => {
    zetBronAfronding(true);
    try {
      expect(p(reken(woning(3.6)), 8)).toBe(3.25);
      expect(p(reken(woning(0)), 11)).toBe(49.75);
    } finally {
      zetBronAfronding(false);
    }
  });
});

describe("bijzonderheden uit de bron", () => {
  it("woonkamer met open keuken telt als 2 verwarmde vertrekken", () => {
    const i = legeInput();
    i.vertrekken = [vertrek("woonkamer_ok", 30)];
    expect(p(reken(i), 3)).toBe(4);
  });
  it("vertrek < 4 m² telt mee, met waarschuwing", () => {
    const i = legeInput();
    i.vertrekken = [vertrek("slaapkamer", 3.5)];
    const r = reken(i);
    expect(p(r, 1)).toBe(4);
    expect(heeftWarn(r, "minimaal 4 m²")).toBe(true);
  });
  it("badkamer en keuken < 4 m² tellen mee zonder waarschuwing (brongetrouw: met)", () => {
    const i = legeInput();
    i.vertrekken = [vertrek("badkamer", 1.7), vertrek("keuken", 2.8)];
    const r = reken(i);
    expect(p(r, 1)).toBe(5);
    expect(heeftWarn(r, "minimaal 4 m²")).toBe(false);
    zetBronAfronding(true);
    try {
      expect(heeftWarn(reken(i), "minimaal 4 m²")).toBe(true);
    } finally {
      zetBronAfronding(false);
    }
  });
  it("verlopen label → bouwjaar", () => {
    const i = legeInput();
    i.energie = {
      soort: "label",
      label: "A",
      indexKlasse: "",
      datum: "2015-03-01",
      bouwjaar: 1990,
    };
    const r = reken(i);
    expect(p(r, 4)).toBe(11);
    expect(heeftWarn(r, "vervallen")).toBe(true);
  });
  it("geen labelklasse → 0 punten en waarschuwing (geen terugval)", () => {
    const i = legeInput();
    i.energie.datum = "2023-01-01";
    expect(p(reken(i), 4)).toBe(0);
  });
  it("monument: geen minpunten energie", () => {
    const i = legeInput();
    i.energie = { soort: "label", label: "G", indexKlasse: "", datum: "2024-01-01", bouwjaar: "" };
    i.opslag.keuze = "gemprov";
    expect(p(reken(i), 4)).toBe(0);
  });
  it("keuken: extra's afgetopt op het aanrecht", () => {
    const i = legeInput();
    const k = vertrek("keuken", 8);
    Object.assign((k.fac as FacKeuken).keuken, {
      lengte: "1-2",
      voorz: { vaatwasser: true, koelkast: true, oven: true, magnetron: true, kook_ind: true },
    });
    i.vertrekken = [k];
    expect(p(reken(i), 5)).toBe(8);
  });
  it("Frans balkon telt niet; geen buitenruimte = -5", () => {
    const i = legeInput();
    i.buiten.ruimten = [{ soort: "fransbalkon", groep: "priv", m2: 3 }];
    expect(p(reken(i), 8)).toBe(-5);
  });
  it("zorgwoning en rijksmonument (rubriek 13)", () => {
    const i = voorbeeld();
    i.bijz.zorgwoning = true;
    i.opslag.keuze = "rijks_voor";
    const r = reken(i);
    expect(r.rows.find((x) => x.naam.startsWith("Zorgwoning"))).toBeTruthy();
    expect(r.rows.find((x) => x.nr === 13)?.p).toBe(50);
    expect(r.opslagPct).toBe(0);
  });
});

describe("WOZ-cap", () => {
  const basis = (m2: number, waarde: number) => {
    const i = legeInput();
    i.vertrekken = [vertrek("woonkamer", m2, { verwarmd: false })];
    i.energie = { soort: "label", label: "A", indexKlasse: "", datum: "2024-01-01", bouwjaar: "" };
    i.woz = { soort: "woz", waarde, jaar: "2026", nieuwbouw1519: false, kleinCorop: false };
    return i; // overig = m2 + 37 − 5
  };
  it("cap zoals de Huurprijscheck: per punt omlaag, getoond naar boven afgerond", () => {
    // overig 172, WOZ zonder cap 171,25 → 84,25 (85/256 = 33,2%) → 83,25 (84/255 = 32,9%)
    const r = reken(basis(140, 2_000_000));
    expect(r.wozCapActief).toBe(true);
    expect(p(r, 11)).toBe(84);
    expect(r.totaal).toBe(255);
  });
  it("brongetrouw: 33% van het totaal, naar beneden afgerond op hele punten", () => {
    zetBronAfronding(true);
    try {
      const r = reken(basis(140, 2_000_000)); // max 172 × 0,33/0,67 = 84,7 → 84
      expect(p(r, 11)).toBe(84);
      expect(r.totaal).toBe(256);
    } finally {
      zetBronAfronding(false);
    }
  });
  it("zakt door de cap onder 187 → 186 punten", () => {
    const r = reken(basis(60, 1_500_000));
    expect(r.wozCapFloor).toBe(true);
    expect(r.totaal).toBe(186);
    expect(r.seg).toBe("midden");
  });
});

// Metingen met de Huurprijscheck van de Huurcommissie (27 oktober 2026): één woonkamer van m2 m²
// (verwarmd), label A, geen buitenruimte → overig = m2 + 39. Getoonde WOZ-punten en totaal.
const PROEVEN: [m2: number, overig: number, woz: number, toon: number, totaal: number][] = [
  [87, 126, 1500000, 62, 188],
  [88, 127, 1500000, 62, 189],
  [89, 128, 1500000, 62, 189],
  [90, 129, 1500000, 63, 192],
  [91, 130, 1500000, 64, 194],
  [92, 131, 1500000, 64, 194],
  [93, 132, 1500000, 65, 197],
  [94, 133, 1500000, 65, 198],
  [95, 134, 1500000, 66, 200],
  [96, 135, 1500000, 66, 201],
  [97, 136, 1500000, 66, 201],
  [98, 137, 1500000, 67, 204],
  [99, 138, 1500000, 67, 205],
  [100, 139, 1500000, 68, 207],
  [101, 140, 1500000, 68, 208],
  [102, 141, 1500000, 69, 209],
  [103, 142, 1500000, 70, 212],
  [104, 143, 1500000, 70, 212],
  [105, 144, 1500000, 71, 215],
  [106, 145, 1500000, 71, 215],
  [107, 146, 1500000, 72, 218],
  [108, 147, 1500000, 72, 218],
  [109, 148, 1500000, 73, 221],
  [110, 149, 1500000, 73, 221],
  [111, 150, 1500000, 73, 223],
  [112, 151, 1500000, 74, 225],
  [97, 136, 800000, 66, 202],
  [97, 136, 900000, 67, 203],
  [97, 136, 1000000, 67, 203],
  [97, 136, 1200000, 66, 202],
  [97, 136, 2000000, 66, 202],
  [97, 136, 3000000, 66, 201],
  [104, 143, 800000, 70, 213],
  [104, 143, 900000, 70, 212],
  [104, 143, 1000000, 70, 213],
  [104, 143, 1200000, 70, 213],
  [104, 143, 2000000, 70, 213],
  [104, 143, 3000000, 70, 213],
  [89, 128, 1480000, 62, 189],
  [89, 128, 1481000, 63, 191],
  [89, 128, 1482000, 63, 191],
  [89, 128, 1483000, 63, 191],
  [89, 128, 1484000, 63, 191],
  [89, 128, 1485000, 63, 191],
  [89, 128, 1486000, 63, 191],
  [89, 128, 1487000, 63, 191],
  [89, 128, 1488000, 62, 189],
  [89, 128, 1489000, 62, 189],
  [89, 128, 1490000, 62, 189],
  [89, 128, 1491000, 63, 191],
  [89, 128, 1492000, 63, 191],
  [89, 128, 1493000, 63, 191],
  [89, 128, 1494000, 63, 191],
  [89, 128, 1495000, 63, 191],
  [89, 128, 1496000, 63, 191],
  [89, 128, 1497000, 63, 191],
  [89, 128, 1498000, 62, 189],
  [89, 128, 1499000, 62, 189],
];

// CBRE-rapporten (Huurprijscheck-bijlagen) waarin de cap meetelt: WOZ-m², overig, WOZ-waarde,
// getoonde WOZ-punten en totaal.
const CBRE_CAP: [
  adres: string,
  m2: number,
  overig: number,
  woz: number,
  toon: number,
  totaal: number,
][] = [
  ["Davisstraat 32-2", 67, 143, 641000, 70, 213],
  ["Haarlemmermeerstraat 127H", 58, 119.75, 627000, 66.25, 186],
  ["Haarlemmermeerstraat 139H", 53, 146, 573000, 71, 216],
  ["IJdoornlaan 251L-3", 80, 165.5, 525000, 55.5, 221],
  ["IJdoornlaan 251T-1", 115, 202.5, 719000, 65.75, 268],
  ["IJdoornlaan 259A-3", 122, 212.5, 679000, 60.75, 273],
  ["IJdoornlaan 261L-1", 76, 159, 519000, 56, 215],
  ["Leenhofstraat 73-2", 54, 142, 425000, 54.5, 197],
  ["Maasstraat 121-1", 68, 122.25, 785000, 63.5, 186],
  ["Marco Polostraat 177-2", 40, 131.25, 448000, 64, 195],
  ["Marco Polostraat 177-H", 39, 127.75, 552000, 62, 189],
  ["Marco Polostraat 195H", 41, 122, 481000, 64.25, 186],
  ["Staringstraat 44-4", 49, 114.75, 569000, 71, 186],
  ["Sloterkade 86-3", 58, 138.25, 560000, 67, 205],
  ["Stadionweg 251-2", 63, 136.75, 661000, 67, 203],
  ["Van Spilbergenstraat 66-B", 43, 123, 515000, 63, 186],
  ["Westlandgracht 65-2", 48, 114.75, 539000, 70.75, 186],
];

describe("wozCap: zoals de Huurprijscheck", () => {
  const N = { wozCapPct: 33, grensMidden: 186 };
  const zonderCap = (woz: number, m2: number) => q(r2(woz / 16954) + r2(woz / m2 / 268));
  const uit = (overig: number, woz: number, m2: number) => {
    const c = wozCap(overig, zonderCap(woz, m2), N, true);
    return [c.toon, c.vloer ? 186 : Math.round(overig + c.pW + 1e-9)];
  };
  it.each(PROEVEN)("proef %i m², overig %i, WOZ %i → %i / %i", (m2, overig, woz, toon, totaal) => {
    expect(uit(overig, woz, m2)).toEqual([toon, totaal]);
  });
  it.each(CBRE_CAP)("%s", (_, m2, overig, woz, toon, totaal) => {
    expect(uit(overig, woz, m2)).toEqual([toon, totaal]);
  });
  it("zonder vloer (kengetal kleine nieuwbouw) gaat het aftellen door onder 187", () => {
    const c = wozCap(119.75, 77.25, N, false);
    expect(c.vloer).toBe(false);
    expect(Math.round(119.75 + c.pW)).toBeLessThan(187);
  });
});

describe("huurprijstabel 2026", () => {
  it("onder 40, in de tabel en erboven", () => {
    expect(huurVoorPunten(20)).toBe(250.26);
    expect(huurVoorPunten(40)).toBe(250.26);
    expect(huurVoorPunten(41)).toBe(256.53);
    const laatste = huurVoorPunten(250)!; // tabel loopt t/m 250 punten
    expect(huurVoorPunten(251)).toBeCloseTo(laatste + (1667.4 - 1660.54), 2);
  });
});
