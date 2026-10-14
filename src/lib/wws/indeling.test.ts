import { describe, expect, it } from "vitest";
import { facDefault } from "./basis";
import { calc } from "./calc";
import {
  berekenVarianten,
  berekenVariantenKern,
  heeftToilet,
  ruimtenUitTelling,
  toiletVangnet,
  type IndelingRij,
} from "./indeling";
import { legeInput } from "./legeInput";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import type { Pve } from "./pve";
import type { WwsInput } from "./types";

const N = DEFAULT_NORMEN as unknown as Normen;

/** De telling uit de browsertest: woonkamer, slaapkamer, keuken, badkamer, hal, toiletruimte */
function woning(): WwsInput {
  const x = legeInput();
  x.vertrekken.push(
    { type: "woonkamer", m2: 30, verwarmd: true },
    { type: "slaapkamer", m2: 12, verwarmd: true },
    { type: "keuken", m2: 8, verwarmd: true, fac: facDefault("keuken", false) },
    { type: "badkamer", m2: 5, verwarmd: true, fac: facDefault("badkamer", false) },
  );
  x.overig.push(
    { type: "hal", m2: 6, verwarmd: false },
    { type: "toilet", m2: "1,2", verwarmd: false, fac: facDefault("toilet", false) },
  );
  x.energie = { soort: "label", label: "C", indexKlasse: "", datum: "2024-01-01", bouwjaar: "" };
  return x;
}

const pveMet = (apartToilet: string): Pve => ({
  id: "p1",
  naam: "TEST",
  badkamer: {
    actief: true,
    san: {
      toiletStaand: 0,
      toiletHang: 0,
      wastafel: 1,
      meerpers: 0,
      douche: 1,
      bad: 0,
      badDouche: 0,
      eisenOk: true,
      voorz: {},
    },
  },
  indeling: { apartToilet, slaapkamers: "3" },
});

/** Behouden badkamer zonder toilet; de toiletruimte vervalt */
function ruimten(x: WwsInput) {
  const rooms = ruimtenUitTelling(x);
  rooms.find((r) => r.type === "toilet")!.status = "negeren";
  return rooms;
}

const badkamerVan = (v: { vertrekken: IndelingRij[] }) =>
  v.vertrekken.find((r) => r.fac?.kind === "badkamer")!.fac as { san: { toiletStaand: unknown } };

describe("toiletvangnet (bewuste afwijking van wws-site.html)", () => {
  for (const apartToilet of ["nee", "auto"]) {
    it(`apartToilet "${apartToilet}": behouden badkamer zonder toilet, toiletruimte vervalt → toilet in de badkamer`, () => {
      const x = woning();
      const kern = berekenVariantenKern(x, ruimten(x), pveMet(apartToilet), "", N);
      // de bron: geen enkele variant heeft een toilet
      expect(kern.length).toBeGreaterThan(0);
      expect(kern.every((v) => !heeftToilet(v))).toBe(true);

      const met = berekenVarianten(x, ruimten(x), pveMet(apartToilet), "", N);
      expect(met.map((v) => v.nSlaap)).toEqual(kern.map((v) => v.nSlaap));
      met.forEach((v, i) => {
        expect(v.toiletToegevoegd).toBe(true);
        expect(v.geenToilet).toBe(false);
        expect(heeftToilet(v)).toBe(true);
        expect(badkamerVan(v).san.toiletStaand).toBe(1);
        // en dat telt mee in de punten
        expect(v.R.totaal).toBeGreaterThan(kern[i]!.R.totaal);
        expect(v.R).toEqual(calc(v.input, N));
      });
    });
  }

  it("heeft de variant al een toilet (toiletruimte blijft), dan verandert er niets", () => {
    const x = woning();
    const rooms = ruimtenUitTelling(x); // toiletruimte staat standaard op 'vast'
    const kern = berekenVariantenKern(x, rooms, null, "", N);
    const met = berekenVarianten(x, rooms, null, "", N);
    expect(met.every((v) => v.toiletToegevoegd === false && v.geenToilet === false)).toBe(true);
    expect(met.map((v) => [v.vertrekken, v.overig, v.R])).toEqual(
      kern.map((v) => [v.vertrekken, v.overig, v.R]),
    );
  });

  it("zonder badkamer in de variant: geen toilet toe te voegen → geenToilet", () => {
    const v = {
      vertrekken: [{ type: "woonkamer", m2: 30, verwarmd: true }] as IndelingRij[],
      overig: [
        { type: "toilet", m2: 1, verwarmd: false, fac: facDefault("toilet", true) },
      ] as IndelingRij[],
    };
    const uit = toiletVangnet(v);
    expect(uit).toMatchObject({ toiletToegevoegd: false, geenToilet: true });
    // invoer niet gewijzigd
    expect(v.overig[0]!.fac).toEqual(facDefault("toilet", true));
  });

  it("wijzigt de variant zelf niet", () => {
    const x = woning();
    const v = berekenVariantenKern(x, ruimten(x), pveMet("nee"), "", N)[0]!;
    const voor = JSON.stringify(v.vertrekken);
    toiletVangnet(v);
    expect(JSON.stringify(v.vertrekken)).toBe(voor);
  });
});
