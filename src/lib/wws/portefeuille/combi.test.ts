import { describe, expect, it } from "vitest";
import type { AnalyseAdres } from "./analyse";
import { combiTitel, combineerAdressen } from "./combi";

const a = (
  id: string,
  hn: number,
  opgehaald: string | null,
  x: Partial<AnalyseAdres> = {},
): AnalyseAdres => ({
  id,
  postcode: "1053ZD",
  huisnummer: hn,
  huisletter: "",
  toevoeging: "",
  resultaat: opgehaald
    ? {
        status: "gevonden",
        energieklasse: "C",
        registratiedatum: "2022-01-01",
        geldigTot: null,
        opgehaaldOp: opgehaald,
      }
    : null,
  ...x,
});

describe("combineerAdressen", () => {
  it("hetzelfde adres één keer: met resultaat, dan het nieuwste", () => {
    const r = combineerAdressen([
      [a("p1-1", 1, null), a("p1-2", 2, "2026-10-01T00:00:00Z")],
      [
        a("p2-1", 1, "2026-09-01T00:00:00Z"),
        a("p2-2", 2, "2026-10-10T00:00:00Z"),
        a("p2-3", 3, null),
      ],
    ]);
    expect(r.map((x) => x.id).sort()).toEqual(["p2-1", "p2-2", "p2-3"]);
  });

  it("adressen die niet meer in Bloxs staan tellen niet mee", () => {
    const r = combineerAdressen([
      [a("x", 1, null, { nietInBloxsSinds: "2026-10-01T00:00:00Z" })],
      [a("y", 2, null)],
    ]);
    expect(r.map((x) => x.id)).toEqual(["y"]);
  });
});

describe("combiTitel", () => {
  it("kort of ingekort", () => {
    expect(combiTitel(["Oost", "West"])).toBe("Oost + West");
    expect(combiTitel(["A", "B", "C", "D", "E"])).toBe("A, B, C en 2 andere");
  });
});
