// Uitlegteksten bij de rubrieken en vinkjes (het (i)-icoon) — letterlijk uit wws-site.html
// (rub(nr, titel, inhoud, uitleg) en fld(…, {info})). Alleen tekst; geen rekenregels.

export const RUBRIEK_UITLEG: Record<string, string> = {
  "1": "1 punt per m². Een deel aftrekken (bijv. een meterkast van 30 × 60 cm) doe je met een minteken: −0,30 × 0,60. Een vertrek is minimaal 4 m², over 80% van de langste zijde minimaal 1,50 m breed, heeft een raam naar buiten, ventilatie, een stopcontact en een lichtpunt. Een keuken, badkamer of doucheruimte is altijd een vertrek. Meet binnenmaats op 1,50 m hoogte; de m² worden per rubriek opgeteld en afgerond op hele m². Vink ‘verkoeld’ alleen aan als de koeling aan de eisen van het beleidsboek voldoet. Bij een keuken, badkamer of slaapkamer met sanitair klappen de voorzieningen van die ruimte direct eronder uit.",
  "2": "0,75 punt per m², minimaal 2 m². Een zolder zonder vaste trap krijgt 5 punten aftrek (nooit meer dan de zolder zelf waard is). Verkeersruimten krijgen geen punten voor de oppervlakte, maar wel voor verwarming. Bij een toiletruimte of wasruimte vul je het toilet, de fontein of de wastafel direct onder de ruimte in.",
  "4": "Net als in de Huurprijscheck van de Huurcommissie: een ouder energielabel geregistreerd vóór 1 januari 2015, een energie-index geregistreerd tussen 2015 en 2021 (met ‘geldig voor WWS’), of een energielabel vanaf 1 januari 2021. Registraties zijn 10 jaar geldig. Is het label verlopen of is er geen label (ook een vereenvoudigd label uit 2015-2020 telt niet), kies dan Bouwjaar. Bij een rijks-, provinciaal of gemeentelijk monument gelden geen minpunten.",
  "7": "1 punt per € 332 netto-investering (na aftrek van subsidie en eigen bijdrage), voor gedeeltelijk gesubsidieerde voorzieningen aangebracht op of na 1 april 1994.",
  "8": "Privé: 2 punten plus 0,35 per m² (tuin, balkon, terras, loggia, eigen oprit). Gemeenschappelijk: 0,75 per m² gedeeld door het aantal adressen. Samen maximaal 15 punten; zonder enige buitenruimte 5 punten aftrek. Een Frans balkon telt niet.",
  "9": "Dezelfde indeling en benamingen als bij Vertrekken en Overige ruimten (rubriek 1 en 2), maar dan voor gedeelde ruimten. Alle punten van de gemeenschappelijke ruimten worden gedeeld door het aantal adressen met exclusieve toegang en gebruiksrecht.",
  "10": "Alleen afgebakende plekken van minimaal 12 m² die bij het complex horen en een onroerende aanhorigheid zijn. Punten worden gedeeld door het aantal adressen.",
  "11": "Onderdeel I: WOZ-waarde / € 16.954. Onderdeel II: WOZ-waarde / m² (vertrekken, overige ruimten en parkeerplekken type I) / € 268 (beschikking 2026). Bij 187 punten of meer is de WOZ maximaal 33% van het totaal; zakt de woning daardoor onder de 187, dan geldt 186 punten.",
  "12": "Een zorgwoning moet voldoen aan alle voorwaarden van het beleidsboek (drempelloos, alarmering, gemeenschappelijke ruimten voor maaltijden of recreatie).",
  "13": "Opslagen verhogen de maximale huurprijs, niet het aantal punten. Een opslag maakt van een gereguleerde woning dus geen vrijesectorwoning. Rijksmonument 35%, gemeentelijk of provinciaal monument 15%, beschermd stads- of dorpsgezicht 5%, nieuwbouw in de middensector 10%. Alleen bij een rijksmonument met een huurovereenkomst van vóór 1 juli 2024 gelden 50 punten.",
};

/** Uitleg bij een vinkje (WOZ-rubriek) */
export const VINK_UITLEG = {
  nieuwbouw1519:
    "Vink dit aan als de woning tussen 1 januari 2015 en 1 juli 2019 als nieuwbouw is opgeleverd, of in die periode een hoogniveaurenovatie heeft ondergaan, waarbij het aantal WWS-punten vóór de renovatie (exclusief WOZ-punten) minimaal 40 bedroeg. De minimum-WOZ-waardering wordt dan verhoogd.",
  kleinCorop:
    "Vink dit aan bij een zelfstandige nieuwbouwwoning kleiner dan 40 m², gebouwd tussen 2018 en 2022, gelegen in de COROP-regio Groot-Amsterdam of Utrecht. Hiervoor geldt een hoger WOZ-kengetal per m².",
} as const;
