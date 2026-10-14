// Datamodel van een WWS-telling, één-op-één gelijk aan `input` in wws-site.html,
// zodat het indelings- en verbeteradvies (fase 3) en bestaande JSON-tellingen
// zonder vertaalslag blijven werken. Getalvelden mogen een getal of een
// invoer-string zijn ("12,5", ""); de rekenkern leest ze met `num()`.

export type NumLike = number | string;

export type Woningtype = "eengezins" | "meergezins";

export type VertrekTypeKey =
  | "woonkamer"
  | "keuken"
  | "woonkamer_ok"
  | "slaapkamer"
  | "badkamer"
  | "woonslaap"
  | "slaap_san"
  | "woonslaap_ok"
  | "zolderkamer"
  | "eetkamer"
  | "studeer"
  | "overig";

export type OverigTypeKey =
  | "toilet"
  | "overloop"
  | "hal"
  | "kleine_kamer"
  | "wasruimte"
  | "berging_in"
  | "berging_uit"
  | "garage"
  | "kelder"
  | "zolder"
  | "zolder_notrap"
  | "overig";

export interface Maat {
  l: NumLike;
  b: NumLike;
}

// ---------- voorzieningen per ruimte ----------
export type KeukenVoorzKey =
  | "afzuig"
  | "kook_ind"
  | "kook_kera"
  | "kook_gas"
  | "koelkast"
  | "vriezer"
  | "oven"
  | "oven_gas"
  | "magnetron"
  | "vaatwasser"
  | "kast"
  | "kraan_een"
  | "kraan_thermo"
  | "kokend";

export type SanVoorzKey =
  | "bubbel"
  | "afscheiding"
  | "handdoekrad"
  | "kastje"
  | "kastruimte"
  | "stopcontact"
  | "kraan_een"
  | "kraan_thermo";

/** Vinkje (true/false) of aantal */
export type VoorzWaarde = boolean | NumLike;

export type Aanrecht = "<1" | "1-2" | ">=2";

export interface FacKeuken {
  kind: "keuken";
  /** Overgenomen uit het PvE van de eigenaar, nog niet gecontroleerd */
  uitPve?: boolean;
  keuken: { lengte: Aanrecht; voorz: Partial<Record<KeukenVoorzKey, VoorzWaarde>> };
}
export interface FacBadkamer {
  kind: "badkamer";
  /** Overgenomen uit het PvE van de eigenaar, nog niet gecontroleerd */
  uitPve?: boolean;
  san: {
    toiletStaand: NumLike;
    toiletHang: NumLike;
    wastafel: NumLike;
    meerpers: NumLike;
    douche: NumLike;
    bad: NumLike;
    badDouche: NumLike;
    /** Voldoet aan de eisen voor extra voorzieningen */
    eisenOk: boolean;
    voorz: Partial<Record<SanVoorzKey, VoorzWaarde>>;
  };
}
export interface FacSlaapSan {
  kind: "slaap_san";
  /** Overgenomen uit het PvE van de eigenaar, nog niet gecontroleerd */
  uitPve?: boolean;
  san: { wastafel: NumLike; meerpers: NumLike; douche: NumLike; bad: NumLike; badDouche: NumLike };
}
export interface FacToilet {
  kind: "toilet";
  /** Overgenomen uit het PvE van de eigenaar, nog niet gecontroleerd */
  uitPve?: boolean;
  toilet: { toilet: "geen" | "staand" | "hangend"; fontein: boolean };
}
export interface FacWas {
  kind: "was";
  /** Overgenomen uit het PvE van de eigenaar, nog niet gecontroleerd */
  uitPve?: boolean;
  was: { wastafel: boolean };
}
export type Fac = FacKeuken | FacBadkamer | FacSlaapSan | FacToilet | FacWas;
export type FacKind = Fac["kind"];

export interface Vertrek {
  type: VertrekTypeKey;
  naam?: string;
  m2: NumLike;
  maten?: Maat[];
  verwarmd: boolean;
  verkoeld?: boolean;
  fac?: Fac;
}
export interface OverigeRuimte {
  type: OverigTypeKey;
  naam?: string;
  m2: NumLike;
  maten?: Maat[];
  verwarmd: boolean;
  fac?: Fac;
}

// ---------- overige rubrieken ----------
export type Labelklasse =
  "A++++" | "A+++" | "A++" | "A+" | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "EPV";

export interface Energie {
  /** label = vanaf 2021 (NTA 8800), labelOud = vóór 2015, index = 2015–2021, bouwjaar = geen geldig label */
  soort: "label" | "labelOud" | "index" | "bouwjaar";
  label: Labelklasse | "";
  /** "0" t/m "8" (zie INDEX_KLASSEN) of "EPV"; leeg = niet gekozen */
  indexKlasse: string;
  /** Registratiedatum yyyy-mm-dd */
  datum: string;
  bouwjaar: NumLike;
}

export type BuitenSoort =
  | "balkon"
  | "dakterras"
  | "voorzijtuin"
  | "achtertuin"
  | "loggia"
  | "platje"
  | "terras"
  | "oprit"
  | "fietsenstalling"
  | "fransbalkon"
  | "overig";

export interface BuitenRuimte {
  soort: BuitenSoort;
  groep: "priv" | "gem";
  m2: NumLike;
  maten?: Maat[];
}

/** Eén labelstap uit een geüpload verduurzamingsadvies (input.energieAdvies in wws-site.html) */
export interface EnergieAdviesMaatregel {
  vanLabel: string;
  naarLabel: string;
  omschrijving?: string[];
  kostenMin?: NumLike;
  kostenMax?: NumLike;
  besparingMin?: NumLike;
  besparingMax?: NumLike;
}

/** Geüpload verduurzamingsadvies; het verbeteradvies gebruikt de labelstappen hieruit. */
export interface EnergieAdvies {
  bestand?: string;
  geuploadOp?: string;
  maatregelen?: EnergieAdviesMaatregel[];
}

export type MonumentKeuze = "geen" | "gemprov" | "stads" | "rijks_voor" | "rijks_na";

export interface WwsInput {
  woningtype: Woningtype;
  vertrekken: Vertrek[];
  overig: OverigeRuimte[];
  energie: Energie;
  handicap: { investering: NumLike };
  handicapVanToepassing?: boolean;
  buiten: { gemAdressen: NumLike; ruimten: BuitenRuimte[] };
  gem: {
    adressen: NumLike;
    vertrekken: { type: VertrekTypeKey; naam?: string; m2: NumLike; maten?: Maat[] }[];
    overig: { type: OverigTypeKey; naam?: string; m2: NumLike; maten?: Maat[] }[];
    voorzPunten: NumLike;
    vanToepassing?: boolean;
  };
  parkeer: {
    typeI: NumLike;
    typeII: NumLike;
    typeIII: NumLike;
    adressen: NumLike;
    laadpalen: NumLike;
  };
  woz: {
    soort: "woz" | "taxatie" | "minimum";
    waarde: NumLike;
    /** Beschikkingsjaar; bepaalt de WOZ-kengetallen */
    jaar: string;
    nieuwbouw1519: boolean;
    kleinCorop: boolean;
  };
  bijz: { zorgwoning: boolean; aanbel: boolean; laadpalen: NumLike };
  opslag: {
    /** Leidend in het formulier; `monument` en `contractVoor2024` worden eruit afgeleid */
    keuze: MonumentKeuze;
    monument?: "geen" | "rijks" | "gemprov" | "stads";
    contractVoor2024?: boolean;
    /** Nieuwbouwopslag middensector */
    nieuwbouw: boolean;
  };
  facV?: number;
  /** Geüpload verduurzamingsadvies (nog geen upload in deze app; oude tellingen kunnen het hebben) */
  energieAdvies?: EnergieAdvies;
}

// ---------- uitvoer ----------
export interface Rij {
  /** Rubrieknummer; zorgwoning heeft ook nr 12, rijksmonument (vóór 1 juli 2024) nr 13 */
  nr: number;
  naam: string;
  p: number;
  t: string;
}

export type Segment = "laag" | "midden" | "hoog";

export interface WwsResultaat {
  rows: Rij[];
  totaal: number;
  /** Onafgerond totaal (op centen) */
  exact: number;
  seg: Segment;
  maxHuur: number | null;
  opslagen: [string, number][];
  opslagPct: number;
  maxHuurOpslag: number | null;
  warn: string[];
  oppV: number;
  oppO: number;
  oppVraw: number;
  gOppV: number;
  gOppO: number;
  wozCapActief: boolean;
  wozCapFloor: boolean;
}

export interface CalcOpties {
  /** Datum waartegen de 10-jaarsgeldigheid van label/index wordt getoetst. Default: nu (zoals wws-site.html). */
  peildatum?: Date;
}
