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
import type { BagStatus } from "./bag";
import {
  RAMING_STANDAARD,
  maakRaming,
  ramingNormen,
  type Raming,
  type RamingNormen,
} from "./verduurzaming";
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
  /** Gezet als iemand het adres uit de analyse heeft gehaald (het blijft in de portefeuille) */
  uitgeslotenOp?: string | null;
  /** Categorie uit Bloxs ("Garagebox"; bij meer objecten "Woning, Garagebox") */
  bloxsCategorie?: string | null;
  /** BAG-gegevens voor de verduurzamingsraming (null = nog niet opgehaald) */
  bag?: { status: BagStatus; oppervlakte: number | null; bouwjaar: number | null } | null;
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
  /** Verduurzamingsraming: bedragen en factoren (zie verduurzaming.ts) */
  raming: RamingNormen;
}

/** Standaardinstellingen; in Normen aan te passen (normen.portefeuille) */
export const PORTEFEUILLE_STANDAARD: PortefeuilleNormen = {
  epPerSeconde: 2,
  bloxsPerSeconde: 1,
  verouderdVoor: "2021-01-01",
  efg: { ingangsdatum: "2029-01-01", klassen: ["E", "F", "G"], geenLabel: "apart" },
  raming: RAMING_STANDAARD,
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
    raming: ramingNormen(n?.raming),
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
  return "Woningen met label " + klassen + " per " + langeDatum(efg.ingangsdatum) + "." + geen;
}

/** Korte achtergrond bij de EFG-regels (vaste tekst; de klassen en datum staan in de omschrijving) */
export const EFG_TOELICHTING =
  "Het kabinet wil dat huurwoningen met energielabel E, F of G vanaf de ingangsdatum niet meer " +
  "verhuurd mogen worden zonder verduurzaming; deze wetgeving is nog niet definitief. Dit " +
  "overzicht toont welke woningen op grond van hun huidige geregistreerde label onder de " +
  "ingestelde regels vallen.";

/**
 * De EFG-omschrijving van een (ook eerder opgeslagen) uitkomst, steeds in de huidige bewoording:
 * opnieuw opgebouwd uit de bewaarde instellingen; alleen zonder instellingen de bewaarde tekst.
 */
export const efgTekst = (u: Pick<AnalyseUitkomst, "efg" | "instellingen">): string =>
  u.instellingen?.efg ? efgOmschrijving(u.instellingen.efg) : u.efg.omschrijving;

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
  /**
   * Woningen zonder geregistreerd label: EP-Online geeft geen label, maar het adres bestaat (of
   * de BAG is nog niet gecontroleerd; dan met een opmerking). Ontbreekt bij analyses van vóór
   * deze indeling.
   */
  zonderLabel?: { adres: string; opmerking: string | null }[];
  teControleren: {
    /**
     * Adres niet gevonden: bij EP-Online en (sinds `zonderLabel` bestaat) ook niet in de BAG.
     * Oudere analyses: alles wat EP-Online niet vond.
     */
    nietGevonden: string[];
    meerdere: string[];
    fout: string[];
    nietOpgehaald: string[];
  };
  /**
   * Categorie uit Bloxs per adres onder "Te controleren" (adres zoals in die lijsten →
   * "Garagebox"). Alleen adressen met een categorie; ontbreekt bij analyses van vóór deze functie.
   */
  categorieen?: Record<string, string>;
  /**
   * Moment waarop de analyse is gedraaid (ISO), gezet bij opslaan of bij de PDF van de actuele
   * analyse; de peildatum in het rapport. Ontbreekt bij analyses van vóór deze functie.
   */
  berekendOp?: string;
  /** Oudste en nieuwste moment van opvragen bij EP-Online */
  epOpgehaaldVan: string | null;
  epOpgehaaldTot: string | null;
  instellingen: { verouderdVoor: string; efg: PortefeuilleNormen["efg"] };
  /** Verduurzamingsraming (ontbreekt bij analyses van vóór deze functie) */
  raming?: Raming;
}

/**
 * Staaf in de grafiek in de waarschuwingskleur (papaya): labels die onder de EFG-regels vallen
 * (volgens de instellingen van die analyse) en "geen label"
 */
export function isWaarschuwingsKlasse(klasse: string, u: Pick<AnalyseUitkomst, "instellingen">) {
  return klasse === "geen label" || (u.instellingen?.efg?.klassen ?? []).includes(klasse);
}

/** De reden bij "Te controleren" voor een adres dat EP-Online en de BAG niet kennen */
export const NIET_GEVONDEN_REDEN = "Adres niet gevonden (EP-Online en BAG)";

/**
 * "Te controleren" zoals getoond. Oudere analyses (zonder `zonderLabel`) weten niet wat de BAG
 * zei; hun niet gevonden adressen staan onder "zonder label" (zie zonderLabelLijst).
 */
export function teControlerenLijsten(
  u: Pick<AnalyseUitkomst, "zonderLabel" | "teControleren">,
): AnalyseUitkomst["teControleren"] {
  return u.zonderLabel ? u.teControleren : { ...u.teControleren, nietGevonden: [] };
}

/** Een adres onder "Te controleren" met de categorie uit Bloxs erachter: "1053 ZD 4 · Garagebox" */
export function metCategorie(u: Pick<AnalyseUitkomst, "categorieen">, adres: string): string {
  const c = u.categorieen?.[adres];
  return c ? adres + " · " + c : adres;
}

/**
 * "Woningen zonder geregistreerd label" zoals getoond, met een opmerking per adres. Oudere
 * analyses: alle adressen zonder geregistreerd label; die EP-Online niet vond krijgen
 * "BAG niet gecontroleerd".
 */
export function zonderLabelLijst(
  u: Pick<AnalyseUitkomst, "zonderLabel" | "teControleren" | "risico">,
): { adres: string; opmerking: string | null }[] {
  if (u.zonderLabel) return u.zonderLabel;
  const nietGevonden = new Set(u.teControleren.nietGevonden);
  // nog oudere analyses hebben de adressen per categorie niet; dan de niet gevonden adressen
  const geen = u.risico.find((r) => r.categorie === "geen_label")?.adressen?.map((a) => a.adres);
  return (geen ?? u.teControleren.nietGevonden).map((adres) => ({
    adres,
    opmerking: nietGevonden.has(adres) ? "BAG niet gecontroleerd" : null,
  }));
}

/** De analyse met het moment waarop hij is gedraaid; een eerder gezet moment blijft staan */
export function metPeilmoment(u: AnalyseUitkomst, nu: string): AnalyseUitkomst {
  return u.berekendOp ? u : { ...u, berekendOp: nu };
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
  // uit de analyse gehaalde adressen tellen nergens mee
  const uniek = adressen.filter((a) => {
    if (a.uitgeslotenOp) return false;
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
  // EP-Online zegt "niet gevonden" bij een adres zonder label én bij een adres dat niet bestaat;
  // de BAG maakt het verschil
  const bestaatNiet = (a: AnalyseAdres) =>
    a.resultaat?.status === "niet_gevonden" && a.bag?.status === "niet_gevonden";
  const zonderLabel = beoordeeld
    .filter((a) => categorie(a.resultaat!, datum, maanden, normen.verouderdVoor) === "geen_label")
    .filter((a) => !bestaatNiet(a))
    .map((a) => ({
      adres: adresTekst(a),
      opmerking:
        a.resultaat!.status !== "niet_gevonden"
          ? null
          : !a.bag
            ? "BAG nog niet opgehaald"
            : a.bag.status === "fout"
              ? "BAG-controle mislukt"
              : null,
    }))
    .sort((x, y) => sorteer(x.adres, y.adres));
  const gesorteerd = (r: AdresRegel[] | undefined) =>
    [...(r ?? [])].sort((x, y) => sorteer(x.adres, y.adres));
  const teControleren: AnalyseUitkomst["teControleren"] = {
    nietGevonden: lijst(bestaatNiet),
    meerdere: lijst((a) => a.resultaat?.status === "meerdere"),
    fout: lijst((a) => a.resultaat?.status === "fout"),
    nietOpgehaald: lijst((a) => !a.resultaat),
  };
  const teControlerenSet = new Set(Object.values(teControleren).flat());
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
    zonderLabel,
    teControleren,
    categorieen: Object.fromEntries(
      uniek
        .filter((a) => a.bloxsCategorie && teControlerenSet.has(adresTekst(a)))
        .map((a) => [adresTekst(a), a.bloxsCategorie!]),
    ),
    raming: (() => {
      const r = maakRaming(
        beoordeeld.map((a) => ({
          adres: adresTekst(a),
          klasse: klasseVan(a.resultaat),
          bag: a.bag,
        })),
        normen.raming ?? RAMING_STANDAARD,
        normen.efg.klassen,
      );
      r.regels.sort((x, y) => sorteer(x.adres, y.adres));
      return r;
    })(),
    epOpgehaaldVan: opgehaald[0] ?? null,
    epOpgehaaldTot: opgehaald[opgehaald.length - 1] ?? null,
    instellingen: { verouderdVoor: normen.verouderdVoor, efg: normen.efg },
  };
}
