// Vergelijkt het TypeScript-verbeteradvies met de originele code uit wws-site.html.
// reference/wws-site-advies.cjs is een letterlijke uitsnede (candidates, runAdvies,
// selectieResultaat, berekenRouteVoorDoel, MAATREGELEN); de globals van de pagina
// (N, cur, adviesState) gaan er als parameters in. Honderden willekeurige tellingen
// met willekeurige instellingen moeten exact dezelfde stappen en uitkomsten geven.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LABELS } from "../basis";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { genereer, rng } from "../testdata";
import type { WwsInput } from "../types";
import { berekenAdvies, berekenRoute, selectieResultaat } from "./advies";
import { MAATREGELEN } from "./maatregelen";
import type { AdviesInstellingen, Kosten, RouteResultaat } from "./types";

const require = createRequire(import.meta.url);
type Ref = Record<string, unknown>;
const CALC = require("../../../../reference/wws-site-calc.cjs") as {
  DEFAULT_NORMEN: Ref;
  normalizeInput: (i: unknown) => Ref;
  clone: <T>(o: T) => T;
};
const { maakAdvies } = require("../../../../reference/wws-site-advies.cjs") as {
  maakAdvies: (
    N: unknown,
    cur: { input: unknown },
    adviesState: Ref,
  ) => {
    runAdvies: () => void;
    selectieResultaat: () => Ref;
    berekenRouteVoorDoel: (doel: number, base?: unknown) => Ref;
    candidates: (x: unknown, K: unknown, N: unknown, uit: unknown, alles: boolean) => Ref[];
  };
};

// De oude code gebruikt new Date() voor de geldigheid van het label én voor een nieuw label
const PEIL = new Date("2026-10-14T12:00:00Z");
const VANDAAG = "2026-10-14";
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PEIL);
});
afterAll(() => vi.useRealTimers());

const N = DEFAULT_NORMEN as unknown as Normen;

/** Vergelijkbare vorm: zonder invoer (normalisatie verschilt bewust) en zonder functies */
function vorm(x: unknown): unknown {
  const { input: _input, ...rest } = x as Ref;
  return JSON.parse(JSON.stringify(rest));
}

/** Extra variatie bovenop de fase-1-generator (eigen reeks, zodat die reeks gelijk blijft) */
function verrijk(seed: number, inp: WwsInput): WwsInput {
  const R = rng(seed + 1_000_003);
  const kans = (p: number) => R() < p;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  // echte maten bij sommige vertrekken (de extra-toiletmaatregel haalt dan 1,20 m van de maten af)
  for (const r of inp.vertrekken)
    if (kans(0.3)) r.maten = [{ l: String(int(2, 6)) + ",00", b: String(int(2, 5)) + ",50" }];
  // geüpload verduurzamingsadvies bij een label
  const i = (LABELS as readonly string[]).indexOf(inp.energie.label);
  if ((inp.energie.soort === "label" || inp.energie.soort === "labelOud") && i > 0 && kans(0.35)) {
    const maatregelen = Array.from({ length: int(1, 3) }, () => {
      const naar = LABELS[Math.max(0, i - int(1, 4))]!;
      const min = kans(0.2) ? "" : int(2, 40) * 1000;
      return {
        vanLabel: kans(0.85) ? inp.energie.label : "B",
        naarLabel: kans(0.9) ? naar : "Z",
        omschrijving: kans(0.8) ? ["Spouwmuurisolatie", "HR++ glas"].slice(0, int(0, 2)) : [],
        kostenMin: min,
        kostenMax: min === "" ? "" : Number(min) + int(0, 10) * 1000,
        besparingMin: int(0, 900),
        besparingMax: int(900, 2000),
      };
    });
    inp.energieAdvies = { bestand: "advies.pdf", geuploadOp: "2026-10-01T10:00:00Z", maatregelen };
  }
  return inp;
}

function instellingen(seed: number, eerste: Ref[]): AdviesInstellingen {
  const R = rng(seed + 2_000_003);
  const kans = (p: number) => R() < p;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const kosten = { ...(DEFAULT_NORMEN.kosten as unknown as Kosten) };
  if (kans(0.3))
    for (const k of Object.keys(kosten) as (keyof Kosten)[])
      if (kans(0.4)) kosten[k] = k === "balkonM2" ? int(2, 12) : int(0, 20) * 500;
  const uit: AdviesInstellingen["uit"] = kans(0.7) ? { laadpaal: true } : {};
  for (const m of MAATREGELEN) if (kans(0.1)) uit[m.key] = true;
  const forced: string[] = [];
  if (eerste.length && kans(0.35))
    for (let n = int(1, 2); n > 0; n--) {
      const c = eerste[int(0, eerste.length - 1)]!;
      forced.push(c["key"] + "|" + c["o"]);
    }
  if (kans(0.05)) forced.push("label|bestaat niet");
  return {
    kosten,
    uit,
    marge: kans(0.5) ? 0 : int(1, 20),
    labelsprong: kans(0.3),
    lastig: kans(0.3),
    forced,
  };
}

function origineel(inp: WwsInput, inst: AdviesInstellingen) {
  const cur = { input: CALC.normalizeInput(CALC.clone(inp)) };
  const state: Ref = { ...CALC.clone(inst), result: null, skip: {} };
  return { A: maakAdvies(CALC.clone(CALC.DEFAULT_NORMEN), cur, state), state };
}

describe("verbeteradvies gelijk aan wws-site.html", () => {
  const AANTAL = 300;
  it(`${AANTAL} willekeurige tellingen: dezelfde route, uitkomsten, selectie en adviesopties`, () => {
    const tel = {
      gehaald: 0,
      nietGehaald: 0,
      nieuwLabel: 0,
      adviesBron: 0,
      toiletRuimte: 0,
      labelsprong: 0,
      forced: 0,
      optie2: 0,
      max: 0,
    };
    for (let seed = 1; seed <= AANTAL; seed++) {
      const inp = verrijk(seed, genereer(seed));
      // zelf te kiezen maatregelen trekken uit de originele "eerste stappen"
      const kale = origineel(inp, { ...instellingenLeeg(), forced: [] });
      const eerste = kale.A.candidates(
        CALC.normalizeInput(CALC.clone(inp)),
        DEFAULT_NORMEN.kosten,
        CALC.DEFAULT_NORMEN,
        { laadpaal: true },
        true,
      );
      const inst = instellingen(seed, eerste);
      const ctx = () =>
        `seed ${seed}\ninstellingen: ${JSON.stringify(inst)}\ninvoer: ${JSON.stringify(inp)}`;

      // runAdvies
      const { A, state } = origineel(inp, inst);
      A.runAdvies();
      const ref = state["result"] as Ref;
      const ts = berekenAdvies(inp, N, structuredClone(inst), { vandaag: VANDAAG });
      try {
        expect(vorm(ts)).toEqual(vorm(ref));
      } catch (e) {
        throw new Error(`runAdvies verschilt, ${ctx()}\n${(e as Error).message}`);
      }

      // selectieResultaat met willekeurig uitgevinkte stappen
      const R = rng(seed + 3_000_003);
      const skip: Record<number, boolean> = {};
      ts.stappen.forEach((_s, k) => {
        if (R() < 0.3) skip[k] = true;
      });
      state["skip"] = skip;
      const selRef = A.selectieResultaat();
      const selTs = selectieResultaat(inp, N, ts, skip);
      try {
        expect(vorm(selTs)).toEqual(vorm(selRef));
      } catch (e) {
        throw new Error(`selectieResultaat verschilt, ${ctx()}\n${(e as Error).message}`);
      }

      // berekenRouteVoorDoel, zoals makeAdviesVolledigPdf(): optie 1, optie 2 bouwt erop voort
      const margeGewenst = inst.marge > 0 ? inst.marge : 4;
      const doel1 = N.grensMidden + 1;
      const r1Ref = A.berekenRouteVoorDoel(doel1);
      const r1Ts = berekenRoute(inp, N, inst, doel1, undefined, { vandaag: VANDAAG });
      let r2Ref = A.berekenRouteVoorDoel(doel1 + margeGewenst, r1Ref);
      let r2Ts: RouteResultaat = berekenRoute(inp, N, inst, doel1 + margeGewenst, r1Ts, {
        vandaag: VANDAAG,
      });
      if (!r2Ref["gehaald"]) {
        r2Ref = A.berekenRouteVoorDoel(9999, r1Ref);
        r2Ts = berekenRoute(inp, N, inst, 9999, r1Ts, { vandaag: VANDAAG });
      }
      try {
        expect(vorm(r1Ts)).toEqual(vorm(r1Ref));
        expect(vorm(r2Ts)).toEqual(vorm(r2Ref));
      } catch (e) {
        throw new Error(`berekenRouteVoorDoel verschilt, ${ctx()}\n${(e as Error).message}`);
      }

      // welke paden zijn geraakt
      if (ts.start.totaal < ts.doel) {
        if (ts.gehaald) tel.gehaald++;
        else tel.nietGehaald++;
      }
      if (ts.stappen.some((s) => s.o.startsWith("Nieuw energielabel"))) tel.nieuwLabel++;
      if ([...ts.stappen, ...ts.los].some((s) => s.bron === "advies")) tel.adviesBron++;
      if (ts.los.some((s) => s.o.startsWith("Extra toiletruimte"))) tel.toiletRuimte++;
      if (inst.labelsprong && ts.stappen.some((s) => s.key === "label" && s.forced))
        tel.labelsprong++;
      if (inst.forced.length && ts.stappen.some((s) => s.forced)) tel.forced++;
      if (r2Ts.stappen.length > r1Ts.stappen.length) tel.optie2++;
      if (ts.maxHaalbaar > ts.eind.totaal) tel.max++;
    }
    // De steekproef moet de verschillende paden ook echt raken
    for (const [pad, n] of Object.entries(tel))
      expect(n, `pad "${pad}" te weinig geraakt`).toBeGreaterThan(5);
  }, 600_000);
});

function instellingenLeeg(): AdviesInstellingen {
  return {
    kosten: { ...(DEFAULT_NORMEN.kosten as unknown as Kosten) },
    uit: { laadpaal: true },
    marge: 0,
    labelsprong: false,
    lastig: false,
    forced: [],
  };
}
