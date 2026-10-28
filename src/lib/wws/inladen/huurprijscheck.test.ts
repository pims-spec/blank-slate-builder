import { describe, expect, it } from "vitest";
import { calc } from "../calc";
import type { FacBadkamer, FacKeuken, FacToilet } from "../types";
import {
  leesHuurprijscheck,
  splitsAdres,
  stukkenNaarRegels,
  vergelijkHuurprijscheck,
  zoekHuurprijscheck,
  type HpcUitkomst,
} from "./huurprijscheck";
import {
  AALBERSESTRAAT_118,
  AMSTELKADE_12_4,
  HAARLEMMERMEERSTRAAT_139H,
  HOOFDWEG_428_2,
  IJDOORNLAAN_251T_1,
} from "./huurprijscheck.fixtures";

const PEIL = new Date("2026-10-28");
const regels = (t: string) => t.split("\n").filter(Boolean);
function lees(t: string) {
  const u = leesHuurprijscheck(regels(t));
  if (!u.ok) throw new Error(u.fout);
  return u;
}
type Ok = Extract<HpcUitkomst, { ok: true }>;
const ruimte = (u: Ok, naam: string) =>
  [...u.input.vertrekken, ...u.input.overig].find((r) => r.naam === naam);

describe("stukkenNaarRegels", () => {
  it("groepeert op hoogte, van boven naar beneden en van links naar rechts", () => {
    expect(
      stukkenNaarRegels([
        { str: "11.3", x: 300, y: 500.2 },
        { str: "Slaapkamer (1)", x: 50, y: 499.8 },
        { str: "Binnenruimtes", x: 50, y: 700 },
        { str: " ", x: 10, y: 100 },
      ]),
    ).toEqual(["Binnenruimtes", "Slaapkamer (1) 11.3"]);
  });
});

describe("zoekHuurprijscheck", () => {
  it("begint bij de kop, ook midden in een rapport", () => {
    const r = zoekHuurprijscheck([
      ["Inleiding", "Tekst"],
      ["Bijlage", "Resultaat Huurprijscheck", "x"],
    ]);
    expect(r).toEqual(["Resultaat Huurprijscheck", "x"]);
  });
  it("null zonder Huurprijscheck", () => {
    expect(zoekHuurprijscheck([["Puntentellingadvies"]])).toBeNull();
  });
});

describe("splitsAdres", () => {
  it.each([
    ["Aalbersestraat 118, 1067GH Amsterdam", "Aalbersestraat", "118", "1067 GH", "Amsterdam"],
    [
      "Eerste Helmersstraat 283-3, 1054EA Amsterdam",
      "Eerste Helmersstraat",
      "283-3",
      "1054 EA",
      "Amsterdam",
    ],
    ["IJdoornlaan 251T-1, 1024KM Amsterdam", "IJdoornlaan", "251T-1", "1024 KM", "Amsterdam"],
    [
      "Gerard Doustraat 88-1V, 1072 VW Amsterdam",
      "Gerard Doustraat",
      "88-1V",
      "1072 VW",
      "Amsterdam",
    ],
  ])("%s", (regel, adres, huisnummer, postcode, plaats) => {
    expect(splitsAdres(regel)).toEqual({ adres, huisnummer, postcode, plaats });
  });
});

// Totalen uit de bijlagen; de app moet per onderdeel en in totaal precies gelijk uitkomen
describe.each([
  ["Aalbersestraat 118", AALBERSESTRAAT_118, 132],
  ["Haarlemmermeerstraat 139H", HAARLEMMERMEERSTRAAT_139H, 216],
  ["Amstelkade 12-4", AMSTELKADE_12_4, 134],
  ["Hoofdweg 428-2", HOOFDWEG_428_2, 143],
  ["IJdoornlaan 251T-1", IJDOORNLAAN_251T_1, 268],
])("%s", (_, tekst, totaal) => {
  const u = lees(tekst);
  it("komt overeen met de Huurcommissie", () => {
    expect(u.verwacht.totaal).toBe(totaal);
    const v = vergelijkHuurprijscheck(u.verwacht, calc(u.input, undefined, { peildatum: PEIL }));
    expect(v.filter((x) => !x.gelijk)).toEqual([]);
    expect(v.at(-1)).toMatchObject({ naam: "Totaal", huurcommissie: totaal, app: totaal });
  });
  it("neemt alles over (geen ‘Niet overgenomen’)", () => {
    expect(u.meldingen.filter((m) => m.startsWith("Niet overgenomen"))).toEqual([]);
  });
});

describe("Aalbersestraat 118 in detail", () => {
  const u = lees(AALBERSESTRAAT_118);
  it("meta en samenvatting", () => {
    expect(u.meta).toEqual({
      adres: "Aalbersestraat",
      huisnummer: "118",
      postcode: "1067 GH",
      plaats: "Amsterdam",
      peildatum: "2026-08-24",
    });
    expect(u.verwacht).toMatchObject({
      maxHuur: 857.33,
      tijdvak: "1 januari 2026 - 31 december 2026",
      datum: "2026-08-24",
      onderdelen: { woning: 35.75, binnen: 80.5, buiten: 15, bijzonderheden: 0.25 },
    });
  });
  it("woning: WOZ, bouwjaar en woonvorm", () => {
    expect(u.input.woz).toMatchObject({ soort: "woz", waarde: 400000, jaar: "2026" });
    expect(u.input.energie).toMatchObject({ soort: "bouwjaar", bouwjaar: 1976 });
    expect(u.input.woningtype).toBe("meergezins");
  });
  it("ruimten met m², type, verwarming en herkomst", () => {
    expect(u.input.vertrekken.map((r) => [r.naam, r.type, r.m2, r.verwarmd])).toEqual([
      ["Slaapkamer (1)", "slaapkamer", 11.3, true],
      ["Woonkamer", "woonkamer", 18.7, true],
      ["Slaapkamer (2)", "slaapkamer", 9.3, true],
      ["Badkamer", "badkamer", 2, true],
      ["Keuken", "keuken", 4.8, true],
    ]);
    expect(u.input.overig.map((r) => [r.naam, r.type, r.m2, r.verwarmd])).toEqual([
      ["Berging (1)", "berging_in", 3, false],
      ["Berging (2)", "berging_in", 5.8, false],
      // de toiletruimte staat niet bij de m², alleen bij het sanitair
      ["Toiletruimte", "toilet", 0, false],
    ]);
    expect(u.input.vertrekken[0]!.herkomst).toBe("Huurprijscheck 24-08-2026");
  });
  it("keuken, badkamer en toilet", () => {
    expect((ruimte(u, "Keuken")!.fac as FacKeuken).keuken).toEqual({
      lengte: "1-2",
      voorz: {
        vaatwasser: 1,
        kast: 1,
        oven: 1,
        magnetron: 1,
        koelkast: 1,
        kraan_een: 1,
        kook_ind: 1,
        afzuig: 1,
      },
    });
    expect((ruimte(u, "Badkamer")!.fac as FacBadkamer).san).toMatchObject({
      wastafel: 1,
      douche: 1,
      bad: 0,
      voorz: { kraan_een: 1, handdoekrad: 1 },
    });
    expect((ruimte(u, "Toiletruimte")!.fac as FacToilet).toilet).toEqual({
      toilet: "hangend",
      fontein: false,
    });
  });
  it("buiten privé, intercom en de meldingen", () => {
    expect(u.input.buiten.ruimten).toEqual([
      { soort: "balkon", groep: "priv", m2: 4.4 },
      { soort: "achtertuin", groep: "priv", m2: 3072 },
    ]);
    expect(u.input.bijz.aanbel).toBe(true);
    expect(u.meldingen.join(" ")).toMatch(/als privé overgenomen/);
    expect(u.meldingen.join(" ")).toMatch(/geen maten/);
  });
});

describe("bijzondere gevallen", () => {
  it("twee badkamers, open keuken, bad en aparte douche, label B", () => {
    const u = lees(HAARLEMMERMEERSTRAAT_139H);
    const ok = ruimte(u, "Woonkamer met open keuken")!;
    expect(ok.type).toBe("woonkamer_ok");
    expect((ok.fac as FacKeuken).keuken.lengte).toBe(">=2");
    expect((ruimte(u, "Badkamer (1)")!.fac as FacBadkamer).san).toMatchObject({
      wastafel: 2,
      toiletHang: 1,
      badDouche: 1,
      voorz: { kraan_een: 2 },
    });
    expect(u.input.energie).toMatchObject({ soort: "label", label: "B", datum: "" });
    expect(u.meldingen.join(" ")).toMatch(/zonder registratiedatum/);
  });
  it("beschermd stadsgezicht en geen buitenruimte", () => {
    const u = lees(AMSTELKADE_12_4);
    expect(u.input.opslag.keuze).toBe("stads");
    expect(u.input.buiten.ruimten).toEqual([]);
    expect((ruimte(u, "Keuken")!.fac as FacKeuken).keuken.voorz.kast).toBe(3);
  });
  it("keuken zonder gegevens en een staand toilet in de badkamer", () => {
    const u = lees(HOOFDWEG_428_2);
    expect((ruimte(u, "Keuken")!.fac as FacKeuken).keuken).toEqual({ lengte: "<1", voorz: {} });
    expect((ruimte(u, "Badkamer")!.fac as FacBadkamer).san.toiletStaand).toBe(1);
    expect(u.meldingen.join(" ")).toMatch(/Keuken mist gegevens/);
  });
  it("toiletruimte met fontein en thermostatische mengkraan in de keuken", () => {
    const u = lees(IJDOORNLAAN_251T_1);
    expect((ruimte(u, "Toiletruimte")!.fac as FacToilet).toilet).toEqual({
      toilet: "hangend",
      fontein: true,
    });
    expect((ruimte(u, "Keuken")!.fac as FacKeuken).keuken.voorz.kraan_thermo).toBe(1);
    expect(u.input.buiten.ruimten).toEqual([{ soort: "dakterras", groep: "priv", m2: 18.2 }]);
  });
  it("label A+, energie-index en ‘1977 t/m 1978’", () => {
    const met = (label: string) =>
      lees(AALBERSESTRAAT_118.replace("Energielabel: 1976 of eerder -15", label)).input.energie;
    expect(met("Energielabel: Label A+ 43")).toMatchObject({ soort: "label", label: "A+" });
    expect(met("Energielabel: Label A+++ 53")).toMatchObject({ soort: "label", label: "A+++" });
    expect(met("Energielabel: 1,2 < EI ≤ 1,4 22")).toMatchObject({
      soort: "index",
      indexKlasse: "3",
    });
    expect(met("Energielabel: 1977 t/m 1978 -9")).toMatchObject({
      soort: "bouwjaar",
      bouwjaar: 1977,
    });
  });
  it("onbekende regels worden gemeld en niet stil overgeslagen", () => {
    const u = lees(AALBERSESTRAAT_118.replace("Intercom met beeld 0,25", "Sauna 1x 0,25"));
    expect(u.meldingen).toContain("Niet overgenomen: ‘Sauna 1x 0,25’.");
  });
  it("weigert iets anders dan een Huurprijscheck en onzelfstandige woonruimte", () => {
    expect(leesHuurprijscheck(["Puntentellingadvies"])).toMatchObject({ ok: false });
    expect(leesHuurprijscheck(["Resultaat Huurprijscheck", "Samenvatting"])).toMatchObject({
      ok: false,
      fout: expect.stringMatching(/details/),
    });
    expect(
      leesHuurprijscheck(regels(AALBERSESTRAAT_118.replace("Zelfstandig", "Onzelfstandig"))),
    ).toMatchObject({ ok: false, fout: expect.stringMatching(/onzelfstandige/) });
  });
});
