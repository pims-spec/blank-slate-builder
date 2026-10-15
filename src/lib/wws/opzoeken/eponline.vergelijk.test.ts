// Vergelijkt het overnemen van een EP-Online-label met de originele applyEpLabel() (en
// epAdresVelden) uit wws-site.html; reference/wws-site-eponline.cjs is een letterlijke uitsnede.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { legeMeta } from "../opslag/doc";
import { genereer, rng } from "../testdata";
import { epAdresVelden, epToepassen } from "./eponline";

const require = createRequire(import.meta.url);
const { maakEp } = require("../../../../reference/wws-site-eponline.cjs") as {
  maakEp: (
    cur: unknown,
    epState: unknown,
    stubs: Record<string, unknown>,
  ) => {
    epAdresVelden: () => unknown;
    applyEpLabel: () => void;
  };
};

const PEIL = new Date("2026-10-14T12:00:00Z");
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PEIL);
});
afterAll(() => vi.useRealTimers());

const kloon = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** Een willekeurig EP-Online-label, soms met ontbrekende of rare waarden */
function label(seed: number): Record<string, unknown> {
  const R = rng(seed + 11_000_003);
  const kies = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
  const kans = (p: number) => R() < p;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const datum = () =>
    kies([
      `${int(2008, 2026)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}T00:00:00`,
      `${int(2008, 2026)}${String(int(1, 12)).padStart(2, "0")}${String(int(1, 28)).padStart(2, "0")}`,
      "onzin",
      "",
    ]);
  const r: Record<string, unknown> = {};
  if (kans(0.9)) r["Energieklasse"] = kies(["A+++", "A", "B", "C", "D", "G", "EPV", "X", ""]);
  if (kans(0.8)) r["Registratiedatum"] = datum();
  if (kans(0.5)) r["Opnamedatum"] = datum();
  if (kans(0.6)) r["Geldig_tot"] = datum();
  if (kans(0.7)) r["Bouwjaar"] = kans(0.5) ? int(1890, 2025) : kies(["1975", "75", "abcd", ""]);
  if (kans(0.7))
    r["Gebouwtype"] = kies([
      "Tussenwoning",
      "Appartement",
      "Vrijstaande woning",
      "Portiekflat",
      "Kantoor",
      "",
    ]);
  if (kans(0.5))
    r["EnergieIndex"] = kans(0.7) ? Math.round(R() * 300) / 100 : kies(["1,4", "0", ""]);
  return r;
}

describe("EP-Online gelijk aan wws-site.html", () => {
  const AANTAL = 500;
  it(`${AANTAL} willekeurige labels en tellingen: zelfde overname en meldingen`, () => {
    const tel = { label: 0, labelOud: 0, index: 0, bouwjaar: 0, woningtype: 0 };
    for (let seed = 1; seed <= AANTAL; seed++) {
      const input = genereer(seed);
      const meta = { ...legeMeta(), bouwjaar: seed % 3 ? "" : "1960" };
      const r = label(seed);
      const toasts: string[] = [];
      const cur = { input: kloon(input), meta: kloon(meta) };
      maakEp(
        cur,
        { result: kloon(r) },
        {
          toast: (t: string) => toasts.push(t),
          setDirty() {},
          rerenderHuidigScherm() {},
        },
      ).applyEpLabel();
      const ts = epToepassen(input, meta, r, new Date());
      try {
        expect(ts.input).toEqual(cur.input);
        expect(ts.meta).toEqual(cur.meta);
        expect(ts.meldingen).toEqual(toasts);
      } catch (e) {
        throw new Error(`seed ${seed}, label ${JSON.stringify(r)}\n${(e as Error).message}`);
      }
      tel[ts.input.energie.soort as keyof typeof tel]++;
      if (ts.meta["auto"] && (ts.meta["auto"] as Record<string, boolean>)["woningtype"])
        tel.woningtype++;
    }
    for (const [pad, n] of Object.entries(tel)) expect(n, `pad "${pad}"`).toBeGreaterThan(20);
  });

  it("zoekvelden uit postcode en huisnummer, zoals epAdresVelden()", () => {
    for (const [postcode, huisnummer] of [
      ["1234 ab", "12"],
      ["1234AB", "12 A"],
      ["1234AB", "12-2"],
      ["1234AB", "12 bis"],
      ["1234AB", "12a"],
      ["", ""],
      ["1234AB", "geen"],
    ] as const) {
      const cur = { meta: { postcode, huisnummer } };
      const ref = maakEp(cur, {}, {}).epAdresVelden();
      expect(epAdresVelden({ postcode, huisnummer })).toEqual(ref);
    }
  });
});
