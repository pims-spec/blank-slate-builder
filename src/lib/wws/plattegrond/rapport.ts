// Plattegronden alleen voor het rapport (2D, 3D, situatie/meetrapport, …): de maten worden niet
// overgenomen in de telling. Elke afbeelding staat in Storage (zelfde bucket en map als de
// ingelezen plattegrond); de telling bewaart alleen de verwijzingen in
// input.rapportPlattegronden. In de PDF krijgt elke afbeelding een eigen pagina
// "Plattegrond 1 - 2D", zoals de CBRE-rapporten.
import { PAD_RE, type PlattegrondRef } from "./opslag";

export type RapportPlattegrondSoort = "2d" | "3d" | "situatie" | "berging" | "indeling" | "eigen";

export interface RapportPlattegrond extends PlattegrondRef {
  soort: RapportPlattegrondSoort;
  /** Alleen bij soort "eigen" */
  titel?: string;
}

export const SOORT_NAAM: Record<RapportPlattegrondSoort, string> = {
  "2d": "2D",
  "3d": "3D",
  situatie: "Situatie",
  berging: "Berging",
  indeling: "Indelingsadvies",
  eigen: "Eigen titel",
};

/** Keuzes in het venster, in deze volgorde */
export const SOORTEN = Object.keys(SOORT_NAAM) as RapportPlattegrondSoort[];

export const MAX_RAPPORT_PLATTEGRONDEN = 8;
export const MAX_TITEL = 60;

const isSoort = (s: unknown): s is RapportPlattegrondSoort =>
  typeof s === "string" && Object.hasOwn(SOORT_NAAM, s);

/**
 * De geldige rapport-plattegronden uit de invoer. Een telling is onbetrouwbare invoer: alleen
 * bekende soorten, geldige paden en positieve maten; een eigen titel wordt ingekort.
 */
export function rapportPlattegronden(input: {
  rapportPlattegronden?: unknown;
}): RapportPlattegrond[] {
  const lijst = Array.isArray(input.rapportPlattegronden) ? input.rapportPlattegronden : [];
  const uit: RapportPlattegrond[] = [];
  for (const x of lijst as Record<string, unknown>[]) {
    if (!x || typeof x !== "object") continue;
    const { pad, breedte, hoogte, soort, titel } = x;
    if (typeof pad !== "string" || !PAD_RE.test(pad) || !isSoort(soort)) continue;
    if (typeof breedte !== "number" || typeof hoogte !== "number" || breedte <= 0 || hoogte <= 0)
      continue;
    const p: RapportPlattegrond = { pad, breedte, hoogte, soort };
    if (soort === "eigen")
      p.titel = typeof titel === "string" ? titel.trim().slice(0, MAX_TITEL) : "";
    uit.push(p);
    if (uit.length === MAX_RAPPORT_PLATTEGRONDEN) break;
  }
  return uit;
}

/** Kleine plattegrond op de overzichtspagina: bij voorkeur 3D, dan 2D (zoals de CBRE-rapporten) */
export const OVERZICHT_VOORKEUR: readonly RapportPlattegrondSoort[] = ["3d", "2d"];
/** Kleine plattegrond bij de huidige situatie: bij voorkeur de situatie (meetrapport), dan 2D */
export const SITUATIE_VOORKEUR: readonly RapportPlattegrondSoort[] = ["situatie", "2d"];

/** De eerste plattegrond van de eerste soort uit de voorkeur; anders de eerste van de lijst */
export function kiesPlattegrond<T extends { soort?: RapportPlattegrondSoort | undefined }>(
  lijst: readonly T[],
  voorkeur: readonly RapportPlattegrondSoort[],
): T | undefined {
  for (const s of voorkeur) {
    const x = lijst.find((p) => p.soort === s);
    if (x) return x;
  }
  return lijst[0];
}

/** "Plattegrond 1 - 2D"; een eigen titel zonder tekst wordt gewoon "Plattegrond 3" */
export function paginaTitel(nr: number, p: Pick<RapportPlattegrond, "soort" | "titel">): string {
  const naam = p.soort === "eigen" ? (p.titel ?? "").trim() : SOORT_NAAM[p.soort];
  return "Plattegrond " + nr + (naam ? " - " + naam : "");
}

/** Alle Storage-paden van een invoer: de ingelezen plattegrond en de rapport-plattegronden */
export function allePaden(input: {
  plattegrond?: { pad?: unknown } | undefined;
  rapportPlattegronden?: unknown;
}): string[] {
  const p = input.plattegrond?.pad;
  return [
    ...(typeof p === "string" && PAD_RE.test(p) ? [p] : []),
    ...rapportPlattegronden(input).map((r) => r.pad),
  ];
}

/**
 * Welke rapport-plattegronden mogen weg na het opslaan? Paden die eerder opgeslagen waren, nu
 * niet meer in de werkversie staan en ook door geen enkele versie worden gebruikt.
 */
export function ongebruikteRapportPaden(
  vorige: readonly string[],
  nu: readonly string[],
  versies: readonly { rapportPlattegronden?: unknown; plattegrond?: { pad?: unknown } }[],
): string[] {
  const gebruikt = new Set([...nu, ...versies.flatMap((v) => allePaden(v))]);
  return [...new Set(vorige)].filter((p) => !gebruikt.has(p));
}
