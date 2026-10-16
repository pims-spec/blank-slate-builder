// Foutcodes van de Bloxs-laag en de teksten erbij (ook in de browser te gebruiken: geen
// server-code, geen geheimen).

export type BloxsFout =
  | "niet_ingesteld"
  | "url_ongeldig"
  | "geweigerd"
  | "niet_gevonden"
  | "te_veel_verzoeken"
  | "niet_bereikbaar"
  | "onverwacht_antwoord";

/** Tekst voor de beheerder bij een foutcode */
export function bloxsFoutTekst(f: BloxsFout): string {
  switch (f) {
    case "niet_ingesteld":
      return "De Bloxs-secrets zijn niet (allemaal) ingesteld.";
    case "url_ongeldig":
      return "BLOXS_ODATA_URL is geen geldig https-adres van Bloxs (…bloxs.io/odatafeed).";
    case "geweigerd":
      return "Bloxs weigert de inloggegevens, of het account heeft geen toegang tot de OData-feed.";
    case "niet_gevonden":
      return "De OData-feed is niet gevonden op dit adres.";
    case "te_veel_verzoeken":
      return "Bloxs meldt te veel verzoeken. Probeer het over een minuut opnieuw.";
    case "niet_bereikbaar":
      return "Bloxs is niet bereikbaar.";
    case "onverwacht_antwoord":
      return "Bloxs gaf een onverwacht antwoord.";
  }
}
