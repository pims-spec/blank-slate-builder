// Vergelijkt de PvE-logica met de originele code uit wws-site.html.
// reference/wws-site-pve.cjs is een letterlijke uitsnede (pveActief, klantActievePves,
// normalizeKlantPves, facIsOnbewerkt, pasPveOpFac, pasKlantPveToe, pasPveOpNieuweRuimte);
// de globals cur, klanten, setDirty en uid gaan er als parameters in.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { VERTREK_TYPES, OVERIG_TYPES, ensureFac, facDefault, facKind } from "./basis";
import { normaliseer } from "./calc";
import {
  actievePves,
  normaliseerPves,
  pasPveOpFac,
  pasPveToe,
  pveActief,
  pveVoorTelling,
  type Pve,
} from "./pve";
import { genereer, rng, zonderLegeStandaard } from "./testdata";
import type { WwsInput } from "./types";

const require = createRequire(import.meta.url);
type Ref = Record<string, unknown>;
const { maakPve } = require("../../../reference/wws-site-pve.cjs") as {
  maakPve: (
    cur: unknown,
    klanten: unknown[],
    setDirty: () => void,
    uid: () => string,
  ) => {
    pveActief: (p: unknown) => boolean;
    klantActievePves: (k: unknown) => unknown[];
    normalizeKlantPves: (k: unknown) => { pves: unknown[] };
    pasKlantPveToe: (p: unknown) => { aangepast: number; overgeslagen: number };
    pasPveOpNieuweRuimte: (key: string, i: number) => void;
  };
};

const teller = () => {
  let n = 0;
  return () => "id" + ++n;
};
const kloon = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** Willekeurige invoer, met een deel van de ruimten terug op de standaardwaarden (onbewerkt) */
function invoer(seed: number): WwsInput {
  const R = rng(seed + 4_000_003);
  const x = zonderLegeStandaard(normaliseer(genereer(seed)));
  for (const r of [...x.vertrekken, ...x.overig])
    if (r.fac && R() < 0.5) r.fac = facDefault(r.fac.kind, false);
  return x;
}

/** Willekeurig PvE, soms in een oude vorm (los object, zonder id of naam) */
function willekeurigPve(R: () => number, i: number): unknown {
  const kans = (p: number) => R() < p;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const p: Ref = {
    keuken: {
      actief: kans(0.6),
      keuken: {
        lengte: (["<1", "1-2", ">=2"] as const)[int(0, 2)],
        voorz: kans(0.5) ? { afzuig: true, koelkast: true, kast: String(int(1, 3)) } : {},
      },
    },
    badkamer: {
      actief: kans(0.6),
      san: {
        toiletStaand: int(0, 1),
        toiletHang: int(0, 1),
        wastafel: int(0, 2),
        meerpers: 0,
        douche: int(0, 1),
        bad: int(0, 1),
        badDouche: 0,
        eisenOk: kans(0.8),
        voorz: kans(0.5) ? { handdoekrad: "1", afscheiding: true } : {},
      },
    },
    toilet: {
      actief: kans(0.6),
      toilet: { toilet: (["geen", "staand", "hangend"] as const)[int(0, 2)], fontein: kans(0.5) },
    },
    indeling: { apartToilet: "nee", slaapkamers: "3" },
  };
  if (kans(0.8)) p["id"] = "p" + i;
  if (kans(0.8)) p["naam"] = "PvE " + i;
  if (kans(0.1)) delete p["keuken"];
  return p;
}

function pveData(seed: number): unknown {
  const R = rng(seed + 5_000_003);
  const r = R();
  if (r < 0.1) return null;
  if (r < 0.2) return willekeurigPve(R, 0); // oud: één los object
  if (r < 0.25) return { iets: "anders" }; // geen PvE
  return Array.from({ length: 1 + Math.floor(R() * 3) }, (_, i) => willekeurigPve(R, i));
}

describe("PvE gelijk aan wws-site.html", () => {
  const AANTAL = 600;
  it(`${AANTAL} willekeurige tellingen en PvE's: zelfde PvE-lijst, toepassing en stil aanvullen`, () => {
    const tel = { aangepast: 0, overgeslagen: 0, stil: 0, oudeVorm: 0 };
    for (let seed = 1; seed <= AANTAL; seed++) {
      const ctx = () => `seed ${seed}`;
      const raw = pveData(seed);
      // normalizeKlantPves
      const ref = maakPve(null, [], () => {}, teller());
      const pvesRef = ref.normalizeKlantPves({ id: "k", naam: "K", pve: kloon(raw) }).pves;
      const pves = normaliseerPves(kloon(raw), teller());
      expect(pves, ctx()).toEqual(pvesRef);
      if (raw && !Array.isArray(raw)) tel.oudeVorm++;
      expect(actievePves(pves), ctx()).toEqual(ref.klantActievePves({ pves: pvesRef }) as Pve[]);
      for (const p of pves) expect(pveActief(p)).toBe(ref.pveActief(p));

      // pasKlantPveToe op de hele telling, met elk PvE
      const x = invoer(seed);
      for (const p of pves) {
        const cur = { input: kloon(x), meta: {} };
        const r = maakPve(cur, [], () => {}, teller()).pasKlantPveToe(kloon(p));
        const ts = pasPveToe(x, p);
        try {
          expect(ts.input).toEqual(cur.input);
          expect([ts.aangepast, ts.overgeslagen]).toEqual([r.aangepast, r.overgeslagen]);
        } catch (e) {
          throw new Error(`pasKlantPveToe verschilt, ${ctx()}\n${(e as Error).message}`);
        }
        tel.aangepast += ts.aangepast;
        tel.overgeslagen += ts.overgeslagen;
      }

      // stil aanvullen na het wijzigen van het type van een ruimte
      const R = rng(seed + 6_000_003);
      const groep = R() < 0.5 ? "vertrekken" : "overig";
      const lijst = x[groep];
      if (!lijst.length) continue;
      const i = Math.floor(R() * lijst.length);
      const types = (groep === "vertrekken" ? VERTREK_TYPES : OVERIG_TYPES).map((t) => t.k);
      const y = kloon(x);
      const row = y[groep][i]!;
      row.type = types[Math.floor(R() * types.length)] as never;
      ensureFac(groep, row, false);
      if (!facKind(groep, row.type)) continue;
      const keuze = R();
      const pveId = keuze < 0.5 && pves.length ? pves[0]!.id : keuze < 0.7 ? "weg" : "";
      const cur = { input: kloon(y), meta: { klantId: "k", pveId } };
      maakPve(cur, [{ id: "k", pves: kloon(pves) }], () => {}, teller()).pasPveOpNieuweRuimte(
        groep,
        i,
      );
      const z = kloon(y);
      const pve = pveVoorTelling(pves, pveId);
      if (pasPveOpFac(z[groep][i]!.fac, pve)) tel.stil++;
      expect(z, `stil aanvullen, ${ctx()}`).toEqual(cur.input);
    }
    for (const [pad, n] of Object.entries(tel))
      expect(n, `pad "${pad}" te weinig geraakt`).toBeGreaterThan(20);
  }, 120_000);
});
