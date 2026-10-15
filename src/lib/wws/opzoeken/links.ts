// Opzoeklinks naar het WOZ-waardeloket en EP-Online met "kopieer adres" — LOOKUP, adresZoek() en
// de klik op a[data-lookup] in wws-site.html.
import type { TellingMeta } from "../opslag/types";

export type LinkSoort = "woz" | "ep";

export const OPZOEK_LINKS: Record<LinkSoort, { naam: string; url: string }> = {
  woz: { naam: "WOZ-waardeloket", url: "https://www.wozwaardeloket.nl/" },
  ep: { naam: "EP-online", url: "https://www.ep-online.nl/Energylabel/Search" },
};

/** "1234AB 12 A" (WOZ) of "1234AB 12" (EP-Online, zonder toevoeging); leeg als iets ontbreekt */
export function adresZoek(
  meta: Partial<Pick<TellingMeta, "postcode" | "huisnummer">>,
  soort: LinkSoort,
): string {
  const pc = String(meta.postcode || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  let hn = String(meta.huisnummer || "").trim();
  if (soort === "ep") {
    const d = hn.match(/^\d+/);
    hn = d ? d[0] : "";
  }
  return pc && hn ? pc + " " + hn : "";
}

/** De melding na het kopiëren (of als kopiëren niet lukte) */
export function kopieerMelding(soort: LinkSoort, q: string, gelukt: boolean): string {
  if (!gelukt) return "Typ in het zoekveld: " + q;
  return (
    "‘" +
    q +
    "’ gekopieerd. Plak het in het zoekveld van " +
    OPZOEK_LINKS[soort].naam +
    (soort === "ep" ? " (zonder toevoeging; kies de juiste toevoeging in de resultaten)." : ".")
  );
}

/** Is dit veld automatisch ingevuld en nog niet zelf aangepast? Dan alleen-lezen met "wijzigen" */
export function isVergrendeld(
  meta: Partial<TellingMeta>,
  sleutel: "adres" | "plaats" | "bouwjaar" | "woningtype",
  waarde: unknown,
): boolean {
  const auto = meta["auto"] as Record<string, unknown> | undefined;
  return !!(auto && auto[sleutel] && String(waarde ?? "").trim() !== "");
}
