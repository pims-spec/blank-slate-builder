// Kengetal kleine nieuwbouw COROP (rubriek 11): een zelfstandige woning kleiner dan 40 m², met een
// bouwjaar van 2018 tot en met 2022, in COROP-gebied Groot-Amsterdam of Utrecht, krijgt een hoger
// WOZ-kengetal per m² en valt niet onder de 33%-grens. Gemeente en bouwjaar komen uit PDOK (BAG,
// opzoeken/corop.ts); de m² uit de telling zelf. Zolang de gebruiker het vinkje niet zelf zet, volgt
// het deze beoordeling (ook als de m² later veranderen).
import type { CoropGegevens, WwsInput } from "./types";

export type CoropRegio = "Groot-Amsterdam" | "Utrecht";

/**
 * Gemeentecodes per COROP-gebied, volgens CBS "Gebieden in Nederland 2024" (85755NED). Let op:
 * Zaanstad en Wormerland horen bij de Zaanstreek, niet bij Groot-Amsterdam. Bij een gemeentelijke
 * herindeling hier bijwerken.
 */
export const COROP_GEMEENTEN: Record<CoropRegio, readonly string[]> = {
  "Groot-Amsterdam": [
    "0358", // Aalsmeer
    "0362", // Amstelveen
    "0363", // Amsterdam
    "0384", // Diemen
    "0385", // Edam-Volendam
    "0394", // Haarlemmermeer
    "0415", // Landsmeer
    "0431", // Oostzaan
    "0437", // Ouder-Amstel
    "0439", // Purmerend
    "0451", // Uithoorn
    "0852", // Waterland
  ],
  Utrecht: [
    "0307", // Amersfoort
    "0308", // Baarn
    "0312", // Bunnik
    "0313", // Bunschoten
    "0310", // De Bilt
    "0736", // De Ronde Venen
    "0317", // Eemnes
    "0321", // Houten
    "0353", // IJsselstein
    "0327", // Leusden
    "0331", // Lopik
    "0335", // Montfoort
    "0356", // Nieuwegein
    "0589", // Oudewater
    "0339", // Renswoude
    "0340", // Rhenen
    "0342", // Soest
    "1904", // Stichtse Vecht
    "0344", // Utrecht
    "1581", // Utrechtse Heuvelrug
    "0345", // Veenendaal
    "1961", // Vijfheerenlanden
    "0352", // Wijk bij Duurstede
    "0632", // Woerden
    "0351", // Woudenberg
    "0355", // Zeist
  ],
};

export const KLEIN_COROP_MAX_M2 = 40;
export const KLEIN_COROP_BOUWJAAR = [2018, 2022] as const;

export function coropRegio(gemeentecode: string): CoropRegio | null {
  for (const [regio, codes] of Object.entries(COROP_GEMEENTEN))
    if (codes.includes(gemeentecode)) return regio as CoropRegio;
  return null;
}

export interface CoropBeoordeling {
  aan: boolean;
  /** Reden voor een ! (niet zeker), of null */
  twijfel: string | null;
  /** Wat de app heeft gezien, in één zin */
  uitleg: string;
}

/** Komt de woning in aanmerking? `m2`: vertrekken + overige ruimten uit de telling */
export function beoordeelKleinCorop(g: CoropGegevens, m2: number): CoropBeoordeling {
  const regio = coropRegio(g.gemeentecode);
  const gem = g.gemeente || "Deze gemeente";
  if (!regio)
    return {
      aan: false,
      twijfel: null,
      uitleg: `${gem} ligt niet in COROP Groot-Amsterdam of Utrecht.`,
    };
  const waar = `${gem} (COROP ${regio})`;
  if (!(m2 > 0))
    return { aan: false, twijfel: null, uitleg: `${waar}; vul eerst de oppervlakte in.` };
  if (m2 >= KLEIN_COROP_MAX_M2)
    return {
      aan: false,
      twijfel: null,
      uitleg: `${waar}, maar ${m2} m² is niet kleiner dan ${KLEIN_COROP_MAX_M2} m².`,
    };
  const [van, tot] = KLEIN_COROP_BOUWJAAR;
  if (g.bouwjaar === null)
    return {
      aan: false,
      twijfel: `Het bouwjaar staat niet in de BAG. Controleer of de woning in ${van}–${tot} is gebouwd.`,
      uitleg: `${waar}, ${m2} m², bouwjaar onbekend.`,
    };
  if (g.bouwjaar >= van && g.bouwjaar <= tot)
    return { aan: true, twijfel: null, uitleg: `${waar}, ${m2} m², bouwjaar ${g.bouwjaar} (BAG).` };
  return {
    aan: false,
    twijfel: null,
    uitleg:
      `${waar}, ${m2} m², maar bouwjaar ${g.bouwjaar} (BAG) valt buiten ${van}–${tot}.` +
      (g.bouwjaar < van
        ? ` Is de woning in ${van}–${tot} door ombouw ontstaan (bijv. uit een kantoor)? De BAG noemt dan het bouwjaar van het pand; zet het vinkje dan zelf aan.`
        : ""),
  };
}

/** Of het kengetal geldt: de beoordeling, tenzij de gebruiker het vinkje zelf heeft gezet */
export function kleinCoropActief(woz: WwsInput["woz"], m2: number): boolean {
  return woz.corop && !woz.kleinCoropZelf
    ? beoordeelKleinCorop(woz.corop, m2).aan
    : !!woz.kleinCorop;
}
