import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { calc } from "./calc";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import { genereer } from "./testdata";
import { diffInvoer, rubriekVerschillen, versieKeuzeLabel } from "./versieDiff";

const require = createRequire(import.meta.url);
const BRON = require("../../../reference/wws-site-versiediff.cjs") as {
  diffVersies: (a: unknown, b: unknown) => unknown;
  versieKeuzeLabel: (v: unknown) => string;
};
const N = DEFAULT_NORMEN as unknown as Normen;

describe("versies vergelijken gelijk aan wws-site.html", () => {
  it("diffVersies: 300 willekeurige paren invoer", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const a = genereer(seed),
        b = seed % 5 ? genereer(seed + 1000) : genereer(seed);
      expect(diffInvoer(a, b)).toEqual(BRON.diffVersies({ input: a }, { input: b }));
    }
  });

  it("versieKeuzeLabel", () => {
    for (const v of [
      { nr: 2, notitie: "Na renovatie", createdAt: "2026-03-04T10:00:00Z" },
      { nr: 1, notitie: "", createdAt: "2026-03-04T10:00:00Z" },
    ])
      expect(versieKeuzeLabel(v)).toBe(BRON.versieKeuzeLabel(v));
  });
});

describe("verschil per rubriek (aanvulling op de bron)", () => {
  it("telt per rubriek op en geeft B − A", () => {
    const a = calc(genereer(1), N),
      b = calc(genereer(2), N);
    const d = rubriekVerschillen(a.rows, b.rows);
    expect(d.map((x) => x.nr)).toEqual(
      [...new Set([...a.rows, ...b.rows].map((r) => r.nr))].sort((x, y) => x - y),
    );
    const somA = d.reduce((s, x) => s + x.a, 0),
      somB = d.reduce((s, x) => s + x.b, 0);
    expect(Math.round(somA * 100) / 100).toBeCloseTo(a.exact, 1);
    expect(Math.round(somB * 100) / 100).toBeCloseTo(b.exact, 1);
    d.forEach((x) => expect(x.verschil).toBeCloseTo(x.b - x.a, 2));
  });
});
