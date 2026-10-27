// Welke foto bij welke ruimte van de telling hoort, en de beoordelingen op de hele woning toepassen.
// Een doel is een sleutel: "vertrekken:2" (bestaande ruimte), "nieuw:toilet" (de app voegt de
// ruimte toe), "geen" (niet gebruiken) of "" (nog kiezen: er zijn meer ruimtes van die soort).
import { facDefault, facKind, OVERIG_TYPES, VERTREK_TYPES } from "../basis";
import type { WwsInput } from "../types";
import type { Beoordeling } from "./beoordeling";
import { MAX_FOTOS } from "./beoordeling";
import { RUIMTE_NAAM, type FotoRuimte } from "./elementen";
import { fotoRuimteVoor, pasFotosToe } from "./invullen";
import { isFotoRuimte, type FotoSortering } from "./sorteren";

export type Doel = string;
export const GEEN: Doel = "geen";
export const KIEZEN: Doel = "";
export const FOTO_HERKOMST = "Toegevoegd uit foto's";

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const SOORTEN: readonly FotoRuimte[] = ["keuken", "badkamer", "toilet"];

/** Waar een nieuwe ruimte van deze soort komt */
const NIEUW: Record<
  FotoRuimte,
  { groep: "vertrekken" | "overig"; type: "keuken" | "badkamer" | "toilet" }
> = {
  keuken: { groep: "vertrekken", type: "keuken" },
  badkamer: { groep: "vertrekken", type: "badkamer" },
  toilet: { groep: "overig", type: "toilet" },
};

export interface DoelOptie {
  doel: Doel;
  naam: string;
  ruimte: FotoRuimte;
}

/** Naam van een ruimte in de telling: de eigen naam, anders de soort (met een nummer bij dubbel) */
function namen(input: WwsInput): Map<string, string> {
  const uit = new Map<string, string>();
  const tel = new Map<string, number>();
  const lijst: [string, string][] = [];
  for (const groep of ["vertrekken", "overig"] as const) {
    const types = groep === "vertrekken" ? VERTREK_TYPES : OVERIG_TYPES;
    input[groep].forEach((r, i) => {
      if (!fotoRuimteVoor(r.fac)) return;
      const naam = r.naam?.trim() || types.find((t) => t.k === r.type)?.l || "Ruimte";
      lijst.push([groep + ":" + i, naam]);
      tel.set(naam, (tel.get(naam) ?? 0) + 1);
    });
  }
  const nr = new Map<string, number>();
  for (const [k, naam] of lijst) {
    if ((tel.get(naam) ?? 0) < 2) uit.set(k, naam);
    else {
      const n = (nr.get(naam) ?? 0) + 1;
      nr.set(naam, n);
      uit.set(k, naam + " " + n);
    }
  }
  return uit;
}

/** De keuzes in de keuzelijst: de ruimtes in de telling, dan per soort een nieuwe ruimte */
export function doelOpties(input: WwsInput): DoelOptie[] {
  const n = namen(input);
  const uit: DoelOptie[] = [];
  for (const groep of ["vertrekken", "overig"] as const)
    input[groep].forEach((r, i) => {
      const ruimte = fotoRuimteVoor(r.fac);
      if (ruimte) uit.push({ doel: groep + ":" + i, naam: n.get(groep + ":" + i)!, ruimte });
    });
  for (const ruimte of SOORTEN)
    uit.push({
      doel: "nieuw:" + ruimte,
      naam: "Nieuwe " + RUIMTE_NAAM[ruimte] + " toevoegen",
      ruimte,
    });
  return uit;
}

/**
 * Het begin van de indeling na het sorteren: één ruimte van die soort → die; geen → een nieuwe;
 * meer → nog kiezen; "anders" (en "plattegrond") → niet gebruiken.
 */
export function beginIndeling(input: WwsInput, sortering: readonly FotoSortering[]): Doel[] {
  const opties = doelOpties(input).filter((o) => !o.doel.startsWith("nieuw:"));
  return sortering.map((s) => {
    if (!isFotoRuimte(s.soort)) return GEEN;
    const zelfde = opties.filter((o) => o.ruimte === s.soort);
    if (zelfde.length === 1) return zelfde[0]!.doel;
    return zelfde.length === 0 ? "nieuw:" + s.soort : KIEZEN;
  });
}

export interface Groep {
  doel: Doel;
  ruimte: FotoRuimte;
  naam: string;
  /** Indexen van de foto's (vanaf 0) */
  fotos: number[];
}

/**
 * De foto's per ruimte, voor het beoordelen. fout als er nog iets te kiezen is, of meer dan 10
 * foto's bij één ruimte.
 */
export function groepeer(
  input: WwsInput,
  doelen: readonly Doel[],
): { groepen: Groep[]; fout: string | null } {
  const opties = new Map(doelOpties(input).map((o) => [o.doel, o]));
  const per = new Map<Doel, number[]>();
  doelen.forEach((d, i) => {
    if (d === GEEN || d === KIEZEN || !opties.has(d)) return;
    per.set(d, [...(per.get(d) ?? []), i]);
  });
  const groepen = [...per].map(([doel, fotos]) => {
    const o = opties.get(doel)!;
    return { doel, ruimte: o.ruimte, naam: o.naam, fotos };
  });
  const kiezen = doelen.filter((d) => d === KIEZEN).length;
  const teVeel = groepen.find((g) => g.fotos.length > MAX_FOTOS);
  const fout = kiezen
    ? `Kies bij ${kiezen === 1 ? "1 foto" : kiezen + " foto's"} de ruimte.`
    : teVeel
      ? `Hoogstens ${MAX_FOTOS} foto's per ruimte; bij ${teVeel.naam} zijn het er ${teVeel.fotos.length}.`
      : groepen.length === 0
        ? "Er is geen foto van een keuken, badkamer of toiletruimte om te beoordelen."
        : null;
  return { groepen, fout };
}

export interface WoningResultaat {
  doel: Doel;
  naam: string;
  /** Aantal velden met een ! */
  onzeker: number;
  nieuw: boolean;
}

/**
 * De beoordelingen op de telling toepassen. Wijzigt input niet. Nieuwe ruimtes komen achteraan,
 * met alle voorzieningen uit (alleen wat op de foto's staat telt) en zonder m².
 */
export function pasWoningToe(
  input: WwsInput,
  uitslagen: readonly { doel: Doel; beoordeling: Beoordeling }[],
): { input: WwsInput; resultaten: WoningResultaat[] } {
  const uit = clone(input);
  const n = namen(input);
  const resultaten: WoningResultaat[] = [];
  for (const { doel, beoordeling } of uitslagen) {
    const [a, b] = doel.split(":");
    if (a === "nieuw") {
      const ruimte = b as FotoRuimte;
      const plek = NIEUW[ruimte];
      if (!plek) continue;
      const kind = facKind(plek.groep, plek.type)!;
      const r = pasFotosToe(facDefault(kind, true), ruimte, beoordeling);
      if (!r) continue;
      uit[plek.groep].push({
        type: plek.type,
        m2: "",
        verwarmd: plek.groep === "vertrekken",
        herkomst: FOTO_HERKOMST,
        fac: r.fac,
      } as never);
      const naam = (plek.groep === "vertrekken" ? VERTREK_TYPES : OVERIG_TYPES).find(
        (t) => t.k === plek.type,
      )!.l;
      resultaten.push({ doel, naam: naam + " (nieuw)", onzeker: r.onzeker, nieuw: true });
      continue;
    }
    if (a !== "vertrekken" && a !== "overig") continue;
    const x = uit[a][Number(b)];
    const ruimte = fotoRuimteVoor(x?.fac);
    if (!x?.fac || !ruimte) continue;
    const r = pasFotosToe(x.fac, ruimte, beoordeling);
    if (!r) continue;
    x.fac = r.fac;
    resultaten.push({ doel, naam: n.get(doel) ?? "Ruimte", onzeker: r.onzeker, nieuw: false });
  }
  return { input: uit, resultaten };
}
