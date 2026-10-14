// Vergelijkt de TypeScript-rekenkern met de originele calc() uit wws-site.html.
// reference/wws-site-calc.cjs is een letterlijke uitsnede van dat bestand
// (regels 771–1216). Duizenden willekeurige tellingen moeten exact dezelfde
// rubrieken, toelichtingen, waarschuwingen, totalen en huurprijzen opleveren.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calc } from "./calc";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import { BUITEN_SOORTEN, OVERIG_TYPES, VERTREK_TYPES, ensureFac, LABELS } from "./basis";
import type { Fac, OverigeRuimte, Vertrek, WwsInput } from "./types";

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

// ---------- deterministische willekeur ----------
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genereer(seed: number): WwsInput {
  const R = rng(seed);
  const kies = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const kans = (p: number) => R() < p;
  // m² soms als getal, soms als invoer-string met komma, soms leeg
  const m2 = (max: number) => {
    const v = Math.round(R() * max * 100) / 100;
    return kans(0.1) ? "" : kans(0.4) ? String(v).replace(".", ",") : v;
  };
  const cnt = (max: number) => (kans(0.5) ? 0 : int(0, max));

  const vulFac = (f: Fac) => {
    if (f.kind === "keuken") {
      f.keuken.lengte = kies(["<1", "1-2", ">=2"] as const);
      for (const k of [
        "afzuig",
        "kook_ind",
        "kook_kera",
        "kook_gas",
        "koelkast",
        "vriezer",
        "oven",
        "oven_gas",
        "magnetron",
        "vaatwasser",
        "kraan_een",
        "kraan_thermo",
        "kokend",
      ] as const)
        if (kans(0.3)) f.keuken.voorz[k] = true;
      if (kans(0.3)) f.keuken.voorz.kast = String(int(1, 5));
    }
    if (f.kind === "badkamer") {
      const s = f.san;
      s.toiletStaand = cnt(1);
      s.toiletHang = cnt(1);
      s.wastafel = int(0, 2);
      s.meerpers = cnt(1);
      s.douche = cnt(2);
      s.bad = cnt(1);
      s.badDouche = cnt(1);
      s.eisenOk = kans(0.8);
      for (const k of ["bubbel", "afscheiding", "kastruimte"] as const)
        if (kans(0.4)) s.voorz[k] = kans(0.8) ? true : 2;
      for (const k of [
        "handdoekrad",
        "kastje",
        "stopcontact",
        "kraan_een",
        "kraan_thermo",
      ] as const)
        if (kans(0.4)) s.voorz[k] = String(int(1, 6));
    }
    if (f.kind === "slaap_san") {
      f.san.wastafel = cnt(2);
      f.san.meerpers = cnt(1);
      f.san.douche = cnt(1);
      f.san.bad = cnt(1);
      f.san.badDouche = cnt(1);
    }
    if (f.kind === "toilet") {
      f.toilet.toilet = kies(["geen", "staand", "hangend"] as const);
      f.toilet.fontein = kans(0.5);
    }
    if (f.kind === "was") f.was.wastafel = kans(0.5);
  };

  const inp: WwsInput = {
    woningtype: kies(["eengezins", "meergezins"] as const),
    facV: 1,
    vertrekken: Array.from({ length: int(0, 7) }, () => {
      const r: Vertrek = {
        type: kies(VERTREK_TYPES).k,
        naam: kans(0.3) ? "Kamer " + int(1, 9) : "",
        m2: m2(35),
        verwarmd: kans(0.7),
        verkoeld: kans(0.2),
      };
      ensureFac("vertrekken", r, kans(0.5));
      if (r.fac) vulFac(r.fac);
      return r;
    }),
    overig: Array.from({ length: int(0, 6) }, () => {
      const r: OverigeRuimte = {
        type: kies(OVERIG_TYPES).k,
        naam: "",
        m2: m2(15),
        verwarmd: kans(0.3),
      };
      ensureFac("overig", r, kans(0.5));
      if (r.fac) vulFac(r.fac);
      return r;
    }),
    energie: {
      soort: kies(["label", "labelOud", "index", "bouwjaar"] as const),
      label: kans(0.1) ? "" : kies([...LABELS, "EPV"] as const),
      indexKlasse: kans(0.15) ? "" : kans(0.1) ? "EPV" : String(int(0, 8)),
      datum: kans(0.2)
        ? ""
        : `${int(2005, 2026)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
      bouwjaar: kans(0.15) ? "" : int(1900, 2025),
    },
    handicap: { investering: kans(0.85) ? "" : int(0, 20000) },
    buiten: {
      gemAdressen: kans(0.5) ? 1 : int(0, 40),
      ruimten: Array.from({ length: int(0, 3) }, () => ({
        soort: kies(BUITEN_SOORTEN)[0],
        groep: kans(0.75) ? ("priv" as const) : ("gem" as const),
        m2: m2(60),
      })),
    },
    gem: {
      adressen: int(0, 30),
      vertrekken: Array.from({ length: cnt(2) }, () => ({
        type: kies(VERTREK_TYPES).k,
        m2: m2(40),
      })),
      overig: Array.from({ length: cnt(2) }, () => ({ type: kies(OVERIG_TYPES).k, m2: m2(20) })),
      voorzPunten: kans(0.8) ? "" : String(int(0, 12)),
    },
    parkeer: {
      typeI: cnt(2),
      typeII: cnt(2),
      typeIII: cnt(2),
      adressen: int(0, 20),
      laadpalen: cnt(3),
    },
    woz: {
      soort: kies(["woz", "woz", "taxatie", "minimum"] as const),
      waarde: kans(0.1) ? "" : kans(0.3) ? int(400_000, 2_500_000) : int(90_000, 450_000),
      jaar: kies(["2026", "2025", "2024", "2023", "2022"]),
      nieuwbouw1519: kans(0.2),
      kleinCorop: kans(0.15),
    },
    bijz: { zorgwoning: kans(0.15), aanbel: kans(0.3), laadpalen: cnt(2) },
    opslag: {
      keuze: kies(["geen", "geen", "gemprov", "stads", "rijks_voor", "rijks_na"] as const),
      nieuwbouw: kans(0.2),
    },
  };
  return inp;
}

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
