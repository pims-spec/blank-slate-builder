import { describe, expect, it } from "vitest";
import { calc } from "./calc";
import { legeInput } from "./legeInput";
import { DEFAULT_NORMEN, mergeNormen } from "./normen";
import { ENERGIE_RIJEN, NORM_SECTIES, leesPad, normenUitFormulier, zetPad } from "./normenVelden";

describe("normenformulier", () => {
  it("elk veld wijst naar een bestaand getal in de normen", () => {
    const n = mergeNormen(null);
    for (const s of NORM_SECTIES)
      for (const v of s.velden) expect(typeof leesPad(n, v.pad), v.pad).toBe("number");
    for (const r of ENERGIE_RIJEN) {
      expect(typeof leesPad(n, r.pad + ".0"), r.pad).toBe("number");
      expect(typeof leesPad(n, r.pad + ".1"), r.pad).toBe("number");
    }
  });

  it("zetPad en leesPad werken ook op tabellen", () => {
    const n = mergeNormen(null);
    zetPad(n, "energie.A.0", 99);
    zetPad(n, "voorzKeuken.0.p", 2);
    expect(leesPad(n, "energie.A.0")).toBe(99);
    expect(leesPad(n, "voorzKeuken.0.p")).toBe(2);
  });

  it("normenUitFormulier: getallen met komma, tekst blijft tekst, basis ongewijzigd", () => {
    const basis = mergeNormen(null);
    const n = normenUitFormulier(
      basis,
      { grensMidden: "190", "san.douche": "4,5", "woz.2026.0": "17000" },
      { naam: "Test", gecontroleerd: "2026-10-14" },
    );
    expect(n.grensMidden).toBe(190);
    expect(n.san.douche).toBe(4.5);
    expect(n.woz["2026"]![0]).toBe(17000);
    expect(n.naam).toBe("Test");
    expect(n.gecontroleerd).toBe("2026-10-14");
    expect(basis.grensMidden).toBe(DEFAULT_NORMEN.grensMidden);
    // en er wordt mee gerekend
    expect(calc(legeInput(), n).seg).toBe("laag");
  });
});
