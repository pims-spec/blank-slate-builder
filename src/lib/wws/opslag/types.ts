import type { Normen } from "../normen";
import type { Rij, Segment, WwsInput } from "../types";

/**
 * Gegevens over de woning en de telling zelf (niet nodig voor de berekening).
 * Gelijk aan `meta` in wws-site.html; onbekende velden uit de oude tool (klantId,
 * favoriet, auto, …) blijven bij inlezen behouden, zodat er niets verloren gaat.
 */
export interface TellingMeta {
  naam: string;
  /** Straat (zonder huisnummer) */
  adres: string;
  postcode: string;
  huisnummer: string;
  plaats: string;
  bouwjaar: string;
  /** yyyy-mm-dd */
  peildatum: string;
  opsteller: string;
  [extra: string]: unknown;
}

export interface Bewerker {
  id: string;
  naam: string;
  email: string;
}

/** Inhoud van `tellingen.data`: de werkversie. */
export interface TellingDoc {
  meta: TellingMeta;
  input: WwsInput;
  /** Hoogste uitgegeven versienummer (ook als er versies zijn verwijderd) */
  versieCount: number;
  aantalVersies: number;
  /** Nummer van de versie waarop de werkversie is gebaseerd (na "versie openen") */
  basedOn: number | null;
  createdAt: string;
  updatedAt: string;
  laatstePunten: number | null;
  lastEditedBy: Bewerker | null;
}

export interface VersieResultaat {
  totaal: number;
  exact: number;
  seg: Segment;
  maxHuur: number | null;
  rows: Rij[];
}

/** Inhoud van `telling_versies.data`: een vastgelegde versie, inclusief de gebruikte normen. */
export interface VersieDoc {
  nr: number;
  notitie: string;
  createdAt: string;
  meta: TellingMeta;
  input: WwsInput;
  normen: Normen;
  resultaat: VersieResultaat;
}

/** Een telling zoals die uit de database komt. */
export interface Telling extends TellingDoc {
  id: string;
  ownerId: string;
  /** Naam van de eigenaar (via profiles); alleen gevuld als die zichtbaar is (admins, of jezelf) */
  ownerNaam: string | null;
  /** updated_at van de rij (door de database gezet) */
  gewijzigdOp: string;
}

export interface Versie extends VersieDoc {
  /** "v0001", "v0002", … */
  id: string;
}
