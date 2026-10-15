// Het samenvattingspaneel naast de telling — renderSum() in wws-site.html: huurlabel,
// segmentbalk met markering en de regel met opslagen. Pure functies; de teksten letterlijk.
import { fmt } from "./basis";
import type { Normen } from "./normen";
import type { Segment } from "./types";

/** Tekst boven het huurbedrag (vrije sector: geen wettelijke maximale huur) */
export const huurLabel = (seg: Segment) =>
  seg === "hoog"
    ? "Huurprijs volgens WWS (vrije sector, geen wettelijke maximale huur)"
    : "Maximale kale huur (huurprijstabel 1 januari 2026)";

/** "Exact 205,5, afgerond op hele punten" */
export const exactTekst = (exact: number) => "Exact " + fmt(exact) + ", afgerond op hele punten";

/** Onder de 40 punten (alleen buiten de vrije sector) */
export const MINDER_DAN_40 = "Minder dan 40 punten: het laagste bedrag uit de tabel.";

export interface SegmentSchaal {
  /** Rechterkant van de balk: minstens 250, anders totaal + 20 */
  max: number;
  /** Breedtes in procenten van de balk */
  laag: number;
  midden: number;
  /** Positie van de markering in procenten (0–100) */
  marker: number;
}

/** De gekleurde segmentbalk — scaleMax en pos() in renderSum() */
export function segmentSchaal(totaal: number, N: Pick<Normen, "grensLaag" | "grensMidden">) {
  const max = Math.max(250, totaal + 20);
  const pos = (x: number) => Math.min(100, Math.max(0, (x / max) * 100));
  return {
    max,
    laag: pos(N.grensLaag),
    midden: pos(N.grensMidden) - pos(N.grensLaag),
    marker: pos(totaal),
  } satisfies SegmentSchaal;
}

/** "10% nieuwbouw + 5% rijksmonument" — opsTxt in renderSum() */
export const opslagTekst = (opslagen: readonly (readonly [string, number])[]) =>
  opslagen.map((o) => o[1] + "% " + o[0].toLowerCase()).join(" + ");
