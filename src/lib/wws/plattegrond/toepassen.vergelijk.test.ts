// Vergelijkt het overnemen van een ingelezen plattegrond met de originele applyPlat() uit
// wws-site.html (letterlijk in reference/wws-site-plattegrond.cjs; de DOM is nagebootst).
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { OVERIG_TYPES, VERTREK_TYPES } from "../basis";
import { normaliseer } from "../calc";
import { genereer, rng } from "../testdata";
import type { PlattegrondAntwoord } from "../ai/antwoorden";
import { platToepassen, standaardKeuzes, voorgesteldeSoort, type PlatKeuzes } from "./toepassen";

const require = createRequire(import.meta.url);
const { maakPlat } = require("../../../../reference/wws-site-plattegrond.cjs") as {
  maakPlat: (
    cur: { input: unknown },
    platState: unknown,
    velden: Record<string, unknown>,
  ) => { applyPlat: () => void };
};
const CALC = require("../../../../reference/wws-site-calc.cjs") as {
  normalizeInput: (i: unknown) => unknown;
};
const kloon = <T>(o: T): T => JSON.parse(JSON.stringify(o));
/**
 * Zonder de afgeleide velden die de oude normalizeInput toevoegt (keuken, san, keukens): de bron
 * berekent die vóór het aanpassen van het sanitair (dus verouderd) en niets leest ze — calc()
 * leidt ze opnieuw af.
 */
function vergelijkbaar(x: unknown) {
  const o = CALC.normalizeInput(kloon(x)) as Record<string, unknown>;
  delete o["keuken"];
  delete o["san"];
  delete o["keukens"];
  return o;
}

function antwoord(seed: number): PlattegrondAntwoord {
  const R = rng(seed + 43_000_003);
  const kies = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
  const kans = (p: number) => R() < p;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const maat = () => (kans(0.7) ? Math.round(R() * 600) / 100 : null);
  const typen = [
    ...VERTREK_TYPES.map((t) => t.k),
    ...OVERIG_TYPES.map((t) => t.k),
    "bijkeuken",
    "raar",
  ];
  return {
    maatvoering: "mm",
    ruimten: Array.from({ length: int(0, 9) }, (_, i) => ({
      soort: kies(["vertrek", "overig", "verkeer"] as const),
      type: kies(typen),
      naam: kans(0.8) ? "Ruimte " + i : "",
      lengte_m: maat(),
      breedte_m: maat(),
      m2: kans(0.85) ? Math.round(R() * 3000) / 100 : null,
      bron: kies(["afgelezen", "berekend", "ingeschat"] as const),
      zekerheid: "hoog",
      opmerking: kans(0.3) ? "x".repeat(int(1, 120)) : "",
      bbox: kans(0.6)
        ? {
            x: R() * 0.8,
            y: R() * 0.8,
            w: kans(0.9) ? R() * 0.3 + 0.01 : -0.1,
            h: R() * 0.3 + 0.01,
          }
        : undefined,
    })),
    keuken: kans(0.7) ? { aanrecht_m: kies([0.8, 1.5, 2, 2.4, null]), bron: "afgelezen" } : {},
    sanitair: {
      toilet_toiletruimte: int(0, 2),
      toilet_badkamer: int(0, 1),
      wastafel_badkamer: int(0, 2),
      fontein_toiletruimte: int(0, 1),
      douche: int(0, 1),
      bad: int(0, 1),
      bad_douche: int(0, 1),
    },
    buitenruimten: Array.from({ length: int(0, 2) }, () => ({
      naam: "Balkon",
      m2: kans(0.8) ? Math.round(R() * 1500) / 100 : null,
      bron: "berekend",
    })),
    nameten: [],
  };
}

function keuzes(seed: number, A: PlattegrondAntwoord): PlatKeuzes {
  const R = rng(seed + 47_000_003);
  const k = standaardKeuzes(A);
  k.ruimten.forEach((r) => {
    if (R() < 0.2) r.overnemen = false;
    if (R() < 0.2) r.m2 = String(Math.round(R() * 2000) / 100).replace(".", ",");
    if (R() < 0.1) r.soort = R() < 0.5 ? "v:slaapkamer" : "o:berging_in";
  });
  return {
    ...k,
    vervangen: R() < 0.4,
    sanitair: k.sanitair && R() < 0.8,
    keuken: k.keuken && R() < 0.8,
    buiten: k.buiten && R() < 0.8,
  };
}

describe("plattegrond overnemen gelijk aan wws-site.html", () => {
  it("400 willekeurige antwoorden, keuzes en tellingen", () => {
    let samengevoegd = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const input = normaliseer(genereer(seed));
      const A = antwoord(seed);
      const k = keuzes(seed, A);
      const velden: Record<string, unknown> = {
        "#platReplace": { checked: k.vervangen },
        "#platSan": { checked: k.sanitair },
        "#platKeuken": { checked: k.keuken },
        "#platBuiten": { checked: k.buiten },
        "#dlgPlat": { close() {} },
      };
      k.ruimten.forEach((r, i) => {
        velden[`[data-pr="${i}"]`] = { checked: r.overnemen };
        velden[`[data-prs="${i}"]`] = { value: r.soort };
        velden[`[data-prm="${i}"]`] = { value: r.m2 };
      });
      const cur = { input: kloon(input) };
      maakPlat(cur, { result: kloon(A) }, velden).applyPlat();
      const nieuw = platToepassen(input, A, k);
      try {
        // de oude normalizeInput voegt afgeleide velden toe (keuken, san, …): aan beide kanten
        expect(vergelijkbaar(nieuw)).toEqual(vergelijkbaar(cur.input));
      } catch (e) {
        const a = vergelijkbaar(nieuw);
        const b = vergelijkbaar(cur.input);
        const k = Object.keys(b).find((x) => JSON.stringify(a[x]) !== JSON.stringify(b[x]))!;
        throw new Error(
          `seed ${seed}, veld ${k}\nNIEUW ${JSON.stringify(a[k])}\nOUD   ${JSON.stringify(b[k])}\n${(e as Error).message}`,
        );
      }
      if (!k.vervangen && JSON.stringify(nieuw).includes("Plattegrond:")) samengevoegd++;
    }
    expect(samengevoegd).toBeGreaterThan(50);
  });

  it("voorgestelde soort: verkeer → hal/overloop, onbekend → overig, bijkeuken → wasruimte", () => {
    const r = antwoord(1).ruimten[0] ?? antwoord(2).ruimten[0]!;
    expect(voorgesteldeSoort({ ...r, soort: "verkeer", type: "overloop" })).toBe("o:overloop");
    expect(voorgesteldeSoort({ ...r, soort: "verkeer", type: "gang" })).toBe("o:hal");
    expect(voorgesteldeSoort({ ...r, soort: "overig", type: "bijkeuken" })).toBe("o:wasruimte");
    expect(voorgesteldeSoort({ ...r, soort: "vertrek", type: "zwembad" })).toBe("v:overig");
  });
});
