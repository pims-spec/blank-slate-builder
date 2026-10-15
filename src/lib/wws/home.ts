// Statistieken op het startscherm — berekenHomeStats() en renderHomeStats() in wws-site.html.
// Alleen de eigen tellingen; een "advies" is een telling met minstens 2 versies waarvan de
// laatste meer punten en/of meer maximale huur oplevert dan de eerste.
import { eur, fmt } from "./basis";
import type { DashboardVersie } from "./dashboard";

export interface HomeStats {
  aantalTellingen: number;
  aantalAdvies: number;
  puntenTotaal: number;
  puntenGem: number | null;
  huurTotaal: number;
  huurGem: number | null;
}

/** Wat van een versie nodig is (zoals het dashboard ze ophaalt) */
type VersieResultaat = Pick<DashboardVersie, "tellingId" | "nr" | "resultaat">;

/** berekenHomeStats(); userId null = alle tellingen (zoals de bron zonder profiel) */
export function berekenHomeStats(
  tellingen: readonly { id: string; ownerId: string }[],
  alleVersies: readonly VersieResultaat[],
  userId: string | null,
): HomeStats {
  const eigen = userId ? tellingen.filter((t) => t.ownerId === userId) : tellingen.slice();
  const out: HomeStats = {
    aantalTellingen: eigen.length,
    aantalAdvies: 0,
    puntenTotaal: 0,
    puntenGem: null,
    huurTotaal: 0,
    huurGem: null,
  };
  if (!eigen.length) return out;
  const idsEigen = new Set(eigen.map((t) => t.id));
  const perTelling: Record<string, VersieResultaat[]> = {};
  alleVersies
    .filter((v) => idsEigen.has(v.tellingId))
    .forEach((v) => {
      (perTelling[v.tellingId] = perTelling[v.tellingId] || []).push(v);
    });
  Object.keys(perTelling).forEach((tid) => {
    const vs = perTelling[tid]!.slice().sort((a, b) => a.nr - b.nr);
    if (vs.length < 2) return;
    const eerste = vs[0]!,
      laatste = vs[vs.length - 1]!;
    const pE = eerste.resultaat && eerste.resultaat.totaal,
      pL = laatste.resultaat && laatste.resultaat.totaal;
    const hE = eerste.resultaat && eerste.resultaat.maxHuur,
      hL = laatste.resultaat && laatste.resultaat.maxHuur;
    const puntenBeter = pE != null && pL != null && pL > pE;
    const huurBeter = hE != null && hL != null && hL > hE + 0.01;
    if (puntenBeter || huurBeter) out.aantalAdvies++;
    if (puntenBeter) out.puntenTotaal += pL - pE;
    if (huurBeter) out.huurTotaal += hL - hE;
  });
  out.puntenGem = out.aantalAdvies ? out.puntenTotaal / out.aantalAdvies : null;
  out.huurGem = out.aantalAdvies ? out.huurTotaal / out.aantalAdvies : null;
  return out;
}

export const ADVIES_UITLEG =
  "Telt een telling mee zodra er minstens 2 versies van zijn opgeslagen en de laatst opgeslagen versie meer punten en/of meer maximale huur oplevert dan de allereerste versie. Deze teller gaat dus omhoog op het moment dat je een verbeterde indeling of energielabel hebt doorgevoerd en als nieuwe versie hebt opgeslagen — niet al bij het openen van 'Advies vrije sector' of 'Indelingsadvies' zelf.";

/** De zes tegels van renderHomeStats(): [getal, label, uitleg?] */
export function homeTegels(S: HomeStats): [string, string, string?][] {
  return [
    [String(S.aantalTellingen), "Gemaakte tellingen"],
    [String(S.aantalAdvies), "Gemaakte adviezen", ADVIES_UITLEG],
    [S.puntenTotaal > 0 ? "+" + fmt(S.puntenTotaal, 0) : "–", "Punten in totaal verhoogd"],
    [S.puntenGem != null ? "+" + fmt(S.puntenGem, 1) : "–", "Gemiddeld verhoogd (punten)"],
    [S.huurTotaal > 0 ? "+" + eur(S.huurTotaal) : "–", "Totale toegevoegde huur"],
    [S.huurGem != null ? "+" + eur(S.huurGem) : "–", "Gemiddeld per advies"],
  ];
}

/** Groet naar het dagdeel — dagdeelGroet() */
export function dagdeelGroet(nu = new Date()): string {
  const u = nu.getHours();
  if (u < 6) return "Goedenacht";
  if (u < 12) return "Goedemorgen";
  if (u < 18) return "Goedemiddag";
  return "Goedenavond";
}
