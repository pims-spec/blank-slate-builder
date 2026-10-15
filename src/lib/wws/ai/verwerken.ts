// Van een (gecontroleerd) Claude-antwoord naar wat de app gebruikt.
import { num } from "../basis";
import type { EnergieAdvies, EnergieAdviesHuidig } from "../types";
import { EnergieAdviesAntwoord, PlattegrondAntwoord, isLabel, jsonUitTekst } from "./antwoorden";

/** Het plattegrond-antwoord, of null als het onbruikbaar is (geen lijst ruimten) */
export function verwerkPlattegrond(tekst: string): PlattegrondAntwoord | null {
  const r = PlattegrondAntwoord.safeParse(jsonUitTekst(tekst));
  return r.success ? r.data : null;
}

export type EnergieAdviesUitkomst =
  | { ok: true; advies: Omit<EnergieAdvies, "bestand" | "geuploadOp"> }
  | { ok: false; fout: "onbruikbaar_antwoord" | "geen_maatregelen" };

/**
 * Het verduurzamingsadvies, zoals runEnergieAdvies() in wws-site.html: alleen maatregelen met
 * geldige labels; omschrijving max 8 regels van 160 tekens; kosten/besparing als getallen.
 */
export function verwerkEnergieAdvies(tekst: string): EnergieAdviesUitkomst {
  const r = EnergieAdviesAntwoord.safeParse(jsonUitTekst(tekst));
  if (!r.success) return { ok: false, fout: "onbruikbaar_antwoord" };
  const maatregelen = r.data.maatregelen
    .filter((m) => isLabel(m.vanLabel) && isLabel(m.naarLabel))
    .map((m) => ({
      vanLabel: m.vanLabel,
      naarLabel: m.naarLabel,
      omschrijving: m.omschrijving.map((s) => String(s).slice(0, 160)).slice(0, 8),
      kostenMin: num(m.kosten_min) || 0,
      kostenMax: num(m.kosten_max) || num(m.kosten_min) || 0,
      besparingMin: num(m.besparing_min) || 0,
      besparingMax: num(m.besparing_max) || num(m.besparing_min) || 0,
    }));
  if (!maatregelen.length) return { ok: false, fout: "geen_maatregelen" };
  return {
    ok: true,
    advies: { huidig: (r.data.huidig ?? null) as EnergieAdviesHuidig | null, maatregelen },
  };
}
