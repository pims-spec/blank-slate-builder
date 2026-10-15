// Haalt persoonsgegevens uit tekst die naar Claude gaat (verduurzamingsadvies, toelichting bij
// een plattegrond). Vermindert het risico, maar garandeert niets: een naam van een bewoner in
// een document die niet in de telling staat, blijft staan.
import type { TellingMeta } from "../opslag/types";

const WEG = "[weggelaten]";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Algemene patronen; ook op de server toegepast */
export function verwijderPatronen(tekst: string): string {
  return (
    tekst
      // e-mailadressen
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, WEG)
      // IBAN (NL en algemeen), met of zonder spaties
      .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/g, WEG)
      // Nederlandse postcode (hoofdletters; geen eenheden als "3750 MM"). De postcode van de
      // telling zelf haalt anonimiseer() ook in kleine letters weg.
      .replace(/\b[1-9]\d{3}\s?(?!MM|CM|DM|KM|KG|KW|WH|M2|M3)[A-Z]{2}\b/g, WEG)
      // telefoonnummers: +31 / 0031 / 06 / 0xx met 9 cijfers, met spaties of streepjes
      .replace(/(?:\+31|0031|\b0)[\s-]?(?:\d[\s-]?){9}\b/g, WEG)
  );
}

/** Verwijdert de bekende gegevens van de telling zelf, plus de algemene patronen */
export function anonimiseer(
  tekst: string,
  meta: Partial<
    Pick<TellingMeta, "naam" | "adres" | "huisnummer" | "postcode" | "plaats" | "opsteller">
  >,
): string {
  let t = tekst;
  const woorden = [meta.naam, meta.adres, meta.plaats, meta.opsteller]
    .map((w) => String(w ?? "").trim())
    .filter((w) => w.length >= 3)
    // langste eerst, zodat "Lange Nieuwstraat" vóór "Lange" gaat
    .sort((a, b) => b.length - a.length);
  for (const w of woorden) t = t.replace(new RegExp(escape(w), "gi"), WEG);
  const pc = String(meta.postcode ?? "").replace(/\s+/g, "");
  if (/^\d{4}[A-Za-z]{2}$/.test(pc))
    t = t.replace(new RegExp(pc.slice(0, 4) + "\\s?" + pc.slice(4), "gi"), WEG);
  // straat + huisnummer samen (een los huisnummer is te algemeen om weg te halen)
  const hn = String(meta.huisnummer ?? "").trim();
  if (meta.adres && hn)
    t = t.replace(new RegExp(escape(WEG) + "\\s*" + escape(hn) + "\\b", "gi"), WEG);
  return verwijderPatronen(t);
}
