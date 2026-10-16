// Portefeuille-analyse energielabels — pure functies. Elke woning valt in precies één
// risicocategorie (hoogste prioriteit eerst), zodat de percentages samen 100% zijn.
//
//   1. geen_label:  niet gevonden bij EP-Online, of gevonden zonder labelklasse
//   2. verlopen:    verloopdatum vóór de analysedatum
//   3. verloopt:    analysedatum ≤ verloopdatum ≤ analysedatum + N maanden
//   4. verouderd:   geldig, maar geregistreerd vóór de grens (standaard 1-1-2021): oud label of
//                   energie-index, nog niet volgens NTA 8800
//   5. in_orde:     geldig label volgens NTA 8800
//
// Verloopdatum = "Geldig tot" van EP-Online, anders registratiedatum + 10 jaar.
// Adressen met meerdere labels (niet eenduidig), een fout of nog geen resultaat tellen niet mee
// in de percentages; ze staan apart, om te controleren.
import { LABELS } from "../basis";
import { adresSleutel, adresTekst, type PortefeuilleAdres } from "./adres";
import { isIsoDatum, langeDatum, plusJaren, plusMaanden } from "./datum";

export type LabelStatus = "gevonden" | "niet_gevonden" | "meerdere" | "fout";

export interface LabelResultaat {
  status: LabelStatus;
  energieklasse: string | null;
  registratiedatum: string | null;
  geldigTot: string | null;
  /** Moment van opvragen bij EP-Online (ISO met tijd) */
  opgehaaldOp: string;
}

export interface AnalyseAdres extends PortefeuilleAdres {
  id: string;
  resultaat: LabelResultaat | null;
  /** Gezet als het adres bij de laatste volledige Bloxs-sync niet meer voorkwam */
  nietInBloxsSinds?: string | null;
}

export type GeenLabelEfg = "apart" | "meetellen" | "negeren";

export interface PortefeuilleNormen {
  /** Maximaal aantal EP-Online-aanvragen per seconde */
  epPerSeconde: number;
  /** Maximaal aantal aanvragen per seconde naar de Bloxs OData-feed (limieten onbekend) */
  bloxsPerSeconde: number;
  /** Geregistreerd vóór deze datum = oude methodiek (verouderd) */
  verouderdVoor: string;
  efg: {
    ingangsdatum: string;
    klassen: string[];
    geenLabel: GeenLabelEfg;
  };
}

/** Standaardinstellingen; in Normen aan te passen (normen.portefeuille) */
export const PORTEFEUILLE_STANDAARD: PortefeuilleNormen = {
  epPerSeconde: 2,
  bloxsPerSeconde: 1,
  verouderdVoor: "2021-01-01",
  efg: { ingangsdatum: "2029-01-01", klassen: ["E", "F", "G"], geenLabel: "apart" },
};

/** Opgeslagen instellingen (mogelijk onvolledig of ongeldig) aangevuld met de standaard */
export function portefeuilleNormen(n: Partial<PortefeuilleNormen> | null | undefined) {
  const d = PORTEFEUILLE_STANDAARD;
  const efg: Partial<PortefeuilleNormen["efg"]> = n?.efg ?? {};
  const ps = Number(n?.epPerSeconde);
  const bs = Number(n?.bloxsPerSeconde);
  return {
    epPerSeconde: ps > 0 && ps <= 10 ? ps : d.epPerSeconde,
    bloxsPerSeconde: bs > 0 && bs <= 5 ? bs : d.bloxsPerSeconde,
    verouderdVoor: isIsoDatum(n?.verouderdVoor) ? n!.verouderdVoor! : d.verouderdVoor,
    efg: {
      ingangsdatum: isIsoDatum(efg.ingangsdatum) ? efg.ingangsdatum : d.efg.ingangsdatum,
      klassen: Array.isArray(efg.klassen)
        ? LABELS.filter((l) => efg.klassen!.includes(l))
        : [...d.efg.klassen],
      geenLabel: (["apart", "meetellen", "negeren"] as const).includes(efg.geenLabel!)
        ? efg.geenLabel!
        : d.efg.geenLabel,
    },
  } satisfies PortefeuilleNormen;
}

export type Categorie = "geen_label" | "verlopen" | "verloopt" | "verouderd" | "in_orde";

export const CATEGORIE_NAMEN: Record<Categorie, string> = {
  geen_label: "Geen geregistreerd label",
  verlopen: "Verlopen label",
  verloopt: "Label verloopt binnenkort",
  verouderd: "Verouderd label (oude methodiek)",
  in_orde: "Geldig label (NTA 8800)",
};
const VOLGORDE: Categorie[] = ["geen_label", "verlopen", "verloopt", "verouderd", "in_orde"];

/** Labelklasse uit EP-Online, of null als die ontbreekt of onbekend is */
export function klasseVan(r: LabelResultaat | null): string | null {
  const k = r?.energieklasse?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  return (LABELS as readonly string[]).includes(k) ? k : null;
}

/** Verloopdatum: "Geldig tot", anders registratiedatum + 10 jaar; null als beide ontbreken */
export function verloopdatum(r: LabelResultaat | null): string | null {
  if (!r) return null;
  if (isIsoDatum(r.geldigTot)) return r.geldigTot;
  if (isIsoDatum(r.registratiedatum)) return plusJaren(r.registratiedatum, 10);
  return null;
}

/** Telt dit adres mee in de percentages? (gevonden of niet gevonden) */
export const isBeoordeeld = (r: LabelResultaat | null) =>
  !!r && (r.status === "gevonden" || r.status === "niet_gevonden");

/**
 * De risicocategorie op `datum` met een venster van `maanden`. Alleen voor beoordeelde adressen.
 * Een label met klasse maar zonder enige datum telt als geldig volgens de klasse-informatie die
 * er is: zonder registratiedatum is "verouderd" niet vast te stellen, dus "in_orde".
 */
export function categorie(
  r: LabelResultaat,
  datum: string,
  maanden: number,
  verouderdVoor: string,
): Categorie {
  if (r.status !== "gevonden" || !klasseVan(r)) return "geen_label";
  const tot = verloopdatum(r);
  if (tot && tot < datum) return "verlopen";
  if (tot && tot <= plusMaanden(datum, maanden)) return "verloopt";
  if (isIsoDatum(r.registratiedatum) && r.registratiedatum < verouderdVoor) return "verouderd";
  return "in_orde";
}

/** Korte, neutrale omschrijving van de EFG-instellingen (geen wettekst) */
export function efgOmschrijving(efg: PortefeuilleNormen["efg"]): string {
  const k = efg.klassen;
  const klassen =
    k.length === 0
      ? "(geen klassen ingesteld)"
      : k.length === 1
        ? k[0]!
        : k.slice(0, -1).join(", ") + " of " + k[k.length - 1];
  const geen =
    efg.geenLabel === "meetellen"
      ? " Woningen zonder geregistreerd label tellen mee."
      : efg.geenLabel === "apart"
        ? " Woningen zonder geregistreerd label staan apart vermeld."
        : "";
  return (
    "Woningen met label " +
    klassen +
    " per " +
    langeDatum(efg.ingangsdatum) +
    " (instelling in Normen; de wettelijke invulling is nog te controleren)." +
    geen
  );
}

const pct = (n: number, van: number) => (van ? Math.round((n / van) * 1000) / 10 : 0);

export interface VerloopRegel {
  adres: string;
  klasse: string;
  registratiedatum: string | null;
  verloopdatum: string;
  status: "verlopen" | "verloopt";
}

export interface EfgRegel {
  adres: string;
  klasse: string | null;
  registratiedatum: string | null;
}

/** Een adres in een doorklik-lijst (staaf of risicocategorie) */
export interface AdresRegel {
  adres: string;
  klasse: string | null;
  registratiedatum: string | null;
  verloopdatum: string | null;
}

export interface AnalyseUitkomst {
  datum: string;
  vensterMaanden: number;
  aantalAdressen: number;
  aantalBeoordeeld: number;
  /** A++++ … G, daarna "geen label"; `adressen` ontbreekt bij analyses van vóór de doorklik */
  perKlasse: { klasse: string; aantal: number; adressen?: AdresRegel[] }[];
  risico: {
    categorie: Categorie;
    naam: string;
    aantal: number;
    pct: number;
    adressen?: AdresRegel[];
  }[];
  /** Verloopt of verliep binnen ±N maanden rond de analysedatum, op verloopdatum */
  verloopLijst: VerloopRegel[];
  efg: {
    omschrijving: string;
    aantal: number;
    pct: number;
    /** Alleen bij geenLabel = "apart" */
    geenLabelApart: number | null;
    woningen: EfgRegel[];
  };
  teControleren: {
    nietGevonden: string[];
    meerdere: string[];
    fout: string[];
    nietOpgehaald: string[];
  };
  /** Oudste en nieuwste moment van opvragen bij EP-Online */
  epOpgehaaldVan: string | null;
  epOpgehaaldTot: string | null;
  instellingen: { verouderdVoor: string; efg: PortefeuilleNormen["efg"] };
}

/** De analyse van een portefeuille op `datum`, met een venster van `maanden` (standaard 3) */
export function analyseer(
  adressen: readonly AnalyseAdres[],
  datum: string,
  maanden: number,
  normen: PortefeuilleNormen,
): AnalyseUitkomst {
  // dubbele adressen tellen één keer (de eerste)
  const gezien = new Set<string>();
  const uniek = adressen.filter((a) => {
    const s = adresSleutel(a);
    if (gezien.has(s)) return false;
    gezien.add(s);
    return true;
  });
  const sorteer = (a: string, b: string) => a.localeCompare(b, "nl", { numeric: true });

  const beoordeeld = uniek.filter((a) => isBeoordeeld(a.resultaat));
  const n = beoordeeld.length;

  const klasseTelling = new Map<string, number>(LABELS.map((l) => [l, 0]));
  let geenLabel = 0;
  const catTelling = new Map<Categorie, number>(VOLGORDE.map((c) => [c, 0]));
  const verloopLijst: VerloopRegel[] = [];
  const efgWoningen: EfgRegel[] = [];
  let efgGeenLabel = 0;
  const van = plusMaanden(datum, -maanden),
    tot = plusMaanden(datum, maanden);

  const perKlasseAdressen = new Map<string, AdresRegel[]>();
  const perCategorieAdressen = new Map<Categorie, AdresRegel[]>();
  const voegToe = <K>(m: Map<K, AdresRegel[]>, k: K, regel: AdresRegel) =>
    m.set(k, [...(m.get(k) ?? []), regel]);

  for (const a of beoordeeld) {
    const r = a.resultaat!;
    const k = klasseVan(r);
    if (k) klasseTelling.set(k, klasseTelling.get(k)! + 1);
    else geenLabel++;
    const c = categorie(r, datum, maanden, normen.verouderdVoor);
    catTelling.set(c, catTelling.get(c)! + 1);

    const vd = k ? verloopdatum(r) : null;
    const regel: AdresRegel = {
      adres: adresTekst(a),
      klasse: k,
      registratiedatum: k && isIsoDatum(r.registratiedatum) ? r.registratiedatum : null,
      verloopdatum: vd,
    };
    voegToe(perKlasseAdressen, k ?? "geen label", regel);
    voegToe(perCategorieAdressen, c, regel);
    if (k && vd && vd >= van && vd <= tot)
      verloopLijst.push({
        adres: adresTekst(a),
        klasse: k,
        registratiedatum: isIsoDatum(r.registratiedatum) ? r.registratiedatum : null,
        verloopdatum: vd,
        status: vd < datum ? "verlopen" : "verloopt",
      });

    if (k && normen.efg.klassen.includes(k))
      efgWoningen.push({ adres: adresTekst(a), klasse: k, registratiedatum: r.registratiedatum });
    else if (!k && normen.efg.geenLabel === "meetellen")
      efgWoningen.push({ adres: adresTekst(a), klasse: null, registratiedatum: null });
    else if (!k) efgGeenLabel++;
  }

  verloopLijst.sort(
    (x, y) => x.verloopdatum.localeCompare(y.verloopdatum) || sorteer(x.adres, y.adres),
  );
  efgWoningen.sort((x, y) => sorteer(x.adres, y.adres));

  const lijst = (f: (a: AnalyseAdres) => boolean) => uniek.filter(f).map(adresTekst).sort(sorteer);
  const gesorteerd = (r: AdresRegel[] | undefined) =>
    [...(r ?? [])].sort((x, y) => sorteer(x.adres, y.adres));
  const opgehaald = uniek
    .map((a) => a.resultaat?.opgehaaldOp)
    .filter((x): x is string => !!x)
    .sort();

  return {
    datum,
    vensterMaanden: maanden,
    aantalAdressen: uniek.length,
    aantalBeoordeeld: n,
    perKlasse: [
      ...LABELS.map((l) => ({
        klasse: l,
        aantal: klasseTelling.get(l)!,
        adressen: gesorteerd(perKlasseAdressen.get(l)),
      })),
      {
        klasse: "geen label",
        aantal: geenLabel,
        adressen: gesorteerd(perKlasseAdressen.get("geen label")),
      },
    ],
    risico: VOLGORDE.map((c) => ({
      categorie: c,
      naam: c === "verloopt" ? "Label verloopt binnen " + maanden + " maanden" : CATEGORIE_NAMEN[c],
      aantal: catTelling.get(c)!,
      pct: pct(catTelling.get(c)!, n),
      adressen: gesorteerd(perCategorieAdressen.get(c)),
    })),
    verloopLijst,
    efg: {
      omschrijving: efgOmschrijving(normen.efg),
      aantal: efgWoningen.length,
      pct: pct(efgWoningen.length, n),
      geenLabelApart: normen.efg.geenLabel === "apart" ? efgGeenLabel : null,
      woningen: efgWoningen,
    },
    teControleren: {
      nietGevonden: lijst((a) => a.resultaat?.status === "niet_gevonden"),
      meerdere: lijst((a) => a.resultaat?.status === "meerdere"),
      fout: lijst((a) => a.resultaat?.status === "fout"),
      nietOpgehaald: lijst((a) => !a.resultaat),
    },
    epOpgehaaldVan: opgehaald[0] ?? null,
    epOpgehaaldTot: opgehaald[opgehaald.length - 1] ?? null,
    instellingen: { verouderdVoor: normen.verouderdVoor, efg: normen.efg },
  };
}
