// Vergelijkt de TypeScript-rekenkern met de originele calc() uit wws-site.html.
// reference/wws-site-calc.cjs is een letterlijke uitsnede van dat bestand
// (regels 771–1216). Duizenden willekeurige tellingen moeten exact dezelfde
// rubrieken, toelichtingen, waarschuwingen, totalen en huurprijzen opleveren.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calc } from "./calc";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import { genereer } from "./testdata";

const require = createRequire(import.meta.url);
const REF = require("../../../reference/wws-site-calc.cjs") as {
  calc: (inp: unknown, N: unknown) => unknown;
  DEFAULT_NORMEN: unknown;
  clone: <T>(o: T) => T;
};

const PEIL = new Date("2026-10-14T12:00:00Z");
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PEIL);
});
afterAll(() => vi.useRealTimers());

describe("gelijk aan wws-site.html", () => {
  it("normbedragen zijn identiek aan DEFAULT_NORMEN", () => {
    expect(JSON.parse(JSON.stringify(DEFAULT_NORMEN))).toEqual(REF.DEFAULT_NORMEN);
  });

  it("de lege telling", () => {
    const leeg = genereer(0);
    Object.assign(leeg, { vertrekken: [], overig: [] });
    expect(calc(leeg, DEFAULT_NORMEN as unknown as Normen, { peildatum: PEIL })).toEqual(
      REF.calc(REF.clone(leeg), REF.clone(REF.DEFAULT_NORMEN)),
    );
  });

  const AANTAL = 5000;
  it(`${AANTAL} willekeurige tellingen geven exact dezelfde uitkomst`, () => {
    let caps = 0,
      floors = 0,
      zorg = 0,
      rijks = 0,
      nb = 0;
    for (let seed = 1; seed <= AANTAL; seed++) {
      const inp = genereer(seed);
      const ts = calc(inp, DEFAULT_NORMEN as unknown as Normen, { peildatum: PEIL });
      const ref = REF.calc(REF.clone(inp), REF.clone(REF.DEFAULT_NORMEN));
      try {
        expect(ts).toEqual(ref);
      } catch (e) {
        throw new Error(
          `Verschil bij seed ${seed}:\n${JSON.stringify(inp)}\n${(e as Error).message}`,
        );
      }
      if (ts.wozCapActief) caps++;
      if (ts.wozCapFloor) floors++;
      if (ts.rows.some((r) => r.naam.startsWith("Zorgwoning"))) zorg++;
      if (ts.rows.some((r) => r.nr === 13)) rijks++;
      if (ts.rows.find((r) => r.nr === 11)?.t.includes("nieuwbouw 2015-2019")) nb++;
    }
    // De steekproef moet de zeldzame paden ook echt raken
    expect(caps).toBeGreaterThan(20);
    expect(floors).toBeGreaterThan(0);
    expect(zorg).toBeGreaterThan(50);
    expect(rijks).toBeGreaterThan(50);
    expect(nb).toBeGreaterThan(0);
  }, 60_000);
});
