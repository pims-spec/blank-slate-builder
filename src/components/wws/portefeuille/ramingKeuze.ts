import { useSyncExternalStore } from "react";

// Keuze "Verduurzamingsraming in de PDF". Een gemak per gebruiker, dus alleen in de eigen
// browser bewaard (localStorage). Lukt bewaren of lezen niet (privévenster), dan geldt de
// standaard: wel meenemen, zoals voorheen.
const SLEUTEL = "gohome:pdf-raming";
const luisteraars = new Set<() => void>();

function lees(): boolean {
  try {
    return localStorage.getItem(SLEUTEL) !== "nee";
  } catch {
    return true;
  }
}

let huidig: boolean | null = null;

/** De huidige keuze; ook buiten React te lezen (bv. bij de PDF-knop in het archief) */
export function ramingInPdf(): boolean {
  huidig ??= lees();
  return huidig;
}

export function zetRamingInPdf(aan: boolean) {
  huidig = aan;
  try {
    localStorage.setItem(SLEUTEL, aan ? "ja" : "nee");
  } catch {
    // niet bewaard; de keuze geldt dan alleen tot de pagina herlaadt
  }
  luisteraars.forEach((f) => f());
}

/** Alleen voor tests: opnieuw uit de opslag lezen */
export function vergeetRamingKeuze() {
  huidig = null;
}

export function useRamingInPdf(): [boolean, (aan: boolean) => void] {
  const aan = useSyncExternalStore(
    (f) => {
      luisteraars.add(f);
      return () => luisteraars.delete(f);
    },
    ramingInPdf,
    () => true,
  );
  return [aan, zetRamingInPdf];
}
