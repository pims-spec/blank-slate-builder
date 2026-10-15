// Versies vergelijken — vlakAf(), weergaveWaarde(), diffVersies() en versieKeuzeLabel() uit
// wws-site.html (letterlijk overgezet), plus het verschil per rubriek (niet in de bron: die toont
// alleen totaal, maximale huur, segment en de gewijzigde invoervelden).
import { calc } from "./calc";
import type { Normen } from "./normen";
import type { Versie } from "./opslag/types";
import type { Rij, Segment, WwsInput } from "./types";

type Plat = Record<string, unknown>;

/** Een object platslaan tot paden als "vertrekken[0].m2" — vlakAf() */
export function vlakAf(obj: unknown, prefix: string, out: Plat): void {
  if (obj == null || typeof obj !== "object") {
    out[prefix] = obj;
    return;
  }
  if (Array.isArray(obj)) {
    if (!obj.length) {
      out[prefix] = "(leeg)";
      return;
    }
    obj.forEach((v, i) => vlakAf(v, prefix + "[" + i + "]", out));
    return;
  }
  const keys = Object.keys(obj);
  if (!keys.length) {
    out[prefix] = "(leeg)";
    return;
  }
  keys.forEach((k) => vlakAf((obj as Plat)[k], prefix ? prefix + "." + k : k, out));
}

export function weergaveWaarde(v: unknown): string {
  if (v == null || v === "") return "(leeg)";
  if (typeof v === "boolean") return v ? "ja" : "nee";
  return String(v);
}

export interface VeldVerschil {
  pad: string;
  van: string;
  naar: string;
}

/** De gewijzigde invoervelden tussen twee invoeren, op pad gesorteerd — diffVersies() */
export function diffInvoer(a: WwsInput | undefined, b: WwsInput | undefined): VeldVerschil[] {
  const flatA: Plat = {},
    flatB: Plat = {};
  vlakAf(a, "", flatA);
  vlakAf(b, "", flatB);
  const keys = new Set(Object.keys(flatA).concat(Object.keys(flatB)));
  const verschillen: VeldVerschil[] = [];
  keys.forEach((pad) => {
    const av = weergaveWaarde(flatA[pad]),
      bv = weergaveWaarde(flatB[pad]);
    if (av !== bv) verschillen.push({ pad, van: av, naar: bv });
  });
  verschillen.sort((x, y) => x.pad.localeCompare(y.pad, "nl"));
  return verschillen;
}

/** "v2 — Na renovatie" of "v2 — 4 mrt 2026" — versieKeuzeLabel() */
export const versieKeuzeLabel = (v: Pick<Versie, "nr" | "notitie" | "createdAt">) =>
  "v" +
  v.nr +
  " — " +
  (v.notitie ||
    new Date(v.createdAt).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }));

/** Iets om te vergelijken: een vastgelegde versie of de werkversie */
export interface Vergelijkbaar {
  sleutel: string;
  label: string;
  input: WwsInput;
  totaal: number | null;
  maxHuur: number | null;
  seg: Segment | null;
  rows: Rij[];
}

export function uitVersie(v: Versie): Vergelijkbaar {
  return {
    sleutel: "v" + v.nr,
    label: versieKeuzeLabel(v),
    input: v.input,
    totaal: v.resultaat.totaal ?? null,
    maxHuur: v.resultaat.maxHuur ?? null,
    seg: v.resultaat.seg ?? null,
    rows: v.resultaat.rows ?? [],
  };
}

/** De werkversie, live berekend met de huidige normen */
export function uitWerkversie(input: WwsInput, N: Normen): Vergelijkbaar {
  const R = calc(input, N);
  return {
    sleutel: "werk",
    label: "Werkversie (niet vastgelegd)",
    input,
    totaal: R.totaal,
    maxHuur: R.maxHuur,
    seg: R.seg,
    rows: R.rows,
  };
}

export interface RubriekVerschil {
  nr: number;
  naam: string;
  a: number;
  b: number;
  verschil: number;
}

/** Punten per rubriek in A en B (zelfde volgorde als de rubrieken), met het verschil */
export function rubriekVerschillen(a: readonly Rij[], b: readonly Rij[]): RubriekVerschil[] {
  const per = new Map<number, RubriekVerschil>();
  const tel = (rows: readonly Rij[], kant: "a" | "b") =>
    rows.forEach((r) => {
      const x = per.get(r.nr) ?? { nr: r.nr, naam: r.naam, a: 0, b: 0, verschil: 0 };
      x[kant] += r.p;
      per.set(r.nr, x);
    });
  tel(a, "a");
  tel(b, "b");
  return [...per.values()]
    .map((x) => ({ ...x, verschil: Math.round((x.b - x.a) * 100) / 100 }))
    .sort((x, y) => x.nr - y.nr);
}
