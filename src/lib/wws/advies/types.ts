import type { WwsInput, WwsResultaat } from "../types";

export type Haalbaarheid = "eenvoudig" | "gemiddeld" | "lastig";

export type MaatregelKey =
  | "label"
  | "indexKlasse"
  | "verwVertrek"
  | "koeling"
  | "verwOverig"
  | "aanrecht"
  | "keukenExtra"
  | "bad"
  | "toiletHang"
  | "toilet"
  | "wastafel"
  | "sanExtra"
  | "balkon"
  | "aanbel"
  | "laadpaal";

/** Kostenramingen per maatregel (N.kosten in wws-site.html), plus de oppervlakte van een nieuw balkon */
export type KostenKey =
  | "labelStap"
  | "verwVertrek"
  | "koeling"
  | "verwOverig"
  | "aanrecht"
  | "keukenPunt"
  | "bad"
  | "toiletHang"
  | "toilet"
  | "wastafel"
  | "sanPunt"
  | "balkon"
  | "balkonM2"
  | "aanbel"
  | "laadpaal";
export type Kosten = Record<KostenKey, number>;

/** Wat de gebruiker in het adviesvenster instelt (adviesState in wws-site.html). */
export interface AdviesInstellingen {
  kosten: Kosten;
  /** Maatregelen die uit staan (standaard: privé laadpaal) */
  uit: Partial<Record<MaatregelKey, boolean>>;
  /** Extra punten boven de grens van de vrije sector (0–60) */
  marge: number;
  /** Altijd één labelsprong verwerken */
  labelsprong: boolean;
  /** Lastig haalbare maatregelen automatisch meenemen */
  lastig: boolean;
  /** Zelf gekozen maatregelen uit "Alle maatregelen", als "key|omschrijving" */
  forced: string[];
}

/** Past een maatregel toe op (een kopie van) de invoer; muteert y. */
export type Toepassing = (y: WwsInput) => void;

/** Velden die alleen gevuld zijn bij een labelstap uit een geüpload verduurzamingsadvies */
export interface AdviesBron {
  bron?: "advies" | undefined;
  omschrijving?: string[] | undefined;
  kostenMin?: number | undefined;
  kostenMax?: number | undefined;
  besparingMin?: number | undefined;
  besparingMax?: number | undefined;
}

/** Eén mogelijke maatregel vanuit de huidige toestand (candidates() in wws-site.html). */
export interface Kandidaat extends AdviesBron {
  key: MaatregelKey;
  /** Omschrijving */
  o: string;
  /** Kosten */
  c: number;
  /** Puntenwinst (exact, op 2 decimalen) */
  g: number;
  /** Nominale punten (bij voorzieningen per punt) */
  nominal?: number | undefined;
  h: Haalbaarheid;
  /** Toelichting op de haalbaarheid */
  hr: string;
  /** Kosten per punt */
  ratio: number;
  /** ratio × haalbaarheidsfactor: hoe lager, hoe eerder gekozen */
  score: number;
  apply: Toepassing;
}

/** Een stap in de route: alle maatregelen van één soort samen. */
export interface AdviesStap {
  key: MaatregelKey;
  o: string;
  c: number;
  g: number;
  /** Totaal aantal punten na deze stap */
  tot: number;
  h?: Haalbaarheid | undefined;
  hr?: string | undefined;
  /** Bevat een zelf gekozen of vastgezette maatregel */
  forced: boolean;
  applies: Toepassing[];
  /** De losse maatregelen (omschrijvingen) in deze stap */
  delen: string[];
  /** Eenvoudsniveau per onderdeel in `delen` (zelfde volgorde) */
  delenH?: Haalbaarheid[] | undefined;
  bron?: "advies" | undefined;
  omschrijving: string[];
  kostenMin: number;
  kostenMax: number;
  besparingMin: number;
  besparingMax: number;
  /** Alleen bij berekenRoute(): het label na deze stap */
  naarLabel?: string | undefined;
}

/** Uitkomst van berekenAdvies() (adviesState.result in wws-site.html). */
export interface AdviesResultaat {
  start: WwsResultaat;
  eind: WwsResultaat;
  stappen: AdviesStap[];
  /** Alle mogelijke eerste stappen ("Alle maatregelen") */
  los: Kandidaat[];
  /** Invoer na alle stappen */
  input: WwsInput;
  doel: number;
  gehaald: boolean;
  /** Maximaal haalbare punten, ook met lastige maatregelen */
  maxHaalbaar: number;
}

/** Uitkomst van berekenRoute() (berekenRouteVoorDoel() in wws-site.html, voor de advies-PDF). */
export interface RouteResultaat {
  start: WwsResultaat;
  eind: WwsResultaat;
  stappen: AdviesStap[];
  doel: number;
  gehaald: boolean;
  kosten: number;
  input: WwsInput;
  vanLabel: string;
  vanOmschrijving: string;
  origSoort: WwsInput["energie"]["soort"];
}

export interface SelectieResultaat {
  input: WwsInput;
  R: WwsResultaat;
  kosten: number;
  /** Aantal toegepaste stappen */
  n: number;
}
