// Analyse over meerdere portefeuilles: de adressen samenvoegen en een titel voorstellen.
import { adresSleutel } from "./adres";
import type { AnalyseAdres } from "./analyse";

/** Welke van twee versies van hetzelfde adres is het beste: met resultaat, dan het nieuwste */
function beter(a: AnalyseAdres, b: AnalyseAdres): boolean {
  if (!!a.resultaat !== !!b.resultaat) return !!a.resultaat;
  const ta = a.resultaat?.opgehaaldOp ?? "";
  const tb = b.resultaat?.opgehaaldOp ?? "";
  if (ta !== tb) return ta > tb;
  return !!a.straat && !b.straat;
}

/**
 * Adressen van meerdere portefeuilles samenvoegen: adressen die niet meer in Bloxs staan tellen
 * niet mee, en een adres dat in meer portefeuilles staat telt één keer (de versie met het nieuwste
 * labelresultaat).
 */
export function combineerAdressen(lijsten: readonly (readonly AnalyseAdres[])[]): AnalyseAdres[] {
  const per = new Map<string, AnalyseAdres>();
  for (const lijst of lijsten)
    for (const a of lijst) {
      if (a.nietInBloxsSinds) continue;
      const k = adresSleutel(a);
      const huidig = per.get(k);
      if (!huidig || beter(a, huidig)) per.set(k, a);
    }
  return [...per.values()];
}

/** "Oost + West", of bij meer dan drie "Oost, West, Noord en 2 andere" */
export function combiTitel(namen: readonly string[]): string {
  if (namen.length <= 3) return namen.join(" + ");
  return namen.slice(0, 3).join(", ") + " en " + (namen.length - 3) + " andere";
}
