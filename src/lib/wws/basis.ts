// Hulpfuncties en ruimtetypen, letterlijk overgezet uit wws-site.html.
import type {
  BuitenSoort,
  Fac,
  FacKind,
  Labelklasse,
  MonumentKeuze,
  OverigTypeKey,
  VertrekTypeKey,
} from "./types";

// ---------- getallen en afronding ----------
/** Leest een invoerwaarde als getal: "", null, false → 0; true → 1; "12,5" → 12.5 */
export const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "" || v === false) return 0;
  if (v === true) return 1;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(/[−–]/g, "-").replace(",", "."));
  return isFinite(n) ? n : 0;
};
/** Op centen / twee decimalen */
export const r2 = (x: number) => Math.round(x * 100) / 100;
/** Rubriekpunten op 0,25, vanaf een achtste omhoog */
export const q = (x: number) => Math.round(x * 4 + 1e-9) / 4;
/** Hele m², vanaf 0,50 omhoog */
export const m2r = (x: number) => Math.floor(x + 0.5 + 1e-9);
export const fmt = (x: number, d = 2) =>
  (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString("nl-NL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: d,
  });
export const eur = (x: number) => x.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });

// ---------- vaste lijsten ----------
export const LABELS: Exclude<Labelklasse, "EPV">[] = [
  "A++++",
  "A+++",
  "A++",
  "A+",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
];
export const INDEX_KLASSEN = [
  "EI ≤ 0,6",
  "0,6 < EI ≤ 0,8",
  "0,8 < EI ≤ 1,2",
  "1,2 < EI ≤ 1,4",
  "1,4 < EI ≤ 1,8",
  "1,8 < EI ≤ 2,1",
  "2,1 < EI ≤ 2,4",
  "2,4 < EI ≤ 2,7",
  "EI > 2,7",
];
/** Indexwaarde → klasse ("0".."8"), zoals normalizeInput() */
export const indexNaarKlasse = (ei: number) =>
  String([0.6, 0.8, 1.2, 1.4, 1.8, 2.1, 2.4, 2.7, 999].findIndex((x) => ei <= x));

export interface RuimteType<K extends string> {
  k: K;
  l: string;
  verwVertrekken?: number;
  verkeer?: boolean;
}

// Volgorde en benamingen zoals in de Huurprijscheck van de Huurcommissie
export const VERTREK_TYPES: RuimteType<VertrekTypeKey>[] = [
  { k: "woonkamer", l: "Woonkamer" },
  { k: "keuken", l: "Keuken" },
  { k: "woonkamer_ok", l: "Woonkamer met open keuken", verwVertrekken: 2 },
  { k: "slaapkamer", l: "Slaapkamer" },
  { k: "badkamer", l: "Badkamer" },
  { k: "woonslaap", l: "Woon- en slaapkamer" },
  { k: "slaap_san", l: "Slaapkamer met wastafel, douche of bad" },
  { k: "woonslaap_ok", l: "Woon- en slaapkamer met keuken", verwVertrekken: 2 },
  { k: "zolderkamer", l: "Zolder (vaste trap, beschoten dak)" },
  { k: "eetkamer", l: "Eetkamer" },
  { k: "studeer", l: "Hobby- of studeerkamer" },
  { k: "overig", l: "Overig vertrek" },
];
export const OVERIG_TYPES: RuimteType<OverigTypeKey>[] = [
  { k: "toilet", l: "Toiletruimte" },
  { k: "overloop", l: "Overloop", verkeer: true },
  { k: "hal", l: "Hal of gang", verkeer: true },
  { k: "kleine_kamer", l: "Kleine kamer (kleiner dan 4 m²)" },
  { k: "wasruimte", l: "Wasruimte / bijkeuken" },
  { k: "berging_in", l: "Berging" },
  { k: "berging_uit", l: "Fietsenberging of schuur" },
  { k: "garage", l: "Garage" },
  { k: "kelder", l: "Kelder" },
  { k: "zolder", l: "Zolderberging met vaste trap" },
  { k: "zolder_notrap", l: "Zolderberging zonder vaste trap" },
  { k: "overig", l: "Overige ruimte" },
];
export const BUITEN_SOORTEN: [BuitenSoort, string][] = [
  ["balkon", "Balkon"],
  ["dakterras", "Dakterras"],
  ["voorzijtuin", "Voortuin / zijtuin"],
  ["achtertuin", "Achtertuin"],
  ["loggia", "Loggia"],
  ["platje", "Platje"],
  ["terras", "Terras"],
  ["oprit", "Oprit (uitsluitend eigen gebruik)"],
  ["fietsenstalling", "Fietsenstalling / berging"],
  ["fransbalkon", "Frans balkon (telt niet mee)"],
  ["overig", "Overige buitenruimte"],
];
export const MONUMENT_KEUZES: [MonumentKeuze, string][] = [
  ["gemprov", "Gemeentelijk of provinciaal monument"],
  ["stads", "Beschermd stads- en dorpsgezicht"],
  ["rijks_voor", "Rijksmonument, contract vóór 1 juli 2024"],
  ["rijks_na", "Rijksmonument, contract na 1 juli 2024"],
  ["geen", "Geen monument"],
];

export const vertrekType = (k: string) =>
  VERTREK_TYPES.find((t) => t.k === k) ?? VERTREK_TYPES.find((t) => t.k === "overig")!;
export const overigType = (k: string) =>
  OVERIG_TYPES.find((t) => t.k === k) ?? OVERIG_TYPES.find((t) => t.k === "overig")!;

// ---------- voorzieningen per ruimte ----------
export const KEUKEN_TYPES: VertrekTypeKey[] = ["keuken", "woonkamer_ok", "woonslaap_ok"];

export function facKind(groep: "vertrekken" | "overig", type: string): FacKind | null {
  if (groep === "vertrekken") {
    if ((KEUKEN_TYPES as string[]).includes(type)) return "keuken";
    if (type === "badkamer") return "badkamer";
    if (type === "slaap_san") return "slaap_san";
    return null;
  }
  if (type === "toilet") return "toilet";
  if (type === "wasruimte") return "was";
  return null;
}

/** Standaard-voorzieningen voor een nieuwe ruimte; `leeg` = alles uit (bijv. bij inlezen). */
export function facDefault(kind: FacKind, leeg = false): Fac {
  switch (kind) {
    case "keuken":
      return { kind, keuken: { lengte: leeg ? "<1" : "1-2", voorz: {} } };
    case "badkamer":
      return {
        kind,
        san: {
          toiletStaand: 0,
          toiletHang: 0,
          wastafel: leeg ? 0 : 1,
          meerpers: 0,
          douche: leeg ? 0 : 1,
          bad: 0,
          badDouche: 0,
          eisenOk: true,
          voorz: {},
        },
      };
    case "slaap_san":
      return {
        kind,
        san: { wastafel: leeg ? 0 : 1, meerpers: 0, douche: 0, bad: 0, badDouche: 0 },
      };
    case "toilet":
      return { kind, toilet: { toilet: leeg ? "geen" : "staand", fontein: false } };
    case "was":
      return { kind, was: { wastafel: false } };
  }
}

/** Zorgt dat `r.fac` past bij het ruimtetype (muteert r), zoals ensureFac() */
export function ensureFac(
  groep: "vertrekken" | "overig",
  r: { type: string; fac?: Fac },
  leeg = false,
) {
  const k = facKind(groep, r.type);
  if (!k) {
    if (r.fac) delete r.fac;
    return;
  }
  if (!r.fac || r.fac.kind !== k) r.fac = facDefault(k, leeg);
}

/** Oppervlakte uit lengte × breedte-regels, of null als er geen maten zijn (matenM2) */
export function matenM2(r: { maten?: { l: unknown; b: unknown }[] }): number | null {
  const ms = (r.maten || []).filter((m) => num(m.l) !== 0 && num(m.b) !== 0);
  if (!ms.length) return null;
  return Math.max(0, r2(ms.reduce((s, m) => s + r2(num(m.l) * num(m.b)), 0)));
}
