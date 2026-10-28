// Een ingeladen Huurprijscheck aanvullen met wat de PDF niet geeft: de registratiedatum van het
// energielabel (EP-Online), het bouwjaar (BAG), de COROP-gegevens (PDOK) en de monumentstatus
// (Kadaster en RCE). De Huurprijscheck blijft leidend: een ander label uit EP-Online wordt alleen
// overgenomen als de gebruiker dat aanvinkt.
import { INDEX_KLASSEN } from "../basis";
import type { Normen } from "../normen";
import { legeMeta } from "../opslag/doc";
import { adresSleutel, monumentKeuzeVoor } from "../opzoeken/automatisch";
import { epAdresVelden, epToepassen, type EpLabel } from "../opzoeken/eponline";
import type { MonumentStatus } from "../opzoeken/monument";
import type { CoropGegevens, Energie, MonumentKeuze } from "../types";
import type { HpcUitkomst } from "./huurprijscheck";

type Ingeladen = Extract<HpcUitkomst, { ok: true }>;

/** Wat er is opgehaald; null = niet gevonden of niet gelukt (het scherm meldt waarom) */
export interface Bronnen {
  label: EpLabel | null;
  monument: MonumentStatus | null;
  corop: CoropGegevens | null;
}

export interface LabelVerschil {
  huurprijscheck: string;
  epOnline: string;
}

export interface Aanvulling {
  meta: Ingeladen["meta"] & { bouwjaar?: string };
  input: Ingeladen["input"];
  /** De meldingen van het inlezen, bijgewerkt (de labelmelding vervalt als de datum er is) */
  meldingen: string[];
  /** Wat er is aangevuld, voor het groene vlak */
  aangevuld: string[];
  /** EP-Online geeft iets anders dan de Huurprijscheck; null = gelijk of niets gevonden */
  labelVerschil: LabelVerschil | null;
}

const datumNl = (iso: string) => (iso ? iso.split("-").reverse().join("-") : "");

/** "Label B", "energie-index 1,2 < EI ≤ 1,4" of "geen geldig label (bouwjaar 1925)" */
export function energieTekst(e: Energie): string {
  const d = e.datum ? ", geregistreerd " + datumNl(e.datum) : "";
  if ((e.soort === "label" || e.soort === "labelOud") && e.label) return "Label " + e.label + d;
  if (e.soort === "index" && e.indexKlasse !== "")
    return "energie-index " + (INDEX_KLASSEN[+e.indexKlasse] ?? e.indexKlasse) + d;
  return "geen geldig label" + (String(e.bouwjaar ?? "") ? " (bouwjaar " + e.bouwjaar + ")" : "");
}

/** Klasse in de bouwjaartabel (alleen gelijk/ongelijk is van belang) */
const bouwjaarKlasse = (N: Normen, bj: unknown) => {
  const j = Math.trunc(Number(bj)) || 0;
  return j > 0 ? N.energieBouwjaar.findIndex((x) => j >= x[0]) : -1;
};

/** Levert de energie dezelfde punten op? Label en index op klasse, bouwjaar op de bouwjaarklasse */
function zelfdeEnergie(a: Energie, b: Energie, N: Normen): boolean {
  const label = (e: Energie) => e.soort === "label" || e.soort === "labelOud";
  if (label(a) && label(b)) return a.label === b.label;
  if (a.soort === "index" && b.soort === "index") return a.indexKlasse === b.indexKlasse;
  if (a.soort === "bouwjaar" && b.soort === "bouwjaar")
    return bouwjaarKlasse(N, a.bouwjaar) === bouwjaarKlasse(N, b.bouwjaar);
  return false;
}

const MONUMENT_NAAM: Record<MonumentKeuze, string> = {
  geen: "geen monument",
  gemprov: "gemeentelijk of provinciaal monument",
  stads: "beschermd stads- of dorpsgezicht",
  rijks_voor: "rijksmonument",
  rijks_na: "rijksmonument",
};

/**
 * Vult de ingeladen telling aan met de opgehaalde gegevens. `epLabelGebruiken`: bij een verschil
 * het label (of bouwjaar) uit EP-Online nemen in plaats van dat van de Huurprijscheck.
 */
export function aanvullenUitBronnen(
  u: Ingeladen,
  b: Bronnen,
  N: Normen,
  epLabelGebruiken: boolean,
  vandaag = new Date(),
): Aanvulling {
  const input = structuredClone(u.input);
  const meta: Aanvulling["meta"] = { ...u.meta };
  let meldingen = [...u.meldingen];
  const aangevuld: string[] = [];
  let labelVerschil: LabelVerschil | null = null;
  const bagBouwjaar = b.corop?.bouwjaar ?? null;

  // ---------- energie ----------
  const hc = input.energie;
  let ep: Energie | null = null;
  if (b.label) {
    ep = epToepassen(input, { ...legeMeta(), ...meta }, b.label, vandaag).input.energie;
    // zonder geldig label geeft EP-Online soms geen bouwjaar: dan dat van de BAG
    if (ep.soort === "bouwjaar" && !String(ep.bouwjaar ?? "") && bagBouwjaar)
      ep = { ...ep, bouwjaar: bagBouwjaar };
  } else if (bagBouwjaar && hc.soort === "bouwjaar") {
    // geen label in EP-Online: het werkelijke bouwjaar uit de BAG
    ep = { ...hc, bouwjaar: bagBouwjaar };
  }
  if (ep) {
    if (zelfdeEnergie(hc, ep, N)) {
      const metLabel = ep.soort !== "bouwjaar";
      input.energie = {
        ...hc,
        soort: ep.soort,
        datum: metLabel ? ep.datum || hc.datum : hc.datum,
        bouwjaar: ep.bouwjaar || hc.bouwjaar,
      };
      if (metLabel && input.energie.datum) {
        meldingen = meldingen.filter((m) => !/zonder registratiedatum/.test(m));
        aangevuld.push("Energielabel: " + energieTekst(input.energie) + " (EP-Online).");
      } else if (hc.soort === "bouwjaar" && String(ep.bouwjaar) !== String(hc.bouwjaar))
        aangevuld.push("Bouwjaar voor de energiepunten: " + ep.bouwjaar + " (BAG).");
    } else {
      labelVerschil = { huurprijscheck: energieTekst(hc), epOnline: energieTekst(ep) };
      if (epLabelGebruiken) input.energie = ep;
    }
  }

  // ---------- bouwjaar en COROP ----------
  const bj = bagBouwjaar ?? (b.label?.Bouwjaar != null ? Number(b.label.Bouwjaar) || null : null);
  if (bj && !meta.bouwjaar) {
    meta.bouwjaar = String(bj);
    aangevuld.push("Bouwjaar " + bj + (bagBouwjaar ? " (BAG)." : " (EP-Online)."));
  }
  if (b.corop) {
    input.woz.corop = { ...b.corop, adres: adresSleutel(epAdresVelden(meta)) };
    aangevuld.push("Gemeente " + b.corop.gemeente + " (voor het kengetal kleine nieuwbouw COROP).");
  }

  // ---------- monument ----------
  if (b.monument) {
    const keuze = monumentKeuzeVoor(b.monument);
    const huidig = input.opslag.keuze;
    if (keuze && huidig === "geen") {
      input.opslag.keuze = keuze;
      meldingen.push(
        "De Huurprijscheck rekende zonder monumentstatus; volgens het Kadaster/RCE is dit een " +
          MONUMENT_NAAM[keuze] +
          ". Dat is ingevuld; controleer het." +
          (keuze === "rijks_na" ? " Gekozen is ‘huurcontract na 1 juli 2024’." : ""),
      );
    } else if (
      keuze &&
      keuze !== huidig &&
      !(keuze.startsWith("rijks") && huidig.startsWith("rijks"))
    )
      meldingen.push(
        "Volgens het Kadaster/RCE is dit een " +
          MONUMENT_NAAM[keuze] +
          "; de Huurprijscheck noemt " +
          MONUMENT_NAAM[huidig] +
          ". De Huurprijscheck is overgenomen.",
      );
    else if (!keuze && huidig !== "geen")
      meldingen.push(
        "Het Kadaster/RCE vond geen monumentstatus; de Huurprijscheck noemt " +
          MONUMENT_NAAM[huidig] +
          ". De Huurprijscheck is overgenomen.",
      );
    else
      aangevuld.push("Monumentstatus gecontroleerd: " + MONUMENT_NAAM[huidig] + " (Kadaster/RCE).");
  }

  return { meta, input, meldingen, aangevuld, labelVerschil };
}
