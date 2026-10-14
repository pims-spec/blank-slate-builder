// Dashboard: portefeuille-overzicht — overgezet uit berekenDashboard() in wws-site.html.
// dashboard.vergelijk.test.ts vergelijkt de uitkomst met de originele code.
//
// Tellingen worden live herberekend met de huidige normen; van de versies gebruikt de bron
// alleen het opgeslagen resultaat (totaal, maxHuur, segment), nr en createdAt.
import { LABELS } from "./basis";
import { calc, huurVoorPunten } from "./calc";
import type { Normen } from "./normen";
import type { Telling } from "./opslag/types";
import type { Segment } from "./types";

const SEGRANG: Record<Segment, number> = { laag: 0, midden: 1, hoog: 2 };
const MAANDNAMEN = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

/** Wat het dashboard van een versie gebruikt */
export interface DashboardVersie {
  tellingId: string;
  nr: number;
  createdAt?: string | null | undefined;
  resultaat?:
    { totaal?: number | null; maxHuur?: number | null; seg?: Segment | null } | null | undefined;
}

export interface DashboardRij {
  t: Telling;
  totaal: number | null;
  maxHuur: number | null;
  seg: Segment | null;
  /** Alleen bij "net onder de grens": punten tot de vrije sector */
  nodig?: number;
  /** Alleen bij "net onder de grens": huurstijging per maand bij de grens */
  winst?: number | null;
}

export interface LabelSignaal {
  t: Telling;
  vervalt: Date;
  dagenTot: number;
}

export interface Dashboard {
  totaal: number;
  gemPunten: number | null;
  grensLaag: number;
  grensMidden: number;
  /** Punten onder de grens die als "net onder de grens" tellen */
  marge: number;
  segLaag: DashboardRij[];
  segMidden: DashboardRij[];
  segHoog: DashboardRij[];
  nabijGrens: DashboardRij[];
  vrijeSector: DashboardRij[];
  labelSignalen: LabelSignaal[];
  behaaldTotaal: number;
  behaaldAantal: number;
  opgeschoven: number;
  potentieelTotaal: number;
  potentieelAantal: number;
  alleTotalen: number[];
  trend: { key: string; label: string; gem: number }[];
  labelCounts: { label: string; n: number }[];
  perCollega: { ownerId: string; aantal: number; gemPunten: number | null }[];
  recent: Telling[];
}

export interface DashboardOpties {
  /** Alleen tellingen van deze eigenaar (meta.klantId); leeg = alle */
  klantId?: string;
  vandaag?: Date;
}

export function berekenDashboard(
  tellingen: readonly Telling[],
  versies: readonly DashboardVersie[],
  N: Normen,
  opties: DashboardOpties = {},
): Dashboard {
  const klantId = opties.klantId ?? "";
  const lijst = tellingen.filter((t) => !klantId || (t.meta && t.meta.klantId === klantId));
  // Live herberekenen met de huidige normen
  const resultaten: DashboardRij[] = lijst.map((t) => {
    try {
      const R = calc(t.input, N);
      return { t, totaal: R.totaal, maxHuur: R.maxHuur, seg: R.seg };
    } catch {
      return {
        t,
        totaal: t.laatstePunten != null ? t.laatstePunten : null,
        maxHuur: null,
        seg: null,
      };
    }
  });
  const grensLaag = N.grensLaag,
    grensMidden = N.grensMidden;
  const metPunten = resultaten.filter((r) => r.totaal != null) as (DashboardRij & {
    totaal: number;
  })[];
  const gemPunten = metPunten.length
    ? metPunten.reduce((s, r) => s + r.totaal, 0) / metPunten.length
    : null;
  const segLaag = metPunten.filter((r) => r.seg === "laag");
  const segMidden = metPunten.filter((r) => r.seg === "midden");
  const segHoog = metPunten.filter((r) => r.seg === "hoog");
  const marge = 10;
  const nabijGrens = metPunten.filter(
    (r) => r.totaal <= grensMidden && r.totaal > grensMidden - marge,
  );

  // Energielabels: 10 jaar geldig vanaf de registratiedatum; alleen met bekende datum
  const vandaag = opties.vandaag ?? new Date();
  const labelSignalen = lijst
    .map((t): LabelSignaal | null => {
      const E = t.input && t.input.energie;
      const soort = E && E.soort;
      const datum = E && E.datum;
      if (!datum || (soort !== "label" && soort !== "labelOud" && soort !== "index")) return null;
      const d = new Date(datum);
      if (isNaN(d.getTime())) return null;
      const vervalt = new Date(d);
      vervalt.setFullYear(vervalt.getFullYear() + 10);
      const dagenTot = Math.round((vervalt.getTime() - vandaag.getTime()) / 86400000);
      return { t, vervalt, dagenTot };
    })
    .filter((x): x is LabelSignaal => x !== null)
    .filter((x) => x.dagenTot < 365)
    .sort((a, b) => a.dagenTot - b.dagenTot);

  // Al behaald: eerste vs. laatste versie van elke telling
  let alleVersies = versies.slice();
  if (klantId) {
    const idsInLijst = new Set(lijst.map((t) => t.id));
    alleVersies = alleVersies.filter((v) => idsInLijst.has(v.tellingId));
  }
  const perTelling: Record<string, DashboardVersie[]> = {};
  alleVersies.forEach((v) => {
    (perTelling[v.tellingId] = perTelling[v.tellingId] || []).push(v);
  });
  let behaaldTotaal = 0,
    behaaldAantal = 0,
    opgeschoven = 0;
  Object.keys(perTelling).forEach((tid) => {
    const vs = perTelling[tid]!.slice().sort((a, b) => a.nr - b.nr);
    if (vs.length < 2) return;
    const eerste = vs[0]!,
      laatste = vs[vs.length - 1]!;
    const hE = eerste.resultaat && eerste.resultaat.maxHuur,
      hL = laatste.resultaat && laatste.resultaat.maxHuur;
    if (hE != null && hL != null && hL > hE + 0.01) {
      behaaldTotaal += hL - hE;
      behaaldAantal++;
    }
    const sE = eerste.resultaat && eerste.resultaat.seg,
      sL = laatste.resultaat && laatste.resultaat.seg;
    if (sE && sL && SEGRANG[sL] > SEGRANG[sE]) opgeschoven++;
  });
  const huurBijGrens = huurVoorPunten(grensMidden + 1, N);
  let potentieelTotaal = 0,
    potentieelAantal = 0;
  nabijGrens.forEach((r) => {
    r.nodig = grensMidden + 1 - r.totaal;
    r.winst =
      r.maxHuur != null && huurBijGrens != null && huurBijGrens > r.maxHuur + 0.01
        ? huurBijGrens - r.maxHuur
        : null;
    if (r.winst != null) {
      potentieelTotaal += r.winst;
      potentieelAantal++;
    }
  });

  // Trend: gemiddeld aantal punten per maand, over alle versies
  const trendMap: Record<string, number[]> = {};
  alleVersies.forEach((v) => {
    if (!v.createdAt || !v.resultaat || v.resultaat.totaal == null) return;
    const d = new Date(v.createdAt);
    if (isNaN(d.getTime())) return;
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    (trendMap[key] = trendMap[key] || []).push(v.resultaat.totaal);
  });
  const trend = Object.keys(trendMap)
    .sort()
    .map((key) => {
      const arr = trendMap[key]!;
      const [jaar, maand] = key.split("-") as [string, string];
      return {
        key,
        label: MAANDNAMEN[Number(maand) - 1] + " " + jaar.slice(2),
        gem: arr.reduce((s, x) => s + x, 0) / arr.length,
      };
    });

  // Verdeling naar energielabel (alleen label/labelOud met een bekende klasse)
  const labelCounts = LABELS.map((k) => ({
    label: k,
    n: lijst.filter((t) => {
      const E = t.input && t.input.energie;
      return E && (E.soort === "label" || E.soort === "labelOud") && E.label === k;
    }).length,
  }));

  // Werkverdeling per collega
  const perEigenaar: Record<string, DashboardRij[]> = {};
  resultaten.forEach((r) => {
    (perEigenaar[r.t.ownerId || "_onbekend"] = perEigenaar[r.t.ownerId || "_onbekend"] || []).push(
      r,
    );
  });
  const perCollega = Object.keys(perEigenaar)
    .map((oid) => {
      const rs = perEigenaar[oid]!,
        metP = rs.filter((r) => r.totaal != null);
      return {
        ownerId: oid,
        aantal: rs.length,
        gemPunten: metP.length ? metP.reduce((s, r) => s + r.totaal!, 0) / metP.length : null,
      };
    })
    .sort((a, b) => b.aantal - a.aantal);

  // Recent bijgewerkt
  const recent = lijst
    .slice()
    .filter((t) => t.updatedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  return {
    totaal: lijst.length,
    gemPunten,
    grensLaag,
    grensMidden,
    marge,
    segLaag,
    segMidden,
    segHoog,
    nabijGrens,
    vrijeSector: segHoog,
    labelSignalen,
    behaaldTotaal,
    behaaldAantal,
    opgeschoven,
    potentieelTotaal,
    potentieelAantal,
    alleTotalen: metPunten.map((r) => r.totaal),
    trend,
    labelCounts,
    perCollega,
    recent,
  };
}

/** Puntenverdeling in emmers van 20 punten (minstens tot de grens) — puntenHistogramSvg() */
export function histogram(
  totalen: readonly number[],
  grensMidden: number,
  emmer = 20,
): { van: number; n: number }[] {
  if (!totalen.length) return [];
  const maxVal = Math.max(Math.max(...totalen), grensMidden + emmer);
  const aantal = Math.max(1, Math.ceil((maxVal + 1) / emmer));
  const counts = new Array<number>(aantal).fill(0);
  totalen.forEach((v) => {
    const i = Math.min(aantal - 1, Math.max(0, Math.floor(v / emmer)));
    counts[i]!++;
  });
  return counts.map((n, i) => ({ van: i * emmer, n }));
}
