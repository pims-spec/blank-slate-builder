import { describe, expect, it } from "vitest";
import { facDefault } from "../basis";
import { legeInput } from "../legeInput";
import type { PlattegrondAntwoord } from "../ai/antwoorden";
import type { FacBadkamer, FacKeuken, FacToilet } from "../types";
import { platToepassen, standaardKeuzes } from "./toepassen";

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
});
