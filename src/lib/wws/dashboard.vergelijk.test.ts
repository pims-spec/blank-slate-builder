// Vergelijkt het dashboard met de originele berekenDashboard() uit wws-site.html.
// reference/wws-site-dashboard.cjs is een letterlijke uitsnede; tellingen, store en N gaan
// er als parameters in. Willekeurige portefeuilles met versies moeten exact dezelfde cijfers,
// verdelingen, trends en lijsten geven.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { berekenDashboard, type DashboardVersie } from "./dashboard";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import { legeMeta } from "./opslag/doc";
import type { Telling } from "./opslag/types";
import { genereer, rng } from "./testdata";

const require = createRequire(import.meta.url);
const CALC = require("../../../reference/wws-site-calc.cjs") as {
  DEFAULT_NORMEN: unknown;
  clone: <T>(o: T) => T;
};
const { maakDashboard } = require("../../../reference/wws-site-dashboard.cjs") as {
  maakDashboard: (
    tellingen: unknown[],
    store: { alleVersies: () => Promise<unknown[]> },
    N: unknown,
  ) => { berekenDashboard: (klantId?: string) => Promise<unknown> };
};

const PEIL = new Date("2026-10-14T12:00:00Z");
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PEIL);
});
afterAll(() => vi.useRealTimers());

const N = DEFAULT_NORMEN as unknown as Normen;
const SEGS = ["laag", "midden", "hoog"] as const;

function portefeuille(seed: number) {
  const R = rng(seed + 7_000_003);
  const kies = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const kans = (p: number) => R() < p;
  const datum = () =>
    `${int(2024, 2026)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}T${String(int(0, 23)).padStart(2, "0")}:00:00Z`;

  const tellingen: Telling[] = [];
  const versies: DashboardVersie[] = [];
  const n = int(0, 25);
  for (let j = 0; j < n; j++) {
    const id = "t" + j;
    const input = genereer(seed * 100 + j);
    tellingen.push({
      id,
      ownerId: kies(["u1", "u2", "u3", ""]),
      ownerNaam: null,
      gewijzigdOp: datum(),
      meta: { ...legeMeta(), naam: "T" + j, klantId: kies(["k1", "k2", ""]) },
      input,
      versieCount: 0,
      aantalVersies: 0,
      basedOn: null,
      createdAt: "",
      updatedAt: kans(0.1) ? "" : datum(),
      laatstePunten: kans(0.3) ? null : int(40, 250),
      lastEditedBy: null,
    });
    for (let nr = 1, k = int(0, 4); nr <= k; nr++)
      versies.push({
        tellingId: id,
        nr,
        createdAt: kans(0.05) ? "geen datum" : kans(0.05) ? undefined : datum(),
        resultaat: kans(0.08)
          ? undefined
          : {
              totaal: kans(0.05) ? null : int(40, 250),
              maxHuur: kans(0.1) ? null : int(400, 2500) + 0.5,
              seg: kies(SEGS),
            },
      });
  }
  // de bron haalt de versies op volgorde van nr op (over alle tellingen)
  versies.sort((a, b) => a.nr - b.nr);
  return { tellingen, versies, klantId: kies(["", "", "k1", "k2"]) };
}

describe("dashboard gelijk aan wws-site.html", () => {
  const AANTAL = 300;
  it(`${AANTAL} willekeurige portefeuilles geven exact dezelfde cijfers`, async () => {
    const tel = {
      behaald: 0,
      opgeschoven: 0,
      potentieel: 0,
      labels: 0,
      trend: 0,
      filter: 0,
      collegas: 0,
    };
    for (let seed = 1; seed <= AANTAL; seed++) {
      const { tellingen, versies, klantId } = portefeuille(seed);
      const ref = await maakDashboard(
        CALC.clone(tellingen),
        { alleVersies: async () => CALC.clone(versies) },
        CALC.clone(CALC.DEFAULT_NORMEN),
      ).berekenDashboard(klantId);
      const ts = berekenDashboard(structuredClone(tellingen), structuredClone(versies), N, {
        klantId,
        vandaag: new Date(),
      });
      try {
        expect(ts).toEqual(ref);
      } catch (e) {
        throw new Error(`Verschil bij seed ${seed} (klant '${klantId}'):\n${(e as Error).message}`);
      }
      if (ts.behaaldAantal) tel.behaald++;
      if (ts.opgeschoven) tel.opgeschoven++;
      if (ts.potentieelAantal) tel.potentieel++;
      if (ts.labelSignalen.length) tel.labels++;
      if (ts.trend.length >= 2) tel.trend++;
      if (klantId && ts.totaal < tellingen.length) tel.filter++;
      if (ts.perCollega.length > 1) tel.collegas++;
    }
    for (const [pad, n] of Object.entries(tel))
      expect(n, `pad "${pad}" te weinig geraakt`).toBeGreaterThan(10);
  }, 300_000);
});
