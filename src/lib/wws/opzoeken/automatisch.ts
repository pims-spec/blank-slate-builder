// Na het invullen van postcode en huisnummer worden energielabel (EP-Online) en monumentstatus
// (Kadaster en RCE) vanzelf opgehaald. Ingevuld wordt alleen wat nog leeg is (of op de standaard
// staat): wat de gebruiker zelf heeft ingevuld, blijft staan.
import type { Energie, MonumentKeuze } from "../types";
import type { MonumentStatus } from "./monument";

/** Wat het scherm van een ophaalpoging laat zien: bezig, de uitslag of een foutmelding */
export interface OphaalStaat<T> {
  uitslag?: T;
  fout?: string;
  bezig?: boolean;
}

/** Staat het energiedeel nog leeg (geen label, index, bouwjaar of datum)? */
export function energieIsLeeg(e: Energie): boolean {
  return !e.label && !e.indexKlasse && !String(e.bouwjaar ?? "") && !e.datum;
}

/** Staat de monumentkeuze nog op de standaard ("Geen monument")? */
export const monumentIsLeeg = (keuze: MonumentKeuze | undefined) => !keuze || keuze === "geen";

/**
 * De keuze in de telling bij een gevonden status. Een rijksmonument wordt "contract na 1 juli
 * 2024": het contract staat in geen bron, de gebruiker zet zelf het vinkje voor vóór 1 juli 2024.
 */
export function monumentKeuzeVoor(s: MonumentStatus): MonumentKeuze | null {
  if (s.voorstel === "rijks") return "rijks_na";
  return s.voorstel;
}

/** Korte melding na het invullen, bijv. "Rijksmonument 2249 ingevuld (contract na 1 juli 2024)." */
export function monumentMelding(s: MonumentStatus): string {
  if (s.voorstel === "rijks")
    return (
      "Rijksmonument" +
      (s.rijksmonumentNummers.length ? " " + s.rijksmonumentNummers.join(", ") : "") +
      " ingevuld (contract na 1 juli 2024). Vink 'contract vóór 1 juli 2024' aan als dat geldt."
    );
  if (s.voorstel === "gemprov") return "Gemeentelijk monument ingevuld (Kadaster).";
  if (s.voorstel === "stads")
    return (
      "Beschermd stads- of dorpsgezicht ingevuld" +
      (s.gezichten[0] ? ": " + s.gezichten[0] : "") +
      "."
    );
  return "";
}

/** Sleutel om hetzelfde adres niet twee keer op te halen */
export const adresSleutel = (v: {
  postcode: string;
  huisnummer: string;
  huisletter?: string;
  huisnummertoevoeging?: string;
}) =>
  [v.postcode, v.huisnummer, v.huisletter ?? "", v.huisnummertoevoeging ?? ""]
    .join("|")
    .toUpperCase();
