// Vergelijkt de Excel-export met de originele exporteerArchiefExcel() uit wws-site.html
// (letterlijk in reference/wws-site-pdf.cjs). Beide draaien op dezelfde SheetJS; van beide
// bestanden worden alle celwaarden, celtypes en kolombreedtes vergeleken.
import { createRequire } from "node:module";
import * as XLSX from "xlsx";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { maakArchiefExcel } from "./excel";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import type { Telling } from "./opslag/types";
import { bytesVan, willekeurigeMeta } from "./pdf/testhulp";
import { genereer, rng } from "./testdata";
import { zetBronAfronding } from "./calc";

const require = createRequire(import.meta.url);
const CALC = require("../../../reference/wws-site-calc.cjs") as {
  DEFAULT_NORMEN: unknown;
  clone: <T>(o: T) => T;
};
const { maakPdfBron } = require("../../../reference/wws-site-pdf.cjs") as {
  maakPdfBron: (ctx: Record<string, unknown>) => { exporteerArchiefExcel: () => Promise<void> };
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

async function leesBlad(blob: Blob) {
  const wb = XLSX.read(await bytesVan(blob), { type: "array" });
  expect(wb.SheetNames).toEqual(["Tellingen"]);
  const ws = wb.Sheets["Tellingen"]!;
  const cellen = Object.keys(ws)
    .filter((k) => !k.startsWith("!"))
    .sort()
    .map((k) => [k, ws[k].t, ws[k].v]);
  return { cellen, cols: ws["!cols"]?.map((c) => c.wch), ref: ws["!ref"] };
}

describe("Excel-export gelijk aan wws-site.html", () => {
  it("60 willekeurige archieven: zelfde cellen, types en kolommen", async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const R = rng(seed + 31_000_003);
      const kies = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
      const kans = (p: number) => R() < p;
      const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
      const lijst: Telling[] = Array.from({ length: int(1, 15) }, (_, j) => {
        const input = genereer(seed * 50 + j);
        return {
          id: "t" + j,
          ownerId: kies(["u1", "u2"]),
          ownerNaam: null,
          gewijzigdOp: "2026-05-01T10:00:00Z",
          meta: { ...willekeurigeMeta(seed * 50 + j), klantId: kies(["k1", "k2", "", "weg"]) },
          // soms een onvolledige oude telling: dan de laatst opgeslagen punten
          input: kans(0.1) ? (null as unknown as typeof input) : input,
          versieCount: int(0, 5),
          aantalVersies: kans(0.2) ? (undefined as unknown as number) : int(0, 5),
          basedOn: null,
          createdAt: "",
          updatedAt: kans(0.1) ? "" : `2026-0${int(1, 9)}-1${int(0, 9)}T10:00:00Z`,
          laatstePunten: kans(0.3) ? null : int(40, 250),
          lastEditedBy: kans(0.5) ? { id: "u1", naam: "Pim", email: "p@x" } : null,
        };
      });
      const klanten: Record<string, string> = { k1: "TEST Woonstichting", k2: "TEST B.V." };
      const namen: Record<string, string> = { u1: "Pim", u2: "Onbekende gebruiker" };
      const klantNaam = (id: string) => (id ? (klanten[id] ?? "") : "");

      const nieuw = maakArchiefExcel(XLSX, lijst, N, {
        klantNaam,
        collegaNaam: (t) => namen[t.ownerId]!,
      })!;
      const opgeslagen: { naam: string; blob: Blob }[] = [];
      const toasts: string[] = [];
      await maakPdfBron({
        N: CALC.clone(CALC.DEFAULT_NORMEN),
        XLSX,
        tellingen: CALC.clone(lijst),
        archiefQuery: "",
        archiefMatch: () => true,
        archiefMatchFilters: () => true,
        archiefFilters: {},
        db: true,
        eigenaarNaam: (id: string) => namen[id],
        klantNaam,
        toast: (t: string) => toasts.push(t),
        saveFile: async (naam: string, blob: Blob) => {
          opgeslagen.push({ naam, blob });
        },
      }).exporteerArchiefExcel();

      expect(opgeslagen[0]!.naam).toBe(nieuw.bestandsnaam);
      expect(toasts).toEqual([
        "Export gestart (" + nieuw.aantal + " telling" + (nieuw.aantal === 1 ? "" : "en") + ").",
      ]);
      const [a, b] = await Promise.all([leesBlad(nieuw.blob), leesBlad(opgeslagen[0]!.blob)]);
      try {
        expect(a).toEqual(b);
      } catch (e) {
        throw new Error(`seed ${seed}\n${(e as Error).message}`);
      }
    }
  }, 300_000);

  it("lege lijst: niets te exporteren", () => {
    expect(
      maakArchiefExcel(XLSX, [], N, { klantNaam: () => "", collegaNaam: () => "" }),
    ).toBeNull();
  });
});
