// Vergelijkt het blokkenschema met de originele indelingSchemaDataUrl() uit wws-site.html
// (letterlijk in reference/wws-site-schema.cjs). Beide tekenen op een nep-canvas dat elke
// tekenopdracht vastlegt; die reeksen moeten exact gelijk zijn.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { OVERIG_TYPES, VERTREK_TYPES } from "./basis";
import type { IndelingRij } from "./indeling";
import { schemaDataUrl, type SchemaCanvas } from "./schemaTekening";
import { rng } from "./testdata";

const require = createRequire(import.meta.url);
const { maakSchema } = require("../../../reference/wws-site-schema.cjs") as {
  maakSchema: (maak: () => unknown) => {
    indelingSchemaDataUrl: (v: unknown, o: unknown, rooms: unknown) => string | null;
  };
};

/** Nep-canvas: legt elke aanroep en elke toewijzing vast */
function nepCanvas(log: unknown[]) {
  return (): SchemaCanvas => {
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(_t, prop) {
        if (prop === "measureText") return (t: string) => ({ width: t.length * 7 });
        return (...args: unknown[]) => log.push([String(prop), ...args]);
      },
      set(_t, prop, v) {
        log.push(["=", String(prop), v]);
        return true;
      },
    });
    return {
      width: 0,
      height: 0,
      getContext: () => ctx as never,
      toDataURL: (t: string) => {
        log.push(["toDataURL", t]);
        return "data:" + t + ";base64,AA";
      },
    };
  };
}

function variant(seed: number) {
  const R = rng(seed + 53_000_003);
  const kans = (p: number) => R() < p;
  const kies = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
  const bbox = () =>
    kans(0.6)
      ? { x: R() * 0.7, y: R() * 0.7, w: R() * 0.3 + 0.02, h: R() * 0.3 + 0.02 }
      : undefined;
  const rij = (types: readonly { k: string }[]): IndelingRij =>
    ({
      type: kies(types).k,
      naam: kans(0.5) ? kies(["Slaapkamer 1", "Woonkamer met een hele lange naam", "Hal"]) : "",
      m2: kans(0.1) ? "" : String(Math.round(R() * 3000) / 100).replace(".", ","),
      verwarmd: true,
      _indVast: kans(0.5),
      _indNieuw: kans(0.5),
      bbox: bbox(),
    }) as IndelingRij;
  const vertrekken = Array.from({ length: Math.floor(R() * 7) }, () => rij(VERTREK_TYPES));
  const overig = Array.from({ length: Math.floor(R() * 5) }, () => rij(OVERIG_TYPES));
  const rooms = Array.from({ length: Math.floor(R() * 8) }, () => ({
    status: kies(["vrij", "vast", "negeren"]),
    bbox: bbox(),
  }));
  return { vertrekken, overig, rooms };
}

describe("blokkenschema gelijk aan wws-site.html", () => {
  it("300 willekeurige varianten: exact dezelfde tekenopdrachten", () => {
    let getekend = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { vertrekken, overig, rooms } = variant(seed);
      const a: unknown[] = [],
        b: unknown[] = [];
      const nieuw = schemaDataUrl(nepCanvas(a), vertrekken, overig, rooms);
      const oud = maakSchema(nepCanvas(b)).indelingSchemaDataUrl(
        JSON.parse(JSON.stringify(vertrekken)),
        JSON.parse(JSON.stringify(overig)),
        JSON.parse(JSON.stringify(rooms)),
      );
      try {
        expect(nieuw).toEqual(oud);
        expect(a).toEqual(b);
      } catch (e) {
        throw new Error(`seed ${seed}\n${(e as Error).message}`);
      }
      if (nieuw) getekend++;
    }
    expect(getekend).toBeGreaterThan(200);
  });
});
