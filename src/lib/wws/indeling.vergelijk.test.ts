// Vergelijkt het indelingsadvies met de originele code uit wws-site.html.
// reference/wws-site-indeling.cjs is een letterlijke uitsnede (openIndeling,
// indelingSplitsCirculatie, indelingBouwVariant, genereerIndelingVarianten,
// indelingVariantBlokjes, indelingVloerplanLayout, indelingBuitenrand, indelingUnieBbox,
// indelingToepassen, ...); de globals en DOM/canvas-functies gaan er als parameters/stubs in.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OVERIG_TYPES } from "./basis";
import {
  berekenVariantenKern,
  blokjes,
  buitenrand,
  ruimtenUitTelling,
  toepassen,
  unieBbox,
  vloerplanLayout,
  type IndelingStatus,
} from "./indeling";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import type { Pve } from "./pve";
import { genereer, rng, zonderLegeStandaard } from "./testdata";
import type { WwsInput } from "./types";
import { zetBronAfronding } from "./calc";

const require = createRequire(import.meta.url);
type Ref = Record<string, unknown>;
const CALC = require("../../../reference/wws-site-calc.cjs") as {
  DEFAULT_NORMEN: unknown;
  normalizeInput: (i: unknown) => WwsInput;
  clone: <T>(o: T) => T;
};
const { maakPve } = require("../../../reference/wws-site-pve.cjs") as {
  maakPve: (...a: unknown[]) => Ref;
};
const { maakIndeling } = require("../../../reference/wws-site-indeling.cjs") as {
  maakIndeling: (
    staat: Ref,
    N: unknown,
    pve: Ref,
    stubs: Ref,
  ) => {
    openIndeling: () => void;
    genereerIndelingVarianten: () => void;
    indelingVariantBlokjes: (v: unknown) => unknown;
    indelingVloerplanLayout: (items: unknown, W: number, H: number) => unknown;
    indelingBuitenrand: (...a: number[]) => unknown;
    indelingUnieBbox: (rooms: unknown) => unknown;
    indelingToepassen: (i: number) => void;
    indelingState: { rooms: Ref[]; pveId: string; varianten: Ref[] };
  };
};

const PEIL = new Date("2026-10-14T12:00:00Z");
beforeAll(() => {
  // de bron rondt buitenruimte en WOZ-m² anders af dan de app (zie calc.ts)
  zetBronAfronding(true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PEIL);
});
afterAll(() => {
  vi.useRealTimers();
  zetBronAfronding(false);
});

const N = DEFAULT_NORMEN as unknown as Normen;
const kloon = <T>(o: T): T => JSON.parse(JSON.stringify(o));

function scenario(seed: number) {
  const R = rng(seed + 8_000_003);
  const kies = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
  const kans = (p: number) => R() < p;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const x = zonderLegeStandaard(genereer(seed));
  // extra hal/overloop (verkeersruimten die deels in de pot gaan), soms met een plek (bbox)
  if (kans(0.6))
    x.overig.push({
      type: kies(["hal", "overloop"] as const),
      naam: "",
      m2: int(2, 14),
      verwarmd: false,
    });
  for (const r of [...x.vertrekken, ...x.overig]) {
    const e = r as unknown as Ref;
    if (kans(0.2))
      e["bbox"] = { x: R() * 0.6, y: R() * 0.6, w: 0.05 + R() * 0.3, h: 0.05 + R() * 0.3 };
    else if (kans(0.05)) e["bbox"] = { x: 0.9, y: 0.9, w: 0.5, h: 0.5 }; // buiten het vlak
    if (kans(0.1))
      e["notch"] = kans(0.5) ? { w: 0.1, h: 0.1 } : { tr: { w: 0.2, h: 0.1 }, bl: null };
  }
  const input = CALC.normalizeInput(CALC.clone(x));
  const pve: Pve | null = kans(0.25)
    ? null
    : ({
        id: "p1",
        naam: "PvE",
        keuken: { actief: kans(0.5), keuken: { lengte: ">=2", voorz: { afzuig: true } } },
        badkamer: {
          actief: kans(0.5),
          san: {
            toiletStaand: 0,
            toiletHang: 1,
            wastafel: 2,
            meerpers: 0,
            douche: 1,
            bad: 0,
            badDouche: 0,
            eisenOk: true,
            voorz: {},
          },
        },
        toilet: { actief: kans(0.5), toilet: { toilet: "hangend", fontein: true } },
        indeling: {
          apartToilet: kies(["auto", "ja", "nee"]),
          wasruimte: kies(["auto", "ja", "nee"]),
          keuken: kies(["auto", "apart", "open", undefined]),
          slaapkamers: kies(["", "", "3", "1", "x"]),
          verwarmd: kans(0.5)
            ? {
                "overig:toilet": true,
                "vertrekken:slaapkamer": kans(0.5),
                "overig:wasruimte": false,
              }
            : {},
        },
      } as Pve);
  const statussen: (IndelingStatus | null)[] = [...x.vertrekken, ...x.overig].map(() =>
    kans(0.5) ? null : kies(["vrij", "vast", "negeren"] as const),
  );
  return { input, pve, statussen, extra: kies(["", "", "2", "5", "abc", "0"]) };
}

describe("indelingsadvies gelijk aan wws-site.html", () => {
  const AANTAL = 400;
  it(`${AANTAL} willekeurige tellingen, statussen en PvE's: zelfde ruimten, varianten en toepassing`, () => {
    const tel = {
      varianten: 0,
      geenVarianten: 0,
      circulatie: 0,
      openKeuken: 0,
      metPve: 0,
      bbox: 0,
    };
    for (let seed = 1; seed <= AANTAL; seed++) {
      const { input, pve, statussen, extra } = scenario(seed);
      const ctx = () => `seed ${seed}`;
      // --- origineel ---
      const cur = { input: kloon(input), meta: { klantId: pve ? "k1" : "" } };
      const staat: Ref = {
        cur,
        klanten: pve ? [{ id: "k1", naam: "K", pves: [kloon(pve)] }] : [],
        indelingState: null,
      };
      const P = maakPve(
        cur,
        staat["klanten"],
        () => {},
        () => "u",
      );
      const stubs = {
        document: { querySelector: () => ({ value: extra }) },
        indelingSchemaDataUrl: () => "SCHEMA",
        toonIndelingScreen() {},
        renderIndeling() {},
        verlaatIndeling() {},
        renderMain() {},
        setDirty() {},
        toast() {},
      };
      const I = maakIndeling(staat, CALC.clone(CALC.DEFAULT_NORMEN), P, stubs);
      I.openIndeling();
      // --- TypeScript ---
      const rooms = ruimtenUitTelling(kloon(input));
      expect(rooms, `ruimten, ${ctx()}`).toEqual(I.indelingState.rooms);
      if (rooms.some((r) => r.bbox)) tel.bbox++;
      statussen.forEach((s, i) => {
        if (!s) return;
        rooms[i]!.status = s;
        I.indelingState.rooms[i]!["status"] = s;
      });
      I.indelingState.pveId = pve ? "p1" : "";
      I.genereerIndelingVarianten();
      const ref = I.indelingState.varianten;
      const ts = berekenVariantenKern(kloon(input), rooms, pve ? kloon(pve) : null, extra, N);
      try {
        expect(
          ts.map((v) => ({ vertrekken: v.vertrekken, overig: v.overig, nSlaap: v.nSlaap, R: v.R })),
        ).toEqual(
          ref.map((v) => ({
            vertrekken: v["vertrekken"],
            overig: v["overig"],
            nSlaap: v["nSlaap"],
            R: v["R"],
          })),
        );
        ts.forEach((v, i) => expect(blokjes(v)).toEqual(I.indelingVariantBlokjes(ref[i])));
      } catch (e) {
        throw new Error(`varianten verschillen, ${ctx()}\n${(e as Error).message}`);
      }
      if (ts.length) tel.varianten++;
      else tel.geenVarianten++;
      if (
        ts.some((v) =>
          v.overig.some((r) => r._indVast && OVERIG_TYPES.find((t) => t.k === r.type)?.verkeer),
        )
      )
        tel.circulatie++;
      if (ts.some((v) => v.vertrekken.some((r) => r.type === "woonkamer_ok" && r._indNieuw)))
        tel.openKeuken++;
      if (pve) tel.metPve++;

      // toepassen (de bron zet een schema als plattegrondImg; hier bewust weggelaten)
      if (ts.length) {
        const i = seed % ts.length;
        I.indelingToepassen(i);
        const na = toepassen(kloon(input), ts[i]!);
        expect(na.vertrekken, `toepassen, ${ctx()}`).toEqual(cur.input.vertrekken);
        expect(na.overig, `toepassen, ${ctx()}`).toEqual(cur.input.overig);
        expect(na).not.toHaveProperty("plattegrondImg");
      }

      // schema: vloerplanLayout, buitenrand, unieBbox
      const R = rng(seed + 9_000_003);
      const items = Array.from({ length: Math.floor(R() * 12) }, () => ({
        m2: Math.round(R() * 400) / 10,
      }));
      const [W, H] = [400 + Math.floor(R() * 600), 200 + Math.floor(R() * 600)];
      expect(vloerplanLayout(items, W, H)).toEqual(I.indelingVloerplanLayout(items, W, H));
      const b = [R() * 700, R() * 500, R() * 200, R() * 200, 720, 520, 20].map((v) =>
        Math.round(v),
      );
      expect(
        buitenrand(...(b as [number, number, number, number, number, number, number])),
      ).toEqual(I.indelingBuitenrand(...b));
      expect(unieBbox(rooms)).toEqual(I.indelingUnieBbox(I.indelingState.rooms));
    }
    for (const [pad, n] of Object.entries(tel))
      expect(n, `pad "${pad}" te weinig geraakt`).toBeGreaterThan(10);
  }, 300_000);
});
