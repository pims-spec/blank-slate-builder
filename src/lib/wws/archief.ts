// Archief: zoeken, filteren en groeperen — archiefMatch(), archiefMatchFilters() en
// renderArchief() in wws-site.html. "Eigenaar" = de klant (meta.klantId), "collega" = wie de
// telling heeft gemaakt (ownerId).
import { calc } from "./calc";
import type { Normen } from "./normen";
import { klantNaam, type Klant } from "./opslag/klanten";
import { tellingTitel, weergaveAdres } from "./opslag/doc";
import type { Telling } from "./opslag/types";
import type { Segment, Woningtype } from "./types";
import { versieKeuzeLabel } from "./versieDiff";
import type { DashboardVersie } from "./dashboard";

export interface ArchiefFilters {
  /** yyyy-mm-dd */
  peilVan: string;
  peilTot: string;
  /** ownerId */
  collega: string;
  puntenVan: string;
  puntenTot: string;
  segment: Segment | "";
  woningtype: Woningtype | "";
  /** klantId */
  eigenaar: string;
}

export const LEGE_FILTERS: ArchiefFilters = {
  peilVan: "",
  peilTot: "",
  collega: "",
  puntenVan: "",
  puntenTot: "",
  segment: "",
  woningtype: "",
  eigenaar: "",
};

export interface ArchiefRij {
  t: Telling;
  titel: string;
  /** Adres, als dat iets anders is dan de titel */
  adres: string;
  /** Live herberekend met de huidige normen; anders de laatst opgeslagen punten */
  punten: number | null;
  seg: Segment | null;
  eigenaar: string;
  collega: string;
}

export function archiefRij(t: Telling, N: Normen, klanten: readonly Klant[]): ArchiefRij {
  let punten = t.laatstePunten;
  let seg: Segment | null = null;
  try {
    const R = calc(t.input, N);
    punten = R.totaal;
    seg = R.seg;
  } catch {
    // onvolledige oude telling: laatst opgeslagen punten tonen
  }
  const titel = tellingTitel(t.meta);
  const adres = weergaveAdres(t.meta);
  return {
    t,
    titel,
    adres: adres === titel ? "" : adres,
    punten,
    seg,
    eigenaar: klantNaam(klanten, t.meta.klantId),
    collega: t.ownerNaam ?? "",
  };
}

/** Zoeken op naam, adres, postcode, eigenaar en collega */
export function matchZoek(r: ArchiefRij, q: string): boolean {
  const z = q.trim().toLowerCase();
  if (!z) return true;
  return [r.titel, r.adres, r.t.meta.postcode, r.eigenaar, r.collega]
    .join(" ")
    .toLowerCase()
    .includes(z);
}

export function matchFilters(r: ArchiefRij, f: ArchiefFilters): boolean {
  const { t } = r;
  if (f.collega && t.ownerId !== f.collega) return false;
  if (f.eigenaar && t.meta.klantId !== f.eigenaar) return false;
  const pd = t.meta.peildatum;
  if (f.peilVan && (!pd || pd < f.peilVan)) return false;
  if (f.peilTot && (!pd || pd > f.peilTot)) return false;
  if (f.woningtype && t.input.woningtype !== f.woningtype) return false;
  if (f.segment && r.seg !== f.segment) return false;
  if (f.puntenVan && (r.punten == null || r.punten < Number(f.puntenVan))) return false;
  if (f.puntenTot && (r.punten == null || r.punten > Number(f.puntenTot))) return false;
  return true;
}

export const heeftFilters = (f: ArchiefFilters) =>
  (Object.keys(f) as (keyof ArchiefFilters)[]).some((k) => f[k] !== "");

export interface CollegaGroep {
  ownerId: string;
  naam: string;
  rijen: ArchiefRij[];
}

/** Per collega (voor admin en kijkrol), op naam; binnen een groep de volgorde van de lijst */
export function groepeerPerCollega(rijen: readonly ArchiefRij[]): CollegaGroep[] {
  const groepen = new Map<string, CollegaGroep>();
  for (const r of rijen) {
    const g = groepen.get(r.t.ownerId) ?? {
      ownerId: r.t.ownerId,
      naam: r.collega || "Onbekende gebruiker",
      rijen: [],
    };
    g.rijen.push(r);
    groepen.set(r.t.ownerId, g);
  }
  return [...groepen.values()].sort((a, b) =>
    a.naam.localeCompare(b.naam, "nl", { sensitivity: "base" }),
  );
}

/** De collega's die in de lijst voorkomen (voor het collega-filter) */
export function collegasInLijst(rijen: readonly ArchiefRij[]): { id: string; naam: string }[] {
  return groepeerPerCollega(rijen).map((g) => ({ id: g.ownerId, naam: g.naam }));
}

/** Favorieten eerst, dan op naam (naam of adres) — sortFavNaam() in wws-site.html */
export function sorteerFavNaam<T extends { t: Telling; titel: string }>(rijen: readonly T[]): T[] {
  const fav = (r: T) => (r.t.meta && r.t.meta["favoriet"] ? 1 : 0);
  return [...rijen].sort(
    (a, b) => fav(b) - fav(a) || a.titel.localeCompare(b.titel, "nl", { sensitivity: "base" }),
  );
}

/**
 * Favorieten eerst, dan laatst gewijzigd bovenaan (standaard in het archief; de bron sorteert op
 * naam, zie sorteerFavNaam). Gelijke datum: op naam.
 */
export function sorteerFavGewijzigd<T extends { t: Telling; titel: string }>(
  rijen: readonly T[],
): T[] {
  const fav = (r: T) => (r.t.meta && r.t.meta["favoriet"] ? 1 : 0);
  return [...rijen].sort(
    (a, b) =>
      fav(b) - fav(a) ||
      b.t.gewijzigdOp.localeCompare(a.t.gewijzigdOp) ||
      a.titel.localeCompare(b.titel, "nl", { sensitivity: "base" }),
  );
}

/** "geen versies" / "1 versie" / "3 versies" — archiefRow() in wws-site.html */
export const versiesTekst = (t: Pick<Telling, "aantalVersies" | "versieCount">) => {
  const av = t.aantalVersies != null ? t.aantalVersies : t.versieCount;
  return av ? av + " versie" + (av > 1 ? "s" : "") : "geen versies";
};

/**
 * Keuzelijst in het archief bij een telling met meerdere versies: eerst de werkversie, dan de
 * versies van nieuw naar oud ("v2 — Na renovatie"). Aanvulling op de bron, die alleen het aantal
 * toont. `waarde` is "" (werkversie) of het versienummer.
 */
export function versieKeuzes(
  tellingId: string,
  versies: readonly Pick<DashboardVersie, "tellingId" | "nr" | "notitie" | "createdAt">[],
): { waarde: string; label: string }[] {
  const eigen = versies
    .filter((v) => v.tellingId === tellingId)
    .sort((a, b) => b.nr - a.nr)
    .map((v) => ({
      waarde: String(v.nr),
      label: versieKeuzeLabel({ nr: v.nr, notitie: v.notitie ?? "", createdAt: v.createdAt ?? "" }),
    }));
  return [{ waarde: "", label: "Werkversie" }, ...eigen];
}
