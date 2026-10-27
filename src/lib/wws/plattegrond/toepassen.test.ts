import { describe, expect, it } from "vitest";
import { facDefault } from "../basis";
import { legeInput } from "../legeInput";
import type { PlattegrondAntwoord } from "../ai/antwoorden";
import type { FacBadkamer, FacKeuken, FacToilet } from "../types";
import { platToepassen, standaardKeuzes, standaardVervangen } from "./toepassen";

const antwoord = (): PlattegrondAntwoord =>
  ({
    maatvoering: "mm",
    ruimten: [],
    keuken: { aanrecht_m: 2.4, bron: "afgelezen" },
    sanitair: {
      toilet_toiletruimte: 1,
      toilet_badkamer: 1,
      wastafel_badkamer: 2,
      fontein_toiletruimte: 1,
      douche: 1,
      bad: 1,
      bad_douche: 0,
    },
    buitenruimten: [],
    nameten: [],
  }) as unknown as PlattegrondAntwoord;

describe("plattegrond overnemen: van de voorzieningen alleen de aanrechtlengte", () => {
  it("sanitair staat standaard uit en blijft in de telling zoals het was", () => {
    const i = legeInput();
    i.vertrekken = [
      { type: "keuken", m2: 8, verwarmd: true, fac: facDefault("keuken", true) },
      { type: "badkamer", m2: 5, verwarmd: true, fac: facDefault("badkamer", true) },
    ];
    i.overig = [{ type: "toilet", m2: 1, verwarmd: false, fac: facDefault("toilet", true) }];
    const k = standaardKeuzes(antwoord());
    expect(k.sanitair).toBe(false);
    expect(k.keuken).toBe(true);
    const uit = platToepassen(i, antwoord(), k);
    expect((uit.vertrekken[0]!.fac as FacKeuken).keuken.lengte).toBe(">=2");
    expect((uit.vertrekken[1]!.fac as FacBadkamer).san).toEqual(
      (facDefault("badkamer", true) as FacBadkamer).san,
    );
    expect((uit.overig[0]!.fac as FacToilet).toilet).toEqual({ toilet: "geen", fontein: false });
  });

  it("ingelezen ruimten beginnen leeg (geen standaardsanitair), raam en open keuken gaan mee", () => {
    const R = antwoord();
    const ruimte = (soort: "vertrek" | "overig", type: string, extra: object = {}) =>
      ({ soort, type, naam: "", m2: 4, bron: "afgelezen", ...extra }) as never;
    R.ruimten = [
      ruimte("vertrek", "keuken", { raam: false, open_keuken: true }),
      ruimte("vertrek", "badkamer", { raam: null }),
      ruimte("vertrek", "slaapkamer", { raam: true }),
      ruimte("overig", "toilet", { raam: false }),
    ];
    const k = { ...standaardKeuzes(R), vervangen: true };
    const uit = platToepassen(legeInput(), R, k);
    const [keuken, bad, slaap] = uit.vertrekken;
    expect(keuken).toMatchObject({ raam: false, openKeuken: true });
    expect((keuken!.fac as FacKeuken).keuken.lengte).toBe(">=2");
    expect((bad!.fac as FacBadkamer).san).toEqual(
      (facDefault("badkamer", true) as FacBadkamer).san,
    );
    expect(bad).not.toHaveProperty("raam");
    expect(slaap).toMatchObject({ raam: true });
    expect(slaap).not.toHaveProperty("openKeuken");
    expect((uit.overig[0]!.fac as FacToilet).toilet).toEqual({ toilet: "geen", fontein: false });
    // zonder aanrecht in het antwoord: keuken korter dan 1 m, niet de standaard 1–2 m
    const zonder = platToepassen(legeInput(), { ...R, keuken: {} }, k);
    expect((zonder.vertrekken[0]!.fac as FacKeuken).keuken.lengte).toBe("<1");
  });

  it("bestaande telling met m²: standaard vervangen, zodat de ruimten niet dubbel komen", () => {
    const leeg = legeInput();
    expect(standaardVervangen(leeg)).toBe(false);
    leeg.vertrekken.push({ type: "slaapkamer", m2: "", verwarmd: true });
    expect(standaardVervangen(leeg)).toBe(false); // alleen een soort zonder m²: aanvullen
    leeg.vertrekken.push({ type: "woonkamer", m2: 20, verwarmd: true });
    expect(standaardVervangen(leeg)).toBe(true);
  });

  it("vervangen: ingevulde voorzieningen blijven bij dezelfde soort ruimte", () => {
    const i = legeInput();
    const san = { ...(facDefault("badkamer") as FacBadkamer).san, bad: 1 };
    i.vertrekken = [
      { type: "woonkamer", m2: 20, verwarmd: true },
      { type: "badkamer", m2: 5, verwarmd: true, fac: { kind: "badkamer", san } },
    ];
    i.overig = [{ type: "toilet", m2: 1, verwarmd: true, fac: facDefault("toilet", true) }];
    const R = antwoord();
    const ruimte = (soort: "vertrek" | "overig", type: string, m2: number) =>
      ({ soort, type, naam: "", m2, bron: "afgelezen" }) as never;
    R.ruimten = [
      ruimte("vertrek", "woonkamer", 21),
      ruimte("vertrek", "badkamer", 4.5),
      ruimte("overig", "toilet", 1.1),
    ];
    const uit = platToepassen(i, R, { ...standaardKeuzes(R), vervangen: true });
    expect(uit.vertrekken.map((r) => [r.type, r.m2])).toEqual([
      ["woonkamer", "21"],
      ["badkamer", "4,5"],
    ]);
    expect(uit.overig).toHaveLength(1);
    expect((uit.vertrekken[1]!.fac as FacBadkamer).san.bad).toBe(1);
    // het lege toilet blijft leeg (geen standaard)
    expect((uit.overig[0]!.fac as FacToilet).toilet.toilet).toBe("geen");
  });
});
