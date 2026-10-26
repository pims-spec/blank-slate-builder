// Labels of BAG-gegevens ophalen in porties, voor één of meer portefeuilles tegelijk. Een adres
// dat in meer portefeuilles staat wordt één keer opgevraagd; de uitkomst wordt bij elke
// portefeuille opgeslagen. De aanvragen en het opslaan komen van buiten (server function en
// opslag), zodat dit zonder netwerk te testen is.
import { adresSleutel } from "./adres";
import { klasseVan, verloopdatum, type AnalyseAdres } from "./analyse";
import { plusMaanden } from "./datum";

export type OpnieuwKeuze = "alle" | "probleem" | "oud";

/** Een adres met de portefeuille waar het in staat (nodig om het resultaat op te slaan) */
export interface OphaalAdres {
  adres: AnalyseAdres;
  portefeuilleId: string;
}

/** Wat de server krijgt per adres */
export interface Vraag {
  id: string;
  postcode: string;
  huisnummer: number;
  huisletter: string;
  toevoeging: string;
}

/** Eén aanvraag voor alle exemplaren van hetzelfde adres */
export interface Bundel {
  vraag: Vraag;
  doelen: OphaalAdres[];
}

/** Nog minstens een jaar geldig op `peil` (zonder bekende verloopdatum: nee, dus wel ophalen) */
export function langGeldig(r: AnalyseAdres["resultaat"], peil: string): boolean {
  if (!r || r.status !== "gevonden" || !klasseVan(r)) return false;
  const tot = verloopdatum(r);
  return !!tot && tot > plusMaanden(peil, 12);
}

/**
 * De adressen voor "Opnieuw ophalen": alle, alleen die met een probleem (niet gevonden, niet
 * eenduidig, mislukt) of die langer dan een maand geleden zijn opgehaald. Met `slaLangGeldigOver`
 * vallen labels af die volgens de vorige ophaalronde nog meer dan een jaar geldig zijn.
 */
export function opnieuwLijst<T extends { adres: AnalyseAdres }>(
  lijst: readonly T[],
  k: OpnieuwKeuze,
  peil: string,
  slaLangGeldigOver: boolean,
): T[] {
  const grens = plusMaanden(peil, -1);
  return lijst.filter(({ adres: { resultaat: r } }) => {
    if (!r) return false;
    if (slaLangGeldigOver && langGeldig(r, peil)) return false;
    if (k === "probleem") return r.status !== "gevonden";
    if (k === "oud") return r.opgehaaldOp.slice(0, 10) < grens;
    return true;
  });
}

/** Hetzelfde adres (postcode, huisnummer, letter, toevoeging) samen in één bundel, in volgorde */
export function bundel(lijst: readonly OphaalAdres[]): Bundel[] {
  const per = new Map<string, Bundel>();
  for (const d of lijst) {
    const k = adresSleutel(d.adres);
    const b = per.get(k);
    if (b) b.doelen.push(d);
    else {
      const { id, postcode, huisnummer, huisletter, toevoeging } = d.adres;
      per.set(k, { vraag: { id, postcode, huisnummer, huisletter, toevoeging }, doelen: [d] });
    }
  }
  return [...per.values()];
}

export interface Voortgang {
  gedaan: number;
  /** Tot en met dit adres loopt de huidige portie */
  tot: number;
  totaal: number;
}

export interface Ronde<R, S> {
  haalOp: (vragen: Vraag[]) => Promise<{ resultaten: { id: string; resultaat: R }[]; stop?: S }>;
  slaOp: (rijen: { doel: OphaalAdres; resultaat: R }[]) => Promise<void>;
  voortgang?: (v: Voortgang) => void;
  /** Wordt vóór elke portie gevraagd */
  moetStoppen?: () => boolean;
  /** Adressen per aanvraag */
  portie: number;
}

export type RondeEinde<S> = S | "gestopt" | "geen_verbinding" | null;

/**
 * De bundels in porties ophalen en opslaan. Stopt bij een stopfout van de dienst, als de server
 * of het opslaan faalt ("geen_verbinding", zonder de ruwe fout) of als `moetStoppen` ja zegt.
 */
export async function haalInPorties<R, S>(
  bundels: readonly Bundel[],
  r: Ronde<R, S>,
): Promise<{ gedaan: number; stop: RondeEinde<S> }> {
  let gedaan = 0;
  const totaal = bundels.length;
  for (let i = 0; i < totaal; i += r.portie) {
    if (r.moetStoppen?.()) return { gedaan, stop: "gestopt" };
    const portie = bundels.slice(i, i + r.portie);
    r.voortgang?.({ gedaan, tot: gedaan + portie.length, totaal });
    const perId = new Map(portie.map((b) => [b.vraag.id, b]));
    let antwoord: Awaited<ReturnType<Ronde<R, S>["haalOp"]>>;
    try {
      antwoord = await r.haalOp(portie.map((b) => b.vraag));
      await r.slaOp(
        antwoord.resultaten.flatMap(({ id, resultaat }) =>
          (perId.get(id)?.doelen ?? []).map((doel) => ({ doel, resultaat })),
        ),
      );
    } catch {
      return { gedaan, stop: "geen_verbinding" };
    }
    gedaan += antwoord.resultaten.filter((x) => perId.has(x.id)).length;
    r.voortgang?.({ gedaan, tot: gedaan, totaal });
    if (antwoord.stop) return { gedaan, stop: antwoord.stop };
  }
  return { gedaan, stop: null };
}

/** Rijen per portefeuille, voor opslag die per portefeuille werkt */
export function perPortefeuille<T extends { doel: OphaalAdres }>(rijen: readonly T[]) {
  const per = new Map<string, T[]>();
  for (const rij of rijen) {
    const l = per.get(rij.doel.portefeuilleId);
    if (l) l.push(rij);
    else per.set(rij.doel.portefeuilleId, [rij]);
  }
  return per;
}
