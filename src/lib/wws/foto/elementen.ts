// De elementen die de fotobeoordeling van een keuken of badkamer zoekt, met per element wat
// zichtbaar bewijs is. De sleutels volgen de telling (KeukenVoorzKey, SanVoorzKey en de
// sanitairvelden van FacBadkamer); groepen met een keuze (kookplaat, oven, kraan in de keuken,
// toilet) zijn één element met een "soort".

export type FotoRuimte = "keuken" | "badkamer";

export interface FotoElement {
  sleutel: string;
  naam: string;
  /** Wat op een foto als bewijs telt (voor de instructie) */
  kenmerken: string;
  /** Mogelijke soorten; zonder: geen soort */
  soorten?: readonly string[];
  /** Het aantal is van belang (anders alleen aanwezig of niet) */
  telbaar?: boolean;
  /** Telt alleen als het is ingebouwd; vrijstaand wordt gemeld maar telt niet */
  inbouw?: boolean;
}

export const KEUKEN_ELEMENTEN: readonly FotoElement[] = [
  {
    sleutel: "aanrecht",
    naam: "Aanrecht (lengte)",
    kenmerken:
      "Schat de lengte van het aanrechtblad. Soort: kleiner dan 1 m, 1 tot 2 m, of 2 m of meer.",
    soorten: ["<1", "1-2", ">=2"],
  },
  {
    sleutel: "afzuig",
    naam: "Inbouw afzuiginstallatie",
    kenmerken:
      "Afzuigkap boven de kookplaat die in een kast, de wand of het plafond is ingebouwd, of een in de kookplaat geïntegreerde afzuiging. Een losse, niet aangesloten kap telt niet.",
    inbouw: true,
  },
  {
    sleutel: "kookplaat",
    naam: "Inbouw kookplaat",
    kenmerken:
      "Kookplaat die in het aanrechtblad is ingelaten. Inductie: glad zwart glas met kookzones, vaak met aanraakbediening en zonder zichtbare spiralen. Keramisch: glas met zichtbare (rode) ringen of spiralen. Gas: pitten met pannendragers en knoppen. Een losse tafelkookplaat is vrijstaand.",
    soorten: ["inductie", "keramisch", "gas"],
    inbouw: true,
  },
  {
    sleutel: "koelkast",
    naam: "Inbouw koelkast",
    kenmerken:
      "Koelkast in een kastenwand of onder het aanrecht, achter een front dat gelijk is aan de keukenkastjes, of een ingebouwde koelkast met eigen deur in een nis. Aanwijzingen voor een geïntegreerde koelkast: een hoge kast met een of twee fronten waarvan de greep anders of op een andere hoogte zit, een ventilatierooster in de plint of boven de kast. Een vrijstaande koelkast (met zijkanten en bovenkant zichtbaar, niet in een kast) is vrijstaand.",
    inbouw: true,
  },
  {
    sleutel: "vriezer",
    naam: "Inbouw vrieskast",
    kenmerken:
      "Vrieskast of diepvriesladen in de kastenwand of onder het aanrecht. Een vriesvak binnen de koelkast telt niet als vrieskast. Aanwijzingen: een apart front of lades onder het koelkastfront in dezelfde hoge kast. Een vrijstaande vriezer is vrijstaand.",
    inbouw: true,
  },
  {
    sleutel: "oven",
    naam: "Inbouw oven",
    kenmerken:
      "Oven ingebouwd in een kast of onder de kookplaat (glazen deur met greep, bedieningspaneel). Elektrisch tenzij gasknoppen of een gasaansluiting duidelijk zichtbaar zijn. Een combimagnetron in een kast telt als oven of magnetron, niet allebei; kies wat het meest zichtbaar is.",
    soorten: ["elektrisch", "gas"],
    inbouw: true,
  },
  {
    sleutel: "magnetron",
    naam: "Inbouw magnetron",
    kenmerken:
      "Magnetron ingebouwd in een kast of nis (alleen het front zichtbaar). Een magnetron die los op het aanrecht staat is vrijstaand.",
    inbouw: true,
  },
  {
    sleutel: "vaatwasser",
    naam: "Inbouw vaatwasmachine",
    kenmerken:
      "Vaatwasser onder het aanrecht. Zichtbaar: een eigen front met bedieningspaneel. Volledig geïntegreerd achter een keukenfront: aanwijzingen zijn een front van ca. 60 cm breed (soms 45 cm) zonder plintonderbreking of met een eigen plintstuk, een greep die hoger of anders geplaatst is dan bij de kastjes ernaast, het ontbreken van een scharnierzijde/naad zoals bij de andere deuren, een bedieningsrand aan de bovenkant van het front, en de plaats direct naast de spoelbak. Eén aanwijzing alleen is niet genoeg voor 'aanwezig'.",
    inbouw: true,
  },
  {
    sleutel: "kast",
    naam: "Extra kastruimte (per 60 cm breed, min. 60 cm hoog)",
    kenmerken:
      "Tel de keukenkastelementen (onder- en bovenkasten, hoge kasten) van ca. 60 cm breed die géén apparaat of de spoelbak bevatten. Geef het aantal als schatting; deze telling wordt altijd door de gebruiker nagekeken.",
    telbaar: true,
  },
  {
    sleutel: "kraan",
    naam: "Mengkraan",
    kenmerken:
      "Kraan bij de spoelbak. Eenhands: één hendel voor warm en koud. Thermostatisch: draaiknop met temperatuurschaal (zeldzaam in keukens). Twee aparte knoppen voor warm en koud telt niet.",
    soorten: ["eenhands", "thermostatisch"],
  },
  {
    sleutel: "kokend",
    naam: "Kokendwaterfunctie",
    kenmerken:
      "Kokendwaterkraan: vaak een extra hendel of knop met veiligheidsvergrendeling, of een aparte kraan, met een boiler in de onderkast als die open staat.",
  },
];

export const BADKAMER_ELEMENTEN: readonly FotoElement[] = [
  {
    sleutel: "toilet",
    naam: "Toilet",
    kenmerken:
      "Toilet in deze ruimte. Hangend: aan de wand, vloer eronder vrij. Staand: pot op de vloer.",
    soorten: ["staand", "hangend"],
    telbaar: true,
  },
  {
    sleutel: "wastafel",
    naam: "Wastafel (eenpersoons)",
    kenmerken: "Wastafel met één kraan.",
    telbaar: true,
  },
  {
    sleutel: "meerpers",
    naam: "Meerpersoonswastafel",
    kenmerken: "Brede wastafel met twee kranen (twee personen tegelijk).",
    telbaar: true,
  },
  {
    sleutel: "douche",
    naam: "Douche",
    kenmerken: "Douche met douchekop en afvoer, los van een bad.",
    telbaar: true,
  },
  {
    sleutel: "bad",
    naam: "Bad",
    kenmerken: "Ligbad zonder douche erboven.",
    telbaar: true,
  },
  {
    sleutel: "badDouche",
    naam: "Bad met douche",
    kenmerken: "Ligbad met een douchekop erboven of erbij (bad en douche in één).",
    telbaar: true,
  },
  {
    sleutel: "bubbel",
    naam: "Bubbelfunctie van het bad",
    kenmerken: "Whirlpool- of bubbelbad: spuitmonden in de badwand, bedieningsknop op de rand.",
  },
  {
    sleutel: "afscheiding",
    naam: "Gemonteerde volledige afscheiding van de douche",
    kenmerken:
      "Vast gemonteerde glazen wand of deuren die de douche volledig afscheiden. Een douchegordijn telt niet; een enkele glazen wand (inloopdouche) is geen volledige afscheiding.",
  },
  {
    sleutel: "handdoekrad",
    naam: "Handdoekenradiator",
    kenmerken: "Radiator met horizontale buizen (ladder) voor handdoeken, aan de wand.",
    telbaar: true,
  },
  {
    sleutel: "kastje",
    naam: "Ingebouwd kastje met in- of opgebouwde wastafel",
    kenmerken: "Wastafelmeubel: een kast onder de wastafel waar de wastafel in of op zit.",
    telbaar: true,
  },
  {
    sleutel: "kastruimte",
    naam: "Kastruimte (min. 40 cm breed en hoog)",
    kenmerken:
      "Een vaste kast in de badkamer van minimaal 40 x 40 cm (spiegelkast, hoge kast). Het kastje onder de wastafel telt hier niet; dat is het wastafelkastje.",
  },
  {
    sleutel: "stopcontact",
    naam: "Stopcontact",
    kenmerken: "Stopcontacten in de badkamer, ook in een spiegelkast. Tel ze.",
    telbaar: true,
  },
  {
    sleutel: "kraan_een",
    naam: "Eenhandsmengkraan",
    kenmerken: "Kraan met één hendel voor warm en koud (wastafel, douche of bad). Tel ze.",
    telbaar: true,
  },
  {
    sleutel: "kraan_thermo",
    naam: "Thermostatische mengkraan",
    kenmerken: "Kraan met een draaiknop met temperatuurschaal (meestal bij douche of bad). Tel ze.",
    telbaar: true,
  },
];

export const ELEMENTEN: Record<FotoRuimte, readonly FotoElement[]> = {
  keuken: KEUKEN_ELEMENTEN,
  badkamer: BADKAMER_ELEMENTEN,
};
