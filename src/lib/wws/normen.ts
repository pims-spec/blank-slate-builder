// Normbedragen, letterlijk overgenomen uit DEFAULT_NORMEN in wws-site.html
// (Beleidsboek Huurcommissie per 1 juli 2026, huurprijstabel per 1 januari 2026).
// Wijzig hier niets met de hand zonder ook wws-site.html bij te werken; de
// vergelijkingstest controleert dat beide gelijk zijn.

export const NORMEN_VERSIE = "HC-2026-07";

/** Maximale kale huur in centen per punt, vanaf huurTabelStart (40) punten */
export const HUURTABEL_2026 =
  "25026,25653,26275,26902,27527,28150,28778,29403,30029,30654,31280,31902,32530,33154,33780,34405,35035,35653,36279,36909,37532,38155,38783,39406,40032,40658,41285,41910,42533,43156,43781,44409,45036,45657,46286,46909,47536,48160,48789,49410,50038,50722,51408,52096,52781,53470,54156,54841,55529,56213,56903,57587,58271,58961,59645,60332,61019,61708,62394,63082,63767,64453,65136,65824,66512,67195,67885,68570,69256,69944,70632,71320,72005,72695,73379,74066,74751,75437,76121,76808,77494,78185,78871,79556,80244,80930,81614,82302,82994,83674,84362,85049,85733,86424,87106,87797,88479,89167,89856,90539,91226,91914,92598,93293,93973,94661,95345,96033,96718,97405,98091,98778,99463,100150,100835,101522,102207,102900,103581,104273,104957,105642,106332,107014,107700,108388,109076,109761,110446,111139,111823,112508,113194,113885,114569,115255,115940,116627,117315,118001,118684,119376,120061,120746,121431,122121,122807,123492,124181,124865,125553,126240,126925,127612,128300,128986,129670,130357,131046,131728,132418,133103,133789,134475,135163,135850,136534,137224,137909,138595,139284,139969,140656,141343,142028,142715,143399,144086,144771,145460,146149,146831,147519,148205,148895,149577,150267,150953,151640,152328,153012,153698,154385,155071,155756,156446,157131,157817,158501,159191,159876,160564,161252,161936,162624,163310,163996,164678,165370,166054,166740";

export const DEFAULT_NORMEN = {
  versie: "HC-2026-07",
  naam: "Beleidsboek WWS zelfstandige woonruimte Huurcommissie (per 1 juli 2026), huurprijstabel per 1 januari 2026",
  oppVertrek: 1,
  oppOverig: 0.75,
  minVertrek: 4,
  minOverig: 2,
  zolderZonderTrap: 5,
  verwVertrek: 2,
  verwOverig: 1,
  verwOverigMax: 4,
  verkoelVertrek: 1,
  verkoelMax: 2,
  energie: {
    "A++++": [62, 58],
    "A+++": [57, 53],
    "A++": [52, 48],
    "A+": [47, 43],
    A: [41, 37],
    B: [34, 30],
    C: [22, 15],
    D: [14, 11],
    E: [-4, -4],
    F: [-9, -9],
    G: [-15, -15],
  },
  energieIndex: [
    [0.6, 52, 48],
    [0.8, 47, 43],
    [1.2, 41, 37],
    [1.4, 34, 30],
    [1.8, 22, 15],
    [2.1, 14, 11],
    [2.4, -4, -4],
    [2.7, -9, -9],
    [999, -15, -15],
  ],
  energieBouwjaar: [
    [2002, 41, 37],
    [2000, 34, 30],
    [1992, 22, 15],
    [1984, 14, 11],
    [1979, -4, -4],
    [1977, -9, -9],
    [0, -15, -15],
  ],
  epv: [32, 28],
  keukenKort: 4,
  keukenLang: 7,
  voorzKeuken: [
    { k: "afzuig", l: "Inbouw afzuiginstallatie", p: 0.75 },
    { k: "kook_ind", g: "kook", l: "Inbouw kookplaat inductie", p: 1.75 },
    { k: "kook_kera", g: "kook", l: "Inbouw kookplaat keramisch", p: 1 },
    { k: "kook_gas", g: "kook", l: "Inbouw kookplaat gas", p: 0.5 },
    { k: "koelkast", l: "Inbouw koelkast", p: 1 },
    { k: "vriezer", l: "Inbouw vrieskast", p: 0.75 },
    { k: "oven", g: "oven", l: "Inbouw oven elektrisch", p: 1 },
    { k: "oven_gas", g: "oven", l: "Inbouw oven gas", p: 0.5 },
    { k: "magnetron", l: "Inbouw magnetron", p: 1 },
    { k: "vaatwasser", l: "Inbouw vaatwasmachine", p: 1.5 },
    {
      k: "kast",
      l: "Extra kastruimte boven het minimum, per 60 cm breed (min. 60 cm hoog)",
      p: 0.75,
      n: true,
    },
    { k: "kraan_een", g: "kraan", l: "Eenhandsmengkraan", p: 0.25 },
    { k: "kraan_thermo", g: "kraan", l: "Thermostatische mengkraan", p: 0.5 },
    { k: "kokend", l: "Kokendwaterfunctie", p: 0.5 },
  ],
  san: {
    toiletStaandApart: 3,
    toiletStaandBad: 2,
    toiletHangApart: 3.75,
    toiletHangBad: 2.75,
    wastafelBad: 1,
    wastafelElders: 1,
    meerpersBad: 1.5,
    meerpersElders: 1.5,
    douche: 4,
    bad: 6,
    badDouche: 7,
  },
  voorzSan: [
    { k: "bubbel", l: "Bubbelfunctie van het bad", p: 1.5, need: "bad" },
    {
      k: "afscheiding",
      l: "Gemonteerde volledige afscheiding van de douche",
      p: 1.25,
      need: "douche",
    },
    { k: "handdoekrad", l: "Handdoekenradiator", p: 0.75, n: true },
    { k: "kastje", l: "Ingebouwd kastje met in- of opgebouwde wastafel", p: 1, n: true },
    { k: "kastruimte", l: "Kastruimte (min. 40 cm breed en hoog)", p: 0.75 },
    { k: "stopcontact", l: "Stopcontact (max. 2 per wastafel)", p: 0.25, n: true },
    { k: "kraan_een", l: "Eenhandsmengkraan", p: 0.25, n: true },
    { k: "kraan_thermo", l: "Thermostatische mengkraan", p: 0.5, n: true },
  ],
  handicapPerPunt: 332,
  buitenAanwezig: 2,
  buitenPerM2: 0.35,
  gemBuitenPerM2: 0.75,
  geenBuiten: -5,
  buitenMax: 15,
  parkeer: {
    I: 9,
    II: 6,
    III: 4,
    laadpaal: 2,
    m2TypeI: 12,
  },
  woz: {
    "2023": [14146, 222, 94],
    "2024": [14543, 229, 97],
    "2025": [15329, 242, 103],
    "2026": [16954, 268, 114],
  },
  wozMinimum: 85806,
  taxatiePct: 85,
  wozCapPct: 33,
  wozMinNieuwbouw: 40,
  nieuwbouwMinPunten: 110,
  zorgPct: 35,
  aanbel: 0.25,
  laadpaal: 2,
  opslag: {
    rijksPct: 35,
    rijksPunten: 50,
    gemprovPct: 15,
    stadsPct: 5,
    nieuwbouwPct: 10,
  },
  gecontroleerd: "2026-09-30",
  grensLaag: 143,
  grensMidden: 186,
  driveMap: "1MQ1rPgBJXohEwPrefWHJs2wezSw8Vqwt",
  huurTabel: HUURTABEL_2026,
  huurTabelStart: 40,
  kosten: {
    labelStap: 7500,
    verwVertrek: 1500,
    koeling: 3500,
    verwOverig: 800,
    aanrecht: 2500,
    keukenPunt: 400,
    bad: 4500,
    toiletHang: 1500,
    toilet: 3000,
    wastafel: 700,
    sanPunt: 400,
    balkon: 12000,
    balkonM2: 4,
    aanbel: 900,
    laadpaal: 2500,
  },
} as const satisfies NormenShape;

export interface VoorzDef {
  k: string;
  l: string;
  p: number;
  g?: string;
  n?: boolean;
  need?: "bad" | "douche";
}

export interface NormenShape {
  versie: string;
  naam: string;
  oppVertrek: number;
  oppOverig: number;
  minVertrek: number;
  minOverig: number;
  zolderZonderTrap: number;
  verwVertrek: number;
  verwOverig: number;
  verwOverigMax: number;
  verkoelVertrek: number;
  verkoelMax: number;
  energie: Record<string, readonly [number, number]>;
  energieIndex: readonly (readonly [number, number, number])[];
  energieBouwjaar: readonly (readonly [number, number, number])[];
  epv: readonly [number, number];
  keukenKort: number;
  keukenLang: number;
  voorzKeuken: readonly VoorzDef[];
  san: {
    toiletStaandApart: number;
    toiletStaandBad: number;
    toiletHangApart: number;
    toiletHangBad: number;
    wastafelBad: number;
    wastafelElders: number;
    meerpersBad: number;
    meerpersElders: number;
    douche: number;
    bad: number;
    badDouche: number;
  };
  voorzSan: readonly VoorzDef[];
  handicapPerPunt: number;
  buitenAanwezig: number;
  buitenPerM2: number;
  gemBuitenPerM2: number;
  geenBuiten: number;
  buitenMax: number;
  parkeer: { I: number; II: number; III: number; laadpaal: number; m2TypeI: number };
  /** Per beschikkingsjaar: [deelfactor A, deelfactor B, deelfactor B kleine nieuwbouw COROP] */
  woz: Record<string, readonly [number, number, number]>;
  wozMinimum: number;
  taxatiePct: number;
  wozCapPct: number;
  wozMinNieuwbouw: number;
  nieuwbouwMinPunten: number;
  zorgPct: number;
  aanbel: number;
  laadpaal: number;
  opslag: {
    rijksPct: number;
    rijksPunten: number;
    gemprovPct: number;
    stadsPct: number;
    nieuwbouwPct: number;
  };
  gecontroleerd: string;
  grensLaag: number;
  grensMidden: number;
  driveMap: string;
  huurTabel: string;
  huurTabelStart: number;
  kosten: Record<string, number>;
}

export type Normen = NormenShape;

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** Zelfde gedrag als mergeNormen() in wws-site.html: opgeslagen normen van een andere versie worden genegeerd (behalve kosten). */
export function mergeNormen(n?: Partial<Normen> | null): Normen {
  const d = clone(DEFAULT_NORMEN) as unknown as Record<string, unknown>;
  if (!n) return d as unknown as Normen;
  if (n.versie !== NORMEN_VERSIE) {
    if (n.kosten) Object.assign(d["kosten"] as object, n.kosten);
    return d as unknown as Normen;
  }
  for (const [k, v] of Object.entries(n)) {
    const cur = d[k];
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      cur &&
      typeof cur === "object" &&
      !Array.isArray(cur)
    )
      Object.assign(cur, v);
    else d[k] = v;
  }
  return d as unknown as Normen;
}
