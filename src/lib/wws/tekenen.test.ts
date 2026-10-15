import { describe, expect, it } from "vitest";
import {
  clipPath,
  grootGenoeg,
  herkomstAangepast,
  inkeping,
  m2NaVergroten,
  nieuwVlak,
  schatM2VoorBbox,
  vergroot,
  verplaats,
  volgendeStatus,
  zVolgorde,
} from "./tekenen";

const b = { x: 0.2, y: 0.2, w: 0.4, h: 0.3 };
const dicht = (x: number) => Math.round(x * 1e9) / 1e9;
const rond = (o: object) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, dicht(v as number)]));

describe("tekenen op de plattegrond (zoals indelingPlatPointerMove)", () => {
  it("verplaatsen blijft binnen de tekening", () => {
    expect(rond(verplaats(b, 0.1, -0.05))).toEqual({ x: 0.3, y: 0.15, w: 0.4, h: 0.3 });
    expect(rond(verplaats(b, 0.9, 0.9))).toEqual({ x: 0.6, y: 0.7, w: 0.4, h: 0.3 });
    expect(rond(verplaats(b, -1, -1))).toEqual({ x: 0, y: 0, w: 0.4, h: 0.3 });
  });

  it("vergroten verankert aan de tegenoverliggende hoek, minimaal 2%", () => {
    expect(rond(vergroot(b, "br", 0.1, 0.1))).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.4 });
    expect(rond(vergroot(b, "tl", -0.1, -0.1))).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.4 });
    expect(rond(vergroot(b, "tr", 0.1, 0.1))).toEqual({ x: 0.2, y: 0.3, w: 0.5, h: 0.2 });
    expect(rond(vergroot(b, "bl", 0.9, 0))).toEqual({ x: 0.58, y: 0.2, w: 0.02, h: 0.3 });
    expect(rond(vergroot(b, "br", 5, 5))).toEqual({ x: 0.2, y: 0.2, w: 0.8, h: 0.8 });
  });

  it("m² schaalt mee met het oppervlak van het vlak", () => {
    expect(m2NaVergroten(12, b, { ...b, w: 0.8 })).toBe(24);
    expect(m2NaVergroten(12, b, { ...b, w: 0.001, h: 0.001 })).toBe(0.1);
    expect(m2NaVergroten(0, b, b)).toBeNull();
  });

  it("herkomst wordt één keer 'aangepast'", () => {
    const h = herkomstAangepast("Plattegrond: berekend (afgelezen)");
    expect(h).toBe("Plattegrond, aangepast (afgelezen) (formaat aangepast)");
    expect(herkomstAangepast(h)).toBe(h);
    expect(herkomstAangepast(undefined)).toBeUndefined();
  });

  it("inkeping: naar binnen slepen, max 45%, onder 4% weg", () => {
    expect(rond(inkeping({ w: 0, h: 0 }, "tl", b, 0.08, 0.06)!)).toEqual({ w: 0.2, h: 0.2 });
    expect(rond(inkeping({ w: 0, h: 0 }, "br", b, -0.08, -0.06)!)).toEqual({ w: 0.2, h: 0.2 });
    expect(inkeping({ w: 0, h: 0 }, "tl", b, 1, 1)).toEqual({ w: 0.45, h: 0.45 });
    expect(inkeping({ w: 0.1, h: 0.1 }, "tl", b, -0.04, 0)).toBeNull();
  });

  it("clip-path zoals indelingClipPath()", () => {
    expect(clipPath({ tl: null, tr: null, bl: null, br: null })).toBeUndefined();
    expect(clipPath({ tl: { w: 0.2, h: 0.3 }, tr: null, bl: null, br: null })).toBe(
      "polygon(20.00% 0%,100.00% 0%,100.00% 0.00%,100% 0.00%,100% 100.00%,100.00% 100.00%,100.00% 100%,0.00% 100%,0.00% 100.00%,0% 100.00%,0% 30.00%,20.00% 30.00%)",
    );
  });

  it("schatting voor een nieuw vlak, status doorschakelen, z-volgorde", () => {
    const rooms = [
      { bbox: { x: 0, y: 0, w: 0.5, h: 0.5 }, m2: 20 },
      { bbox: null, m2: 8 },
      { bbox: { x: 0.5, y: 0, w: 0.1, h: 0.1 }, m2: 4 },
    ];
    expect(schatM2VoorBbox(rooms, { x: 0, y: 0.5, w: 0.26, h: 0.5 })).toBe("12");
    expect(schatM2VoorBbox([], b)).toBe("");
    expect([volgendeStatus("vrij"), volgendeStatus("vast"), volgendeStatus("negeren")]).toEqual([
      "vast",
      "negeren",
      "vrij",
    ]);
    expect([...zVolgorde(rooms)]).toEqual([
      [0, 1],
      [2, 2],
    ]);
    expect(rond(nieuwVlak({ x: 0.5, y: 0.5 }, 0.2, 0.7))).toEqual({
      x: 0.2,
      y: 0.5,
      w: 0.3,
      h: 0.2,
    });
    expect(grootGenoeg({ x: 0, y: 0, w: 0.01, h: 0.5 })).toBe(false);
  });
});
