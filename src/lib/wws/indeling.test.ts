import { describe, expect, it } from "vitest";
import { facDefault } from "./basis";
import { calc } from "./calc";
import {
  berekenVarianten,
  berekenVariantenKern,
  heeftToilet,
  ruimtenUitTelling,
  ruimteToevoegen,
  ruimteWijzigen,
  toepassen,
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

describe("tekenen: ruimte wijzigen en toevoegen (zoals de bron, in de telling zelf)", () => {
  it("wijzigt bbox, m² en inkeping in de lijst én de telling; origineel ongewijzigd", () => {
    const x = woning();
    const rooms = ruimtenUitTelling(x);
    const bbox = { x: 0.1, y: 0.1, w: 0.3, h: 0.2 };
    const notch = { tl: { w: 0.2, h: 0.2 }, tr: null, bl: null, br: null };
    const r = ruimteWijzigen(x, rooms, 1, {
      bbox,
      m2: 13.5,
      notch,
      herkomst: "Plattegrond, aangepast",
    });
    expect(r.rooms[1]).toMatchObject({ bbox, m2: 13.5, notch });
    expect(r.input.vertrekken[1]).toMatchObject({
      bbox,
      m2: "13,5",
      notch,
      herkomst: "Plattegrond, aangepast",
    });
    expect(x.vertrekken[1]!.m2).toBe(12);
    expect(rooms[1]!.bbox).toBeNull();
    const leeg = ruimteWijzigen(r.input, r.rooms, 1, {
      notch: { tl: null, tr: null, bl: null, br: null },
    });
    expect("notch" in leeg.input.vertrekken[1]!).toBe(false);
  });

  it("nieuwe ruimte krijgt voorzieningen, verwarming en status zoals indelingVoegRuimteToe", () => {
    const x = woning();
    const bbox = { x: 0.5, y: 0.5, w: 0.2, h: 0.2 };
    const r = ruimteToevoegen(x, ruimtenUitTelling(x), {
      key: "overig",
      type: "toilet",
      naam: "",
      m2: "1,5",
      bbox,
    });
    const rij = r.input.overig.at(-1)!;
    expect(rij).toMatchObject({ type: "toilet", m2: "1,5", bbox, verwarmd: false });
    expect(rij.fac?.kind).toBe("toilet");
    expect(r.rooms.at(-1)).toMatchObject({
      key: "overig",
      idx: r.input.overig.length - 1,
      status: "vast",
      m2: 1.5,
      bbox,
    });
    const v = ruimteToevoegen(x, [], {
      key: "vertrekken",
      type: "slaapkamer",
      naam: "Slaapkamer 3",
      m2: "",
      bbox,
    });
    expect(v.input.vertrekken.at(-1)).toMatchObject({ verwarmd: true });
    expect(v.rooms[0]!.status).toBe("vrij");
  });

  it("toepassen haalt ook de oude Storage-verwijzing weg", () => {
    const x = { ...woning(), plattegrond: { pad: "a/b.jpg", breedte: 1, hoogte: 1 } };
    const v = berekenVarianten(x, ruimtenUitTelling(x), null, "", N)[0]!;
    expect(toepassen(x, v).plattegrond).toBeUndefined();
  });
});
