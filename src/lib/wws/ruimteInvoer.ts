// Invoer per ruimte, zoals het formulier in wws-site.html: lengte × breedte (meerdere maten,
// negatief om iets af te trekken) met het oppervlak berekend — matenCell() en de input-handler —
// en de opmerking onder een ruimte (roomTable()). Pure functies op kopieën.
import { matenM2, num, overigType } from "./basis";
import type { Normen } from "./normen";
import type { Maat, NumLike } from "./types";

type MetMaten = { m2: NumLike; maten?: Maat[]; herkomst?: string };

const m2Tekst = (a: number | null) => (a != null ? String(a).replace(".", ",") : "");

/** Een lengte of breedte wijzigen; het oppervlak volgt (leeg als er geen volledige maat is) */
export function zetMaat<T extends MetMaten>(r: T, j: number, veld: "l" | "b", waarde: string): T {
  const maten = (r.maten || []).map((m, k) => (k === j ? { ...m, [veld]: waarde } : m));
  const uit = { ...r, maten };
  uit.m2 = m2Tekst(matenM2(uit));
  return uit;
}

/** "+ lengte × breedte" */
export function voegMaatToe<T extends MetMaten>(r: T): T {
  return { ...r, maten: [...(r.maten || []), { l: "", b: "" }] };
}

/** Een maat verwijderen; het oppervlak volgt alleen als er nog een volledige maat over is */
export function verwijderMaat<T extends MetMaten>(r: T, j: number): T {
  const uit = { ...r, maten: (r.maten || []).filter((_m, k) => k !== j) };
  const a = matenM2(uit);
  if (a != null) uit.m2 = m2Tekst(a);
  return uit;
}

/**
 * Oppervlak met de hand gewijzigd. Kwam de ruimte van een ingelezen plattegrond, dan wordt de
 * herkomst "Plattegrond, aangepast" (tenzij al gecontroleerd), zoals de bron.
 */
export function zetM2<T extends MetMaten>(r: T, waarde: string): T {
  const uit = { ...r, m2: waarde };
  if (uit.herkomst && !/gecontroleerd/.test(uit.herkomst))
    uit.herkomst = uit.herkomst.replace(/^Plattegrond: [^ (]+/, "Plattegrond, aangepast");
  return uit;
}

/** Wordt het oppervlak uit de maten berekend? (dan toont het veld dat als hint) */
export const m2Berekend = (r: { maten?: Maat[] }) => matenM2(r) != null;

export interface Opmerking {
  tekst: string;
  /** ingeschat van een plattegrond: oranje, zoals de bron */
  ingeschat?: boolean;
}

/** De opmerking onder een ruimte — roomTable() in wws-site.html */
export function ruimteOpmerking(
  groep: "vertrekken" | "overig",
  r: { type: string; m2: NumLike; herkomst?: string },
  N: Pick<Normen, "minOverig">,
): Opmerking | null {
  const T = groep === "overig" ? overigType(r.type) : null;
  const small = groep === "overig" && !T?.verkeer && num(r.m2) > 0 && num(r.m2) < N.minOverig;
  if (T?.verkeer) return { tekst: "Geen oppervlaktepunten, wel verwarming" };
  if (small)
    return {
      tekst:
        "Kleiner dan 2 m²: geen oppervlaktepunten" +
        (r.type === "toilet" ? ". Het toilet zelf telt bij rubriek 6 (Sanitair)." : "."),
    };
  if (r.herkomst) return { tekst: r.herkomst, ingeschat: /ingeschat/.test(r.herkomst) };
  return null;
}
