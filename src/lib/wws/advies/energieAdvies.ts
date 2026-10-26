// Geüpload energieadvies: afwijkend beginlabel en de opties naast elkaar (bewuste afwijkingen van
// de bron). De bron gebruikte een labelstap uit het advies alleen als het beginlabel precies gelijk
// was aan het label in de telling; anders werden de opties zonder melding genegeerd.
//
// Regels:
// - de WWS-punten van de huidige situatie blijven op het geregistreerde label gebaseerd; het label
//   in de telling wordt nooit automatisch gewijzigd;
// - het advieslabel wordt pas het beginpunt van het verbeteradvies na een bevestiging
//   (energieAdvies.uitgangspunt, met wie en wanneer);
// - het eindlabel van een optie bepaalt de punten; het beginlabel alleen het aantal stappen, het
//   niveau en de standaardkosten.

import { LABELS, num } from "../basis";
import { calc, normaliseer } from "../calc";
import type { Normen } from "../normen";
import type {
  EnergieAdvies,
  EnergieAdviesMaatregel,
  Energie,
  Labelklasse,
  Segment,
  WwsInput,
} from "../types";
import { energieVanOmschrijving } from "./maatregelen";

const labelIndex = (l: string) => (LABELS as readonly string[]).indexOf(l);
const isLabel = (l: unknown): l is Exclude<Labelklasse, "EPV"> =>
  typeof l === "string" && labelIndex(l) >= 0;
const isDatum = (d: unknown): d is string =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

/** "3 maart 2026"; leeg als er geen (geldige) datum is */
export function datumTekst(d: string | undefined): string {
  if (!isDatum(d)) return "";
  return new Date(d + "T12:00:00Z").toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Amsterdam",
  });
}

/** Het beginlabel volgens het advies ("huidige energiestatus"), of null */
export function adviesLabel(EA: EnergieAdvies | undefined): Exclude<Labelklasse, "EPV"> | null {
  const l = EA?.huidig?.label;
  return isLabel(l) ? l : null;
}

export interface BeginlabelVergelijking {
  advies: { label: string; datum: string | undefined };
  registratie: {
    /** Label in de telling, of null bij energie-index of bouwjaar */
    label: string | null;
    soort: Energie["soort"];
    datum: string | undefined;
    /** "C", "energie-index …" of "bouwjaar …" */
    omschrijving: string;
  };
  /** Klasse of soort verschilt (een label van vóór 2015 telt als verschil) */
  verschil: boolean;
  /** De logische keuze: het advies als dat recenter is dan de registratie */
  voorstel: "advies" | "registratie";
}

/** Vergelijkt het beginlabel van het advies met het label in de telling; null zonder advieslabel. */
export function vergelijkBeginlabel(
  energie: Energie,
  EA: EnergieAdvies | undefined,
): BeginlabelVergelijking | null {
  const al = adviesLabel(EA);
  if (!al) return null;
  const regLabel = energie.soort === "label" || energie.soort === "labelOud" ? energie.label : "";
  const regDatum = isDatum(energie.datum) ? energie.datum : undefined;
  const advDatum = isDatum(EA?.datum) ? EA.datum : undefined;
  const verschil = !(energie.soort === "label" && energie.label === al);
  // Recenter: allebei een datum en het advies is later; zonder registratie (index/bouwjaar) is
  // een gedateerd advies altijd recenter
  const recenter = !!advDatum && (regLabel ? !!regDatum && advDatum > regDatum : true);
  return {
    advies: { label: al, datum: advDatum },
    registratie: {
      label: regLabel || null,
      soort: energie.soort,
      datum: regDatum,
      omschrijving: energieVanOmschrijving(energie),
    },
    verschil,
    voorstel: recenter ? "advies" : "registratie",
  };
}

const registratieTekst = (v: BeginlabelVergelijking) =>
  v.registratie.label
    ? "label " +
      v.registratie.label +
      (v.registratie.soort === "labelOud" ? " (van vóór 2015)" : "") +
      (v.registratie.datum ? ", geregistreerd op " + datumTekst(v.registratie.datum) : "")
    : "geen geldig label (" + v.registratie.omschrijving + ")";

/** De controlevraag, met beide labels, hun datum en de gevolgen */
export function beginlabelVraag(v: BeginlabelVergelijking): string {
  const huidig = v.registratie.label ? "label " + v.registratie.label : v.registratie.omschrijving;
  return (
    "Het energieadvies" +
    (v.advies.datum ? " van " + datumTekst(v.advies.datum) : "") +
    " gaat uit van label " +
    v.advies.label +
    ". In EP-Online staat " +
    registratieTekst(v) +
    ". Wil je het verbeteradvies baseren op label " +
    v.advies.label +
    " uit het advies? De WWS-punten van de huidige situatie blijven gebaseerd op " +
    huidig +
    "."
  );
}

/** Melding: een nieuw label telt pas mee na registratie */
export const REGISTRATIE_MELDING =
  "Een nieuw label telt pas mee in de puntentelling na registratie in EP-Online. Het label in de telling wordt niet automatisch aangepast.";

/** Geldt het advieslabel als beginpunt? Alleen na bevestiging, op precies dit advieslabel. */
export function gebruiktAdviesLabel(x: Pick<WwsInput, "energie" | "energieAdvies">): boolean {
  const EA = x.energieAdvies;
  const v = vergelijkBeginlabel(x.energie, EA);
  return (
    !!v &&
    v.verschil &&
    EA?.uitgangspunt?.keuze === "advies" &&
    EA.uitgangspunt.label === v.advies.label
  );
}

/**
 * Het beginlabel van het verbeteradvies: het advieslabel na bevestiging, anders het geregistreerde
 * label (null bij energie-index of bouwjaar zonder bevestigd advieslabel).
 */
export function beginlabel(x: Pick<WwsInput, "energie" | "energieAdvies">): {
  label: Exclude<Labelklasse, "EPV"> | null;
  bron: "advies" | "registratie";
} {
  if (gebruiktAdviesLabel(x)) return { label: adviesLabel(x.energieAdvies), bron: "advies" };
  const e = x.energie;
  return {
    label: (e.soort === "label" || e.soort === "labelOud") && isLabel(e.label) ? e.label : null,
    bron: "registratie",
  };
}

/** Tekst voor de telling en de PDF's: welk uitgangspunt, bevestigd door wie en wanneer */
export function uitgangspuntTekst(x: Pick<WwsInput, "energie" | "energieAdvies">): string | null {
  const EA = x.energieAdvies;
  const v = vergelijkBeginlabel(x.energie, EA);
  const u = EA?.uitgangspunt;
  if (!v || !v.verschil) return null;
  const wie = u
    ? " (bevestigd door " + u.door + " op " + datumTekst(u.op.slice(0, 10)) + ")"
    : " (nog niet bevestigd)";
  const huidig = v.registratie.label ? "label " + v.registratie.label : v.registratie.omschrijving;
  if (gebruiktAdviesLabel(x))
    return (
      "Het verbeteradvies gaat uit van label " +
      v.advies.label +
      " uit het energieadvies" +
      (v.advies.datum ? " van " + datumTekst(v.advies.datum) : "") +
      wie +
      ". De WWS-punten van de huidige situatie blijven gebaseerd op " +
      huidig +
      " (EP-Online)."
    );
  return (
    "Het verbeteradvies gaat uit van " +
    (v.registratie.label ? "het geregistreerde label " + v.registratie.label : huidig) +
    " (EP-Online), niet van label " +
    v.advies.label +
    " uit het energieadvies" +
    wie +
    "."
  );
}

/** Invoer met het label van na de optie; de soort blijft (zoals een labelstap in het advies) */
export function metEindlabel(x: WwsInput, naar: string, vandaag: string): WwsInput {
  const y = structuredClone(x);
  if (y.energie.soort === "label" || y.energie.soort === "labelOud")
    y.energie.label = naar as Labelklasse;
  else
    y.energie = {
      soort: "label",
      label: naar as Labelklasse,
      indexKlasse: "",
      bouwjaar: "",
      datum: vandaag,
    };
  return normaliseer(y);
}

export interface OptieEffect {
  /** Index in energieAdvies.maatregelen */
  index: number;
  optie: EnergieAdviesMaatregel;
  /** Beginlabel (gekozen uitgangspunt) en eindlabel */
  van: string | null;
  naar: string;
  /** Aantal labelstappen vanaf het beginlabel (null zonder beginlabel) */
  stappen: number | null;
  kostenMin: number;
  kostenMax: number;
  /** Gemiddelde van min en max */
  kosten: number;
  besparingMin: number;
  besparingMax: number;
  puntenErbij: number;
  totaal: number;
  seg: Segment;
  maxHuur: number;
  extraHuurMaand: number;
  /** Indicatie: kosten ÷ extra huur per jaar; null als de huur niet omhoog gaat */
  terugverdienJaren: number | null;
}

/** Het effect van elke optie uit het advies op de telling, met de bestaande rekenkern. */
export function vergelijkOpties(x0: WwsInput, N: Normen, vandaag: string): OptieEffect[] {
  const x = normaliseer(x0);
  const EA = x.energieAdvies;
  const R0 = calc(x, N);
  const huur0 = R0.maxHuurOpslag ?? R0.maxHuur ?? 0;
  const { label: van } = beginlabel(x);
  return (EA?.maatregelen ?? [])
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => isLabel(m.naarLabel))
    .map(({ m, index }) => {
      const R = calc(metEindlabel(x, m.naarLabel, vandaag), N);
      const kostenMin = num(m.kostenMin) || 0;
      const kostenMax = num(m.kostenMax) || kostenMin;
      const kosten = (kostenMin + kostenMax) / 2;
      const huur = R.maxHuurOpslag ?? R.maxHuur ?? 0;
      const extraHuurMaand = Math.round((huur - huur0) * 100) / 100;
      return {
        index,
        optie: m,
        van,
        naar: m.naarLabel,
        stappen: van ? labelIndex(van) - labelIndex(m.naarLabel) : null,
        kostenMin,
        kostenMax,
        kosten,
        besparingMin: num(m.besparingMin) || 0,
        besparingMax: num(m.besparingMax) || 0,
        puntenErbij: R.totaal - R0.totaal,
        totaal: R.totaal,
        seg: R.seg,
        maxHuur: huur,
        extraHuurMaand,
        terugverdienJaren:
          extraHuurMaand > 0 && kosten > 0
            ? Math.round((kosten / (extraHuurMaand * 12)) * 10) / 10
            : null,
      };
    });
}

/** De gekozen optie, als die (nog) bestaat */
export function gekozenOptie(EA: EnergieAdvies | undefined): EnergieAdviesMaatregel | null {
  const i = EA?.gekozenOptie;
  return i != null && EA?.maatregelen?.[i] && isLabel(EA.maatregelen[i].naarLabel)
    ? EA.maatregelen[i]
    : null;
}

/** De woning na het afmelden van het energielabel volgens het advies (als label, vanaf vandaag) */
function naAfmelden(x: WwsInput, label: Labelklasse, vandaag: string): WwsInput {
  const y = structuredClone(x);
  y.energie = { soort: "label", label, indexKlasse: "", bouwjaar: "", datum: vandaag };
  return normaliseer(y);
}

export interface Terugval {
  /** Het label volgens het energieadvies */
  advieslabel: string;
  /** "label B" of de omschrijving van index of bouwjaar */
  huidig: string;
  van: number;
  naar: number;
  segVan: Segment;
  segNaar: Segment;
}

/**
 * Valt de woning lager uit als het energielabel wordt afgemeld volgens het energieadvies (een
 * lager label dan het geregistreerde, of een index die een slechter label wordt)? Ook zonder
 * bevestigd uitgangspunt: juist dan is de waarschuwing belangrijk. null: geen advieslabel, of
 * afmelden levert niet minder punten op.
 */
export function terugvalBijAfmelden(x0: WwsInput, N: Normen, vandaag: string): Terugval | null {
  const x = normaliseer(x0);
  const al = adviesLabel(x.energieAdvies);
  if (!al) return null;
  if (x.energie.soort === "label" && x.energie.label === al) return null;
  const voor = calc(x, N);
  const na = calc(naAfmelden(x, al, vandaag), N);
  if (na.exact >= voor.exact - 0.009) return null;
  return {
    advieslabel: al,
    huidig:
      x.energie.soort === "label" || x.energie.soort === "labelOud"
        ? "label " + x.energie.label
        : energieVanOmschrijving(x.energie),
    van: voor.totaal,
    naar: na.totaal,
    segVan: voor.seg,
    segNaar: na.seg,
  };
}

const SEGMENT_TEKST: Record<Segment, string> = {
  laag: "de sociale huur",
  midden: "de middenhuur",
  hoog: "de vrije sector",
};

/** "Let op: bij afmelden … daalt de woning van 195 naar 177 punten en valt ze terug in de middenhuur." */
export function terugvalTekst(t: Terugval): string {
  return (
    "Let op: bij afmelden van het energielabel volgens het energieadvies (label " +
    t.advieslabel +
    " in plaats van " +
    t.huidig +
    ") daalt de woning van " +
    t.van +
    " naar " +
    t.naar +
    " punten" +
    (t.segNaar !== t.segVan
      ? " en valt ze terug in " + SEGMENT_TEKST[t.segNaar]
      : " en blijft ze in " + SEGMENT_TEKST[t.segNaar]) +
    "."
  );
}
