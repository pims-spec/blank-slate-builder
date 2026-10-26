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
 * Adressen van meerdere portefeuilles samenvoegen: adressen die niet meer in Bloxs staan of uit de
 * analyse zijn gehaald tellen niet mee, en een adres dat in meer portefeuilles staat telt één keer (de versie met het nieuwste
 * labelresultaat).
 */
export function combineerAdressen(lijsten: readonly (readonly AnalyseAdres[])[]): AnalyseAdres[] {
  const per = new Map<string, AnalyseAdres>();
  for (const lijst of lijsten)
    for (const a of lijst) {
      if (a.nietInBloxsSinds || a.uitgeslotenOp) continue;
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

/** Hoogstens zoveel tekens in de naam van een analyse (check in migratie 0007) */
export const MAX_ANALYSE_NAAM = 200;

/**
 * De naam van een analyse zoals hij wordt opgeslagen: witruimte samengevoegd en bijgeknipt;
 * null als hij leeg of te lang is.
 */
export function geldigeAnalyseNaam(t: string): string | null {
  const naam = t.replace(/\s+/g, " ").trim();
  return naam.length >= 1 && naam.length <= MAX_ANALYSE_NAAM ? naam : null;
}
