// Vergelijkt de PDF-rapporten met de originele functies uit wws-site.html.
// reference/wws-site-pdf.cjs is een letterlijke uitsnede (makePdf, makeRoutePdf,
// makeAdviesVolledigPdf, makeDashboardPdf en hun bouwstenen). Beide draaien hier op dezelfde,
// actuele jsPDF (de oude code via applyPlugin); van elke PDF wordt per pagina de tekst
// uitgelezen (pdfjs) en vergeleken: zelfde pagina's, cijfers, rubrieken en teksten.
import { createRequire } from "node:module";
import { jsPDF } from "jspdf";
import { applyPlugin, autoTable } from "jspdf-autotable";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { standaardInstellingen, berekenAdvies, type AdviesInstellingen } from "../advies";
import { MAATREGELEN } from "../advies/maatregelen";
import { LABELS } from "../basis";
import { normaliseer } from "../calc";
import { berekenDashboard, type DashboardVersie } from "../dashboard";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { legeMeta } from "../opslag/doc";
import type { Telling } from "../opslag/types";
import { genereer, rng } from "../testdata";
import type { WwsInput } from "../types";
import { maakAdviesPdf, maakDashboardPdf, maakRoutePdf, maakTellingPdf } from "./rapporten";
import { pdfTekst, willekeurigeMeta } from "./testhulp";

const require = createRequire(import.meta.url);
type Ref = Record<string, unknown>;
const CALC = require("../../../../reference/wws-site-calc.cjs") as {
  DEFAULT_NORMEN: Ref;
  normalizeInput: (i: unknown) => Ref;
  clone: <T>(o: T) => T;
};
type Bron = {
  makePdf: (
    meta: unknown,
    input: unknown,
    N: unknown,
    versie: unknown,
    alleenBlob: boolean,
  ) => Promise<Blob>;
  makeRoutePdf: () => Promise<void>;
  makeAdviesVolledigPdf: () => Promise<void>;
  makeDashboardPdf: () => Promise<void>;
};
const { maakPdfBron } = require("../../../../reference/wws-site-pdf.cjs") as {
  maakPdfBron: (ctx: Ref) => Bron;
};
const { maakAdvies } = require("../../../../reference/wws-site-advies.cjs") as {
  maakAdvies: (N: unknown, cur: unknown, state: Ref) => { runAdvies: () => void };
};

applyPlugin(jsPDF);
const LIB = { jsPDF, autoTable };
const N = DEFAULT_NORMEN as unknown as Normen;

const PEIL = new Date("2026-10-14T12:00:00Z");
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PEIL);
});
afterAll(() => vi.useRealTimers());

/** De oude code, met een saveFile die de blob opvangt */
function bron(ctx: Ref) {
  const opgeslagen: { naam: string; blob: Blob }[] = [];
  const toasts: string[] = [];
  const b = maakPdfBron({
    N: CALC.clone(CALC.DEFAULT_NORMEN),
    jsPDF,
    toast: (t: string) => toasts.push(t),
    saveFile: async (naam: string, blob: Blob) => {
      opgeslagen.push({ naam, blob });
    },
    ...ctx,
  });
  return { b, opgeslagen, toasts };
}

async function vergelijkTekst(nieuw: Blob, oud: Blob, wat: string) {
  const [a, b] = await Promise.all([pdfTekst(nieuw), pdfTekst(oud)]);
  try {
    expect(a.length).toBe(b.length);
    a.forEach((p, i) => expect(p, `pagina ${i + 1}`).toEqual(b[i]));
  } catch (e) {
    throw new Error(`${wat}\n${(e as Error).message}`);
  }
  return a;
}

/** Extra variatie: maten, verduurzamingsadvies (met huidige status) en WOZ-cap-gevallen */
function verrijk(seed: number, inp: WwsInput): WwsInput {
  const R = rng(seed + 17_000_003);
  const kans = (p: number) => R() < p;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  for (const r of inp.vertrekken)
    if (kans(0.3)) r.maten = [{ l: String(int(2, 6)) + ",00", b: String(int(2, 5)) + ",50" }];
  const i = (LABELS as readonly string[]).indexOf(inp.energie.label);
  if ((inp.energie.soort === "label" || inp.energie.soort === "labelOud") && i > 0 && kans(0.35)) {
    const ea = {
      bestand: "advies.pdf",
      huidig: kans(0.7)
        ? {
            label: inp.energie.label,
            woningtype: "Tussenwoning",
            bouwjaar: int(1930, 2000),
            oppervlakte_m2: int(40, 140) + 0.5,
            installaties: { verwarming: "HR-ketel", pv: kans(0.5) ? "6 panelen" : "" },
            isolatie: { muur: "Spouw – nageïsoleerd", glas: kans(0.5) ? "HR++" : "" },
          }
        : undefined,
      maatregelen: Array.from({ length: int(1, 3) }, () => ({
        vanLabel: inp.energie.label,
        naarLabel: LABELS[Math.max(0, i - int(1, 3))]!,
        omschrijving: ["Spouwmuurisolatie", "HR++ glas in de woonkamer en slaapkamers"].slice(
          0,
          int(0, 2),
        ),
        kostenMin: int(2, 40) * 1000,
        kostenMax: int(40, 60) * 1000,
        besparingMin: int(0, 900),
        besparingMax: int(900, 2000),
      })),
    };
    inp.energieAdvies = ea as unknown as NonNullable<WwsInput["energieAdvies"]>;
  }
  return inp;
}

function instellingen(seed: number): AdviesInstellingen {
  const R = rng(seed + 19_000_003);
  const kans = (p: number) => R() < p;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const inst = standaardInstellingen(N);
  for (const m of MAATREGELEN) if (kans(0.1)) inst.uit[m.key] = true;
  return { ...inst, marge: kans(0.5) ? 0 : int(1, 20), labelsprong: kans(0.3), lastig: kans(0.3) };
}

describe("PDF's gelijk aan wws-site.html", () => {
  it("puntentelling (makePdf): 120 willekeurige tellingen, werkversie en vastgelegde versies", async () => {
    let metVersie = 0,
      metCap = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const input = normaliseer(verrijk(seed, genereer(seed)));
      const meta = willekeurigeMeta(seed);
      const versie =
        seed % 3 === 0
          ? {
              nr: seed,
              createdAt: "2026-03-04T10:15:00Z",
              notitie: seed % 2 ? "Na renovatie – keuken vernieuwd" : "",
            }
          : null;
      const nieuw = maakTellingPdf(LIB, { meta, input, normen: N, versie });
      const { b } = bron({});
      const oud = await b.makePdf(
        CALC.clone(meta),
        CALC.clone(input),
        CALC.clone(CALC.DEFAULT_NORMEN),
        versie,
        true,
      );
      const tekst = await vergelijkTekst(nieuw.blob, oud, `makePdf, seed ${seed}`);
      if (versie) metVersie++;
      if (tekst.flat().some((t) => t.includes("WOZ-cap is actief"))) metCap++;
    }
    expect(metVersie).toBeGreaterThan(20);
    expect(metCap, "WOZ-cap-melding geraakt").toBeGreaterThan(0);
  }, 300_000);

  it("route naar de vrije sector (makeRoutePdf): 40 willekeurige adviezen met uitgevinkte stappen", async () => {
    let metLabel = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const input = normaliseer(verrijk(seed, genereer(seed)));
      const meta = willekeurigeMeta(seed);
      const inst = instellingen(seed);
      const A = berekenAdvies(input, N, structuredClone(inst));
      const R = rng(seed + 23_000_003);
      const overslaan: Record<number, boolean> = {};
      A.stappen.forEach((_s, k) => {
        if (R() < 0.3) overslaan[k] = true;
      });
      const nieuw = maakRoutePdf(LIB, { meta, input, normen: N, advies: A, overslaan });

      const cur = { meta: CALC.clone(meta), input: CALC.normalizeInput(CALC.clone(input)) };
      const state: Ref = { ...CALC.clone(inst), result: null, skip: overslaan };
      maakAdvies(CALC.clone(CALC.DEFAULT_NORMEN), cur, state).runAdvies();
      const { b, opgeslagen } = bron({ cur, adviesState: state });
      await b.makeRoutePdf();
      expect(opgeslagen[0]!.naam).toBe(nieuw.bestandsnaam);
      const tekst = await vergelijkTekst(
        nieuw.blob,
        opgeslagen[0]!.blob,
        `makeRoutePdf, seed ${seed}`,
      );
      if (tekst.flat().some((t) => t.startsWith("Van "))) metLabel++;
    }
    expect(metLabel, "energiekaart in de route geraakt").toBeGreaterThan(0);
  }, 300_000);

  it("volledig adviesrapport (makeAdviesVolledigPdf): 30 willekeurige tellingen", async () => {
    let metAdvies = 0,
      maxRoute = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const input = normaliseer(verrijk(seed + 500, genereer(seed + 500)));
      const meta = willekeurigeMeta(seed);
      const inst = instellingen(seed);
      const nieuw = maakAdviesPdf(LIB, { meta, input, normen: N, inst: structuredClone(inst) });
      const cur = { meta: CALC.clone(meta), input: CALC.normalizeInput(CALC.clone(input)) };
      const state: Ref = { ...CALC.clone(inst), result: { stappen: [] }, skip: {} };
      const { b, opgeslagen } = bron({ cur, adviesState: state });
      await b.makeAdviesVolledigPdf();
      expect(opgeslagen[0]!.naam).toBe(nieuw.bestandsnaam);
      const tekst = await vergelijkTekst(
        nieuw.blob,
        opgeslagen[0]!.blob,
        `makeAdviesVolledigPdf, seed ${seed}`,
      );
      if (input.energieAdvies) metAdvies++;
      if (tekst.flat().includes("Optie 2: maximaal haalbare route")) maxRoute++;
    }
    expect(metAdvies, "verduurzamingspagina geraakt").toBeGreaterThan(0);
    expect(maxRoute, "maximaal haalbare route geraakt").toBeGreaterThan(0);
  }, 300_000);

  it("dashboard (makeDashboardPdf): 40 willekeurige portefeuilles, met en zonder eigenaar", async () => {
    let geraakt = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const R = rng(seed + 29_000_003);
      const kies = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
      const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
      const tellingen: Telling[] = [];
      const versies: DashboardVersie[] = [];
      for (let j = 0, n = int(0, 20); j < n; j++) {
        const id = "t" + j;
        tellingen.push({
          id,
          ownerId: kies(["u1", "u2", "u3"]),
          ownerNaam: null,
          gewijzigdOp: "2026-05-01T10:00:00Z",
          meta: {
            ...legeMeta(),
            naam: kies(["", "TEST T" + j]),
            adres: "Damrak",
            huisnummer: String(j + 1),
            klantId: kies(["k1", "k2", ""]),
          },
          input: genereer(seed * 100 + j),
          versieCount: 0,
          aantalVersies: 0,
          basedOn: null,
          createdAt: "",
          updatedAt: `2026-0${int(1, 9)}-1${int(0, 9)}T10:00:00Z`,
          laatstePunten: null,
          lastEditedBy: null,
        });
        for (let nr = 1, k = int(0, 3); nr <= k; nr++)
          versies.push({
            tellingId: id,
            nr,
            createdAt: `2025-0${int(1, 9)}-1${int(0, 9)}T10:00:00Z`,
            resultaat: {
              totaal: int(40, 250),
              maxHuur: int(400, 2500),
              seg: kies(["laag", "midden", "hoog"] as const),
            },
          });
      }
      versies.sort((a, b) => a.nr - b.nr);
      const klantId = kies(["", "", "k1"]);
      const isAdmin = seed % 2 === 0;
      const namen: Record<string, string> = {
        u1: "Pim",
        u2: "Collega Één",
        u3: "Onbekende gebruiker",
      };
      const klanten: Record<string, string> = { k1: "TEST Woonstichting – Noord", k2: "TEST B.V." };

      const S = berekenDashboard(structuredClone(tellingen), structuredClone(versies), N, {
        klantId,
        vandaag: new Date(),
      });
      const nieuw = maakDashboardPdf(LIB, {
        S,
        normen: N,
        klantId,
        klantNaam: klanten[klantId] ?? "",
        isAdmin,
        eigenaarNaam: (id) => namen[id] ?? "Onbekende gebruiker",
      });
      const { b, opgeslagen, toasts } = bron({
        tellingen: CALC.clone(tellingen),
        store: { alleVersies: async () => CALC.clone(versies) },
        dashboardKlantFilter: klantId,
        db: true,
        profile: { id: "x", role: isAdmin ? "admin" : "member" },
        klantNaam: (id: string) => klanten[id] ?? "",
        eigenaarNaam: (id: string) => namen[id] ?? "Onbekende gebruiker",
      });
      await b.makeDashboardPdf();
      if (!nieuw) {
        expect(opgeslagen).toHaveLength(0);
        expect(toasts[0]).toMatch(/Niets om te exporteren/);
        continue;
      }
      geraakt++;
      expect(opgeslagen[0]!.naam).toBe(nieuw.bestandsnaam);
      await vergelijkTekst(nieuw.blob, opgeslagen[0]!.blob, `makeDashboardPdf, seed ${seed}`);
    }
    expect(geraakt).toBeGreaterThan(20);
  }, 300_000);
});
