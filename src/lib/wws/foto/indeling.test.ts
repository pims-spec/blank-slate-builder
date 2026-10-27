import { describe, expect, it } from "vitest";
import { facDefault } from "../basis";
import { legeInput } from "../legeInput";
import type { WwsInput } from "../types";
import type { Beoordeling, ElementOordeel } from "./beoordeling";
import { ELEMENTEN, type FotoRuimte } from "./elementen";
import {
  beginIndeling,
  doelOpties,
  FOTO_HERKOMST,
  GEEN,
  groepeer,
  KIEZEN,
  pasWoningToe,
} from "./indeling";
import { controleerSortering, sorteerPrompt, sorteerSchema, type FotoSortering } from "./sorteren";

const o = (over: Partial<ElementOordeel> = {}): ElementOordeel => ({
  status: "niet_vast_te_stellen",
  vrijstaand: false,
  aantal: null,
  soort: null,
  bewijs: "Niet te zien.",
  fotos: [],
  ...over,
});
const beoordeling = (r: FotoRuimte, over: Record<string, ElementOordeel> = {}): Beoordeling =>
  Object.fromEntries(ELEMENTEN[r].map((e) => [e.sleutel, over[e.sleutel] ?? o()]));
const s = (soort: FotoSortering["soort"]): FotoSortering => ({ soort, reden: "x" });

function woning(): WwsInput {
  const i = legeInput();
  i.vertrekken = [
    { type: "woonkamer", m2: 30, verwarmd: true },
    { type: "keuken", m2: 8, verwarmd: true, fac: facDefault("keuken") },
    { type: "badkamer", m2: 5, verwarmd: true, fac: facDefault("badkamer") },
    { type: "slaap_san", m2: 12, verwarmd: true, fac: facDefault("slaap_san") },
  ];
  i.overig = [
    { type: "toilet", naam: "Toilet beneden", m2: 1, verwarmd: false, fac: facDefault("toilet") },
    { type: "toilet", m2: 1, verwarmd: false, fac: facDefault("toilet") },
  ];
  return i;
}

describe("sorteren", () => {
  it("instructie en schema noemen de vier soorten", () => {
    const p = sorteerPrompt(3);
    expect(p).toContain("3 foto's van een Nederlandse huurwoning");
    for (const k of ["- keuken:", "- badkamer:", "- toilet:", "- anders:"]) expect(p).toContain(k);
    expect(p).toContain("Beschrijf geen personen");
    expect(JSON.stringify(sorteerSchema())).toContain(
      '"enum":["keuken","badkamer","toilet","anders"]',
    );
  });

  it("met plattegrond: extra soort in instructie, schema en controle; zonder blijft hij ongeldig", () => {
    expect(sorteerPrompt(2)).not.toContain("- plattegrond:");
    expect(sorteerPrompt(2, true)).toContain("- plattegrond:");
    expect(JSON.stringify(sorteerSchema(true))).toContain(
      '"enum":["keuken","badkamer","toilet","anders","plattegrond"]',
    );
    const data = { fotos: [{ foto: 1, soort: "plattegrond", reden: "Tekening." }] };
    expect(controleerSortering(1, data)).toBeNull();
    expect(controleerSortering(1, data, true)).toEqual([
      { soort: "plattegrond", reden: "Tekening." },
    ]);
  });

  it("controleerSortering: in fotovolgorde; ontbrekend, dubbel of onbekend → null", () => {
    const r = controleerSortering(2, {
      fotos: [
        { foto: 2, soort: "toilet", reden: "  Wandcloset  " },
        { foto: 1, soort: "keuken", reden: "Aanrecht." },
      ],
    });
    expect(r).toEqual([
      { soort: "keuken", reden: "Aanrecht." },
      { soort: "toilet", reden: "Wandcloset" },
    ]);
    const regel = (foto: number, soort = "keuken") => ({ foto, soort, reden: "x" });
    expect(controleerSortering(2, { fotos: [regel(1)] })).toBeNull();
    expect(controleerSortering(2, { fotos: [regel(1), regel(1)] })).toBeNull();
    expect(controleerSortering(2, { fotos: [regel(1), regel(3)] })).toBeNull();
    expect(controleerSortering(1, { fotos: [regel(1, "slaapkamer")] })).toBeNull();
    expect(controleerSortering(1, { fotos: [{ ...regel(1), extra: 1 }] })).toBeNull();
    expect(controleerSortering(1, null)).toBeNull();
  });
});

describe("indeling", () => {
  it("doelOpties: alleen keuken, badkamer en toilet (niet slaap_san), dubbele namen genummerd", () => {
    expect(doelOpties(woning()).map((x) => [x.doel, x.naam])).toEqual([
      ["vertrekken:1", "Keuken"],
      ["vertrekken:2", "Badkamer"],
      ["overig:0", "Toilet beneden"],
      ["overig:1", "Toiletruimte"],
      ["nieuw:keuken", "Nieuwe keuken toevoegen"],
      ["nieuw:badkamer", "Nieuwe badkamer toevoegen"],
      ["nieuw:toilet", "Nieuwe toiletruimte toevoegen"],
    ]);
    const i = legeInput();
    i.overig = [1, 2].map(() => ({
      type: "toilet" as const,
      m2: 1,
      verwarmd: false,
      fac: facDefault("toilet"),
    }));
    expect(
      doelOpties(i)
        .slice(0, 2)
        .map((x) => x.naam),
    ).toEqual(["Toiletruimte 1", "Toiletruimte 2"]);
  });

  it("beginIndeling: één → die, meer → kiezen, geen → nieuw, anders → niet gebruiken", () => {
    const i = woning();
    expect(beginIndeling(i, [s("keuken"), s("toilet"), s("anders"), s("badkamer")])).toEqual([
      "vertrekken:1",
      KIEZEN,
      GEEN,
      "vertrekken:2",
    ]);
    expect(beginIndeling(legeInput(), [s("toilet")])).toEqual(["nieuw:toilet"]);
    expect(beginIndeling(legeInput(), [s("plattegrond")])).toEqual([GEEN]);
  });

  it("groepeer: per ruimte; fout bij kiezen, meer dan 10, of niets", () => {
    const i = woning();
    const g = groepeer(i, ["vertrekken:1", GEEN, "vertrekken:1", "nieuw:toilet"]);
    expect(g.fout).toBeNull();
    expect(g.groepen).toEqual([
      { doel: "vertrekken:1", ruimte: "keuken", naam: "Keuken", fotos: [0, 2] },
      { doel: "nieuw:toilet", ruimte: "toilet", naam: "Nieuwe toiletruimte toevoegen", fotos: [3] },
    ]);
    expect(groepeer(i, [KIEZEN, "vertrekken:1"]).fout).toBe("Kies bij 1 foto de ruimte.");
    expect(groepeer(i, new Array(11).fill("vertrekken:1")).fout).toMatch(
      /Hoogstens 10 foto's per ruimte/,
    );
    expect(groepeer(i, [GEEN]).fout).toMatch(/geen foto van een keuken/);
    // een doel dat niet (meer) bestaat telt niet mee
    expect(groepeer(i, ["vertrekken:0"]).groepen).toEqual([]);
  });

  it("pasWoningToe: bestaande ruimtes ingevuld, nieuwe achteraan zonder m²; invoer ongewijzigd", () => {
    const i = woning();
    const voor = JSON.stringify(i);
    const r = pasWoningToe(i, [
      {
        doel: "vertrekken:1",
        beoordeling: beoordeling("keuken", { koelkast: o({ status: "aanwezig" }) }),
      },
      {
        doel: "nieuw:badkamer",
        beoordeling: beoordeling("badkamer", { douche: o({ status: "aanwezig", aantal: 1 }) }),
      },
      {
        doel: "overig:1",
        beoordeling: beoordeling("toilet", { toilet: o({ status: "aanwezig", soort: "hangend" }) }),
      },
    ]);
    expect(JSON.stringify(i)).toBe(voor);
    expect(r.input.vertrekken[1]!.fac).toMatchObject({
      uitFoto: true,
      keuken: { voorz: { koelkast: true } },
    });
    expect(r.input.overig[1]!.fac).toMatchObject({ toilet: { toilet: "hangend" } });
    const nieuw = r.input.vertrekken[4]!;
    expect(nieuw).toMatchObject({
      type: "badkamer",
      m2: "",
      verwarmd: true,
      herkomst: FOTO_HERKOMST,
    });
    // nieuwe badkamer begint leeg: alleen wat op de foto's staat
    expect(nieuw.fac).toMatchObject({ san: { douche: 1, wastafel: 0, toiletStaand: 0 } });
    expect(r.resultaten.map((x) => [x.naam, x.nieuw])).toEqual([
      ["Keuken", false],
      ["Badkamer (nieuw)", true],
      ["Toiletruimte", false],
    ]);
  });

  it("pasWoningToe: nieuwe toiletruimte bij de overige ruimten, niet verwarmd", () => {
    const r = pasWoningToe(legeInput(), [
      {
        doel: "nieuw:toilet",
        beoordeling: beoordeling("toilet", { fontein: o({ status: "aanwezig" }) }),
      },
    ]);
    expect(r.input.overig[0]).toMatchObject({
      type: "toilet",
      verwarmd: false,
      fac: { kind: "toilet", toilet: { toilet: "geen", fontein: true } },
    });
  });
});
