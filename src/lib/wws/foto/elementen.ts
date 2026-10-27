// De elementen die de fotobeoordeling van een keuken, badkamer of toiletruimte zoekt, met per element wat
// zichtbaar bewijs is. De sleutels volgen de telling (KeukenVoorzKey, SanVoorzKey en de
// sanitairvelden van FacBadkamer en FacToilet); groepen met een keuze (kookplaat, oven, kraan in de keuken,
// toilet) zijn één element met een "soort".

export type FotoRuimte = "keuken" | "badkamer" | "toilet";

export const RUIMTE_NAAM: Record<FotoRuimte, string> = {
  keuken: "keuken",
  badkamer: "badkamer",
  toilet: "toiletruimte",
};

export interface FotoElement {
  sleutel: string;
  naam: string;
  /** Wat op een foto als bewijs telt (voor de instructie) */
  kenmerken: string;
  /** Mogelijke soorten; zonder: geen soort */
  soorten?: readonly string[];
  /** Het aantal is van belang (anders alleen aanwezig of niet) */
  telbaar?: boolean;
  /** Het "aantal" is een breedte in cm (keukenkasten), geen stuks */
  inCm?: boolean;
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
      "Oven ingebouwd in een kast of onder de kookplaat (glazen deur met greep, bedieningspaneel). Elektrisch tenzij gasknoppen of een gasaansluiting duidelijk zichtbaar zijn. Een ingebouwde combimagnetron (oven met magnetronfunctie, vaak een compact apparaat van ca. 45 cm hoog) telt als oven én als magnetron: zet dan bij allebei dezelfde status.",
    soorten: ["elektrisch", "gas"],
    inbouw: true,
  },
  {
    sleutel: "magnetron",
    naam: "Inbouw magnetron",
    kenmerken:
      "Magnetron ingebouwd in een kast of nis (alleen het front zichtbaar), ook een ingebouwde combimagnetron (telt als oven én als magnetron). Een magnetron die los op het aanrecht staat is vrijstaand.",
    inbouw: true,
  },
  {
    sleutel: "vaatwasser",
    naam: "Inbouw vaatwasmachine",
    kenmerken:
      "Vaatwasser onder het aanrecht. Zichtbaar: een eigen front met bedieningspaneel. Volledig geïntegreerd achter een keukenfront: kijk eerst naar de grepen. Een draaideur heeft de greep aan de zijkant (tegenover de scharnieren); een vaatwasser klapt naar beneden open en heeft daarom één greep horizontaal in het midden, bovenaan een hoog front. Een hoog onderkastfront (van plint tot aanrecht, niet opgedeeld) met als enige een gecentreerde greep bovenaan, tussen deuren met de greep aan de zijkant, en direct onder of naast de spoelbak, is doorslaggevend: 'aanwezig'. Laden hebben ook een gecentreerde greep, maar zijn lager en gestapeld; tel die niet. Andere aanwijzingen (samen met de plaats bij de spoelbak 'waarschijnlijk_aanwezig'): een front van ca. 60 cm breed (soms 45 cm) met een eigen plintstuk, het ontbreken van een scharnierzijde of naad zoals bij de andere deuren, een bedieningsrand aan de bovenkant van het front. Bij een greeploze keuken is de greep geen aanwijzing.",
    inbouw: true,
  },
  {
    sleutel: "kast",
    naam: "Keukenkasten (totale breedte)",
    kenmerken:
      "Schat de totale breedte in cm (buitenmaat) van alle keukenkasten die minimaal 60 cm hoog zijn en géén inbouwapparaat of de spoelbak bevatten: onderkasten (ook ladekasten), bovenkasten en hoge kasten. Een hoge kast telt één keer zijn breedte. Gebruik standaardmaten als houvast (veel kasten zijn 30, 40, 45, 50, 60 of 80 cm breed). Tel een kast die op meerdere foto's staat één keer. Geef de breedte in cm als aantal (0 als je geen kasten ziet); de app rekent zelf uit wat boven het minimum valt. Deze schatting wordt altijd door de gebruiker nagekeken.",
    telbaar: true,
    inCm: true,
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
      "Kastruimte in de badkamer: een kast met deuren (spiegelkast, hoge kast) of een open vakkenkast, in beide gevallen minimaal 40 cm breed en 40 cm hoog. Schat de maat aan de hand van tegels, de wastafel of een deur; is de kast duidelijk kleiner, dan telt hij niet. Kun je de maat niet goed schatten, kies dan hoogstens waarschijnlijk_aanwezig. Het kastje onder de wastafel telt hier niet; dat is het wastafelkastje.",
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

export const TOILET_ELEMENTEN: readonly FotoElement[] = [
  {
    sleutel: "toilet",
    naam: "Toilet",
    kenmerken:
      "Toilet in deze ruimte. Hangend: aan de wand, vloer eronder vrij (vaak met inbouwreservoir en drukplaat in de wand). Staand: pot op de vloer.",
    soorten: ["staand", "hangend"],
  },
  {
    sleutel: "fontein",
    naam: "Fontein (handenwasbakje)",
    kenmerken: "Klein wasbakje met kraan in de toiletruimte.",
  },
];

export const ELEMENTEN: Record<FotoRuimte, readonly FotoElement[]> = {
  keuken: KEUKEN_ELEMENTEN,
  badkamer: BADKAMER_ELEMENTEN,
  toilet: TOILET_ELEMENTEN,
};
