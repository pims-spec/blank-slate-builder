import { useSyncExternalStore } from "react";

// Keuzes voor de PDF van een portefeuille-analyse: de verduurzamingsraming en de EFG-regels wel
// of niet opnemen. Een gemak per gebruiker, dus alleen in de eigen browser bewaard
// (localStorage). Lukt bewaren of lezen niet (privévenster), dan geldt de standaard: wel
// opnemen, zoals voorheen.
export type PdfKeuze = "raming" | "efg";

const SLEUTEL: Record<PdfKeuze, string> = {
  raming: "gohome:pdf-raming",
  efg: "gohome:pdf-efg",
};
const luisteraars = new Set<() => void>();
const huidig: Partial<Record<PdfKeuze, boolean>> = {};

function lees(k: PdfKeuze): boolean {
  try {
    return localStorage.getItem(SLEUTEL[k]) !== "nee";
  } catch {
    return true;
  }
}

/** De huidige keuze; ook buiten React te lezen (bv. bij de PDF-knop in het archief) */
export function inPdf(k: PdfKeuze): boolean {
  huidig[k] ??= lees(k);
  return huidig[k];
}

export function zetInPdf(k: PdfKeuze, aan: boolean) {
  huidig[k] = aan;
  try {
    localStorage.setItem(SLEUTEL[k], aan ? "ja" : "nee");
  } catch {
    // niet bewaard; de keuze geldt dan alleen tot de pagina herlaadt
  }
  luisteraars.forEach((f) => f());
}

/** De opties voor maakPortefeuillePdf */
export const pdfOpties = () => ({ metRaming: inPdf("raming"), metEfg: inPdf("efg") });

/** Alleen voor tests: opnieuw uit de opslag lezen */
export function vergeetPdfKeuzes() {
  delete huidig.raming;
  delete huidig.efg;
}

export function useInPdf(k: PdfKeuze): [boolean, (aan: boolean) => void] {
  const aan = useSyncExternalStore(
    (f) => {
      luisteraars.add(f);
      return () => luisteraars.delete(f);
    },
    () => inPdf(k),
    () => true,
  );
  return [aan, (a: boolean) => zetInPdf(k, a)];
}
