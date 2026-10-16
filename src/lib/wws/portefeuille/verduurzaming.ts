// Verduurzamingsraming: een grove kostenindicatie om woningen naar minimaal label D en naar C te
// brengen. Per woning: aantal labelstappen × gebruiksoppervlakte (BAG) × € per m² per stap ×
// een factor voor de bouwjaarklasse, met een lage en een hoge prijs (een bandbreedte). Woningen
// zonder geregistreerd label krijgen een aangenomen label op grond van hun bouwjaar.
// De bedragen en factoren stelt een beheerder in bij Normen; zolang dat niet is gebeurd, is er
// geen bedrag (alleen de stappen).
import { LABELS } from "../basis";

export const BOUWJAAR_KLASSEN = ["tot1945", "1945-1974", "1975-1991", "vanaf1992"] as const;
export type BouwjaarKlasse = (typeof BOUWJAAR_KLASSEN)[number];
export const BOUWJAAR_NAMEN: Record<BouwjaarKlasse, string> = {
  tot1945: "Vóór 1945",
  "1945-1974": "1945 – 1974",
  "1975-1991": "1975 – 1991",
  vanaf1992: "1992 en later",
};

export interface RamingNormen {
  /** Een beheerder heeft de bedragen opgeslagen; anders geen bedragen in de raming */
  ingesteld: boolean;
  /** € per m² per labelstap: onder- en bovenkant van de bandbreedte */
  perM2Laag: number;
  perM2Hoog: number;
  /** Factor op de kosten per bouwjaarklasse (1 = geen verschil) */
  factor: Record<BouwjaarKlasse, number>;
  /** Aangenomen label voor een woning zonder geregistreerd label, per bouwjaarklasse */
  aangenomen: Record<BouwjaarKlasse, string>;
}

export const RAMING_STANDAARD: RamingNormen = {
  ingesteld: false,
  perM2Laag: 0,
  perM2Hoog: 0,
  factor: { tot1945: 1, "1945-1974": 1, "1975-1991": 1, vanaf1992: 1 },
  aangenomen: { tot1945: "G", "1945-1974": "G", "1975-1991": "E", vanaf1992: "C" },
};

const bedrag = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
};

/** Opgeslagen instellingen (mogelijk onvolledig of ongeldig) aangevuld met de standaard */
export function ramingNormen(n: Partial<RamingNormen> | null | undefined): RamingNormen {
  const d = RAMING_STANDAARD;
  const laag = bedrag(n?.perM2Laag, 10000) ?? d.perM2Laag;
  const hoog = Math.max(laag, bedrag(n?.perM2Hoog, 10000) ?? d.perM2Hoog);
  const factor = { ...d.factor };
  const aangenomen = { ...d.aangenomen };
  for (const k of BOUWJAAR_KLASSEN) {
    const f = bedrag(n?.factor?.[k], 10);
    if (f !== null && f > 0) factor[k] = f;
    const l = String(n?.aangenomen?.[k] ?? "");
    if ((LABELS as readonly string[]).includes(l)) aangenomen[k] = l;
  }
  return {
    ingesteld: n?.ingesteld === true && hoog > 0,
    perM2Laag: laag,
    perM2Hoog: hoog,
    factor,
    aangenomen,
  };
}

export function bouwjaarKlasse(jaar: number | null | undefined): BouwjaarKlasse | null {
  if (!jaar || !Number.isFinite(jaar)) return null;
  if (jaar < 1945) return "tot1945";
  if (jaar < 1975) return "1945-1974";
  if (jaar < 1992) return "1975-1991";
  return "vanaf1992";
}

/** Aantal labelstappen van `van` naar `naar` (0 als `van` al zo goed of beter is) */
export function labelStappen(van: string, naar: string): number {
  const i = (LABELS as readonly string[]).indexOf(van);
  const j = (LABELS as readonly string[]).indexOf(naar);
  if (i < 0 || j < 0) return 0;
  return Math.max(0, i - j);
}

export interface Bandbreedte {
  laag: number;
  hoog: number;
}

export interface RamingRegel {
  adres: string;
  /** Het label waarmee gerekend is (geregistreerd of aangenomen) */
  label: string | null;
  labelGeschat: boolean;
  bouwjaar: number | null;
  m2: number | null;
  stappenD: number;
  stappenC: number;
  /** null: geen bedrag (bedragen niet ingesteld, of geen oppervlakte uit de BAG) */
  naarD: Bandbreedte | null;
  naarC: Bandbreedte | null;
  /** Waarom er geen bedrag of label is, of leeg */
  opmerking: string;
}

export interface Raming {
  ingesteld: boolean;
  /** Woningen met een label slechter dan C (geregistreerd of aangenomen) */
  regels: RamingRegel[];
  totaalD: Bandbreedte;
  totaalC: Bandbreedte;
  /** Woningen in de lijst zonder bedrag (geen BAG-oppervlakte of geen label te bepalen) */
  zonderBedrag: number;
  /** Beoordeelde woningen waarvan de BAG-gegevens nog niet zijn opgehaald */
  bagNietOpgehaald: number;
}

export interface RamingInvoer {
  adres: string;
  /** Geregistreerde labelklasse, of null (geen label) */
  klasse: string | null;
  bag: { status: string; oppervlakte: number | null; bouwjaar: number | null } | null | undefined;
}

const afronden = (n: number) => Math.round(n / 100) * 100;

function kosten(stappen: number, m2: number, f: number, n: RamingNormen): Bandbreedte {
  return {
    laag: afronden(stappen * m2 * n.perM2Laag * f),
    hoog: afronden(stappen * m2 * n.perM2Hoog * f),
  };
}

/** De raming voor beoordeelde woningen (dubbele adressen en uitgesloten adressen al weggelaten) */
export function maakRaming(woningen: readonly RamingInvoer[], normen: RamingNormen): Raming {
  const regels: RamingRegel[] = [];
  let bagNietOpgehaald = 0;
  for (const w of woningen) {
    if (!w.bag) bagNietOpgehaald++;
    const bouwjaar = w.bag?.bouwjaar ?? null;
    const m2 = w.bag?.oppervlakte ?? null;
    const klasse = bouwjaarKlasse(bouwjaar);
    const label = w.klasse ?? (klasse ? normen.aangenomen[klasse] : null);
    const labelGeschat = !w.klasse && !!label;
    const stappenD = label ? labelStappen(label, "D") : 0;
    const stappenC = label ? labelStappen(label, "C") : 0;
    // alleen woningen die iets moeten (slechter dan C), en woningen zonder label die we niet kunnen
    // inschatten (die staan erbij, zonder bedrag)
    if (label && stappenC === 0) continue;
    let opmerking = "";
    if (!label) opmerking = w.bag ? "Geen label en geen bouwjaar" : "BAG nog niet opgehaald";
    else if (!m2) opmerking = w.bag ? "Geen oppervlakte in de BAG" : "BAG nog niet opgehaald";
    const metBedrag = normen.ingesteld && !!label && !!m2;
    const f = klasse ? normen.factor[klasse] : 1;
    regels.push({
      adres: w.adres,
      label,
      labelGeschat,
      bouwjaar,
      m2,
      stappenD,
      stappenC,
      naarD: metBedrag ? kosten(stappenD, m2!, f, normen) : null,
      naarC: metBedrag ? kosten(stappenC, m2!, f, normen) : null,
      opmerking,
    });
  }
  const som = (k: "naarD" | "naarC") =>
    regels.reduce(
      (s, r) => ({ laag: s.laag + (r[k]?.laag ?? 0), hoog: s.hoog + (r[k]?.hoog ?? 0) }),
      { laag: 0, hoog: 0 },
    );
  return {
    ingesteld: normen.ingesteld,
    regels,
    totaalD: som("naarD"),
    totaalC: som("naarC"),
    zonderBedrag: normen.ingesteld ? regels.filter((r) => !r.naarC).length : regels.length,
    bagNietOpgehaald,
  };
}
