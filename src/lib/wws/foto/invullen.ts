// Een fotobeoordeling in de telling invullen. De telling gaat alleen omhoog: wat er al staat wordt
// nooit gewist, uitgezet of verlaagd. Waar de AI niet zeker is, of de foto's op minder wijzen dan er
// al staat, komt een markering in fac.fotoOnzeker (veld → reden); de app toont daar een !.
//
// - aanwezig (ingebouwd): invullen, geen markering;
// - waarschijnlijk_aanwezig: invullen, met markering;
// - niet_vast_te_stellen: niets invullen, wel een markering;
// - vrijstaand: niets invullen (telt niet); alleen een markering als de telling hem wel meetelt.
// Soort niet te zien: de laagst tellende soort, met markering. "Voldoet aan de eisen" (badkamer)
// blijft altijd aan de gebruiker.
//
// De veldnamen in fotoOnzeker zijn die van het formulier: de sleutel van een voorziening, de groep
// bij een keuze (kook, oven, kraan), en lengte, toilet, wastafel, enz.
import { num } from "../basis";
import type { Fac, FacBadkamer, FacKeuken, FacToilet } from "../types";
import type { Beoordeling, ElementOordeel } from "./beoordeling";
import type { FotoRuimte } from "./elementen";

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** Welke fotobeoordeling bij deze voorziening hoort; null als die er niet is */
export function fotoRuimteVoor(f: Fac | undefined): FotoRuimte | null {
  if (f?.kind === "keuken" || f?.kind === "badkamer" || f?.kind === "toilet") return f.kind;
  return null;
}

/** Een ja/nee-veld */
interface Vink {
  soort: "vink";
  veld: string;
  get: () => boolean;
  zet: () => void;
}
/** Een aantal */
interface Aantal {
  soort: "aantal";
  veld: string;
  get: () => number;
  zet: (n: number) => void;
  /** Het aantal is altijd een schatting (keukenkasten) */
  schatting?: boolean;
}
/** Eén keuze uit een rij, van laag naar hoog */
interface Keuze {
  soort: "keuze";
  veld: string;
  /** Per soort van de AI de waarde in de telling, van laagst naar hoogst tellend */
  waarden: readonly (readonly [string, string])[];
  /** De huidige waarde; null = niets gekozen */
  get: () => string | null;
  zet: (waarde: string) => void;
  naam: (waarde: string) => string;
  /** Een element zonder "aanwezig/afwezig", alleen een soort (aanrechtlengte) */
  altijd?: boolean;
}
type Doel = Vink | Aantal | Keuze;

const AANRECHT: Record<string, string> = {
  "<1": "korter dan 1 m",
  "1-2": "1 tot 2 m",
  ">=2": "2 m of meer",
};
const KEUKEN_KEUZES = {
  kook: {
    element: "kookplaat",
    waarden: [
      ["gas", "kook_gas"],
      ["keramisch", "kook_kera"],
      ["inductie", "kook_ind"],
    ],
  },
  oven: {
    element: "oven",
    waarden: [
      ["gas", "oven_gas"],
      ["elektrisch", "oven"],
    ],
  },
  kraan: {
    element: "kraan",
    waarden: [
      ["eenhands", "kraan_een"],
      ["thermostatisch", "kraan_thermo"],
    ],
  },
} as const;
const KEUKEN_VINK = ["afzuig", "koelkast", "vriezer", "magnetron", "vaatwasser", "kokend"] as const;

function keukenDoelen(f: FacKeuken): Record<string, Doel> {
  const v = (f.keuken.voorz ??= {});
  const doelen: Record<string, Doel> = {
    aanrecht: {
      soort: "keuze",
      veld: "lengte",
      waarden: Object.keys(AANRECHT).map((k) => [k, k] as const),
      get: () => f.keuken.lengte,
      zet: (w) => (f.keuken.lengte = w as FacKeuken["keuken"]["lengte"]),
      naam: (w) => "aanrecht " + (AANRECHT[w] ?? w),
      altijd: true,
    },
    kast: {
      soort: "aantal",
      veld: "kast",
      get: () => num(v.kast),
      zet: (n) => (v.kast = n),
      schatting: true,
    },
  };
  for (const k of KEUKEN_VINK)
    doelen[k] = { soort: "vink", veld: k, get: () => num(v[k]) > 0, zet: () => (v[k] = true) };
  for (const [g, { element, waarden }] of Object.entries(KEUKEN_KEUZES))
    doelen[element] = {
      soort: "keuze",
      veld: g,
      waarden,
      get: () => waarden.find(([, k]) => num(v[k]) > 0)?.[1] ?? null,
      zet: (w) => {
        for (const [, k] of waarden) delete v[k];
        v[w as keyof typeof v] = true;
      },
      naam: (w) => waarden.find(([, k]) => k === w)?.[0] ?? w,
    };
  return doelen;
}

const SAN_AANTAL = ["wastafel", "meerpers", "douche", "bad", "badDouche"] as const;
const SAN_VINK = ["bubbel", "afscheiding", "kastruimte"] as const;
const SAN_VOORZ_AANTAL = [
  "handdoekrad",
  "kastje",
  "stopcontact",
  "kraan_een",
  "kraan_thermo",
] as const;

function badkamerDoelen(f: FacBadkamer): Record<string, Doel> {
  const s = f.san;
  const v = (s.voorz ??= {});
  const doelen: Record<string, Doel> = {};
  for (const k of SAN_AANTAL)
    doelen[k] = { soort: "aantal", veld: k, get: () => num(s[k]), zet: (n) => (s[k] = n) };
  for (const k of SAN_VINK)
    doelen[k] = { soort: "vink", veld: k, get: () => num(v[k]) > 0, zet: () => (v[k] = true) };
  for (const k of SAN_VOORZ_AANTAL)
    doelen[k] = { soort: "aantal", veld: k, get: () => num(v[k]), zet: (n) => (v[k] = n) };
  return doelen;
}

function toiletDoelen(f: FacToilet): Record<string, Doel> {
  const t = f.toilet;
  return {
    toilet: {
      soort: "keuze",
      veld: "toilet",
      waarden: [
        ["staand", "staand"],
        ["hangend", "hangend"],
      ],
      get: () => (t.toilet === "geen" ? null : t.toilet),
      zet: (w) => (t.toilet = w as FacToilet["toilet"]["toilet"]),
      naam: (w) => w + " toilet",
    },
    fontein: {
      soort: "vink",
      veld: "fontein",
      get: () => !!t.fontein,
      zet: () => (t.fontein = true),
    },
  };
}

/** Badkamertoilet: een aantal met een soort (staand of hangend), dus apart */
function badkamerToilet(f: FacBadkamer, o: ElementOordeel, markeer: (r: string) => void) {
  const s = f.san;
  if (o.status === "niet_vast_te_stellen") return markeer("Niet vast te stellen: " + o.bewijs);
  if (o.status === "waarschijnlijk_aanwezig") markeer("Waarschijnlijk aanwezig: " + o.bewijs);
  let n = o.aantal ?? 0;
  if (n < 1) {
    n = 1;
    markeer("Aantal niet te tellen; 1 ingevuld.");
  }
  if (o.soort === null) markeer("Soort niet te zien; staand ingevuld (telt het minst).");
  const k = o.soort === "hangend" ? "toiletHang" : "toiletStaand";
  const nu = num(s.toiletStaand) + num(s.toiletHang);
  if (nu > n) markeer(`Op de foto's ${n}; in de telling staan er meer.`);
  if (num(s[k]) < n && nu < n) s[k] = num(s[k]) + (n - nu);
}

/** Eén element invullen volgens de regels bovenaan */
function vulIn(d: Doel, o: ElementOordeel, markeer: (r: string) => void) {
  const gevuld =
    d.soort === "vink" ? d.get() : d.soort === "aantal" ? d.get() > 0 : d.get() !== null;
  if (o.vrijstaand) {
    if (gevuld) markeer("Op de foto's vrijstaand; dat telt niet. " + o.bewijs);
    return;
  }
  if (o.status === "niet_vast_te_stellen") return markeer("Niet vast te stellen: " + o.bewijs);
  if (o.status === "waarschijnlijk_aanwezig") markeer("Waarschijnlijk aanwezig: " + o.bewijs);

  if (d.soort === "vink") {
    if (!gevuld) d.zet();
    return;
  }
  if (d.soort === "aantal") {
    let n = o.aantal ?? 0;
    if (n < 1) {
      n = 1;
      markeer("Aantal niet te tellen; 1 ingevuld.");
    }
    if (d.schatting) markeer("Het aantal is een schatting: " + o.bewijs);
    if (d.get() > n) markeer(`Op de foto's ${n}; in de telling staan er meer.`);
    else d.zet(n);
    return;
  }
  // keuze: alleen omhoog in de rij
  const rang = (w: string | null) => d.waarden.findIndex(([, k]) => k === w);
  const nieuw = o.soort === null ? null : (d.waarden.find(([s]) => s === o.soort)?.[1] ?? null);
  if (nieuw === null) {
    if (d.altijd) return markeer("Niet te schatten: " + o.bewijs);
    if (gevuld) return;
    markeer("Soort niet te zien; de laagst tellende soort is ingevuld.");
    d.zet(d.waarden[0]![1]);
    return;
  }
  const nu = d.get();
  if (rang(nieuw) > rang(nu)) d.zet(nieuw);
  else if (rang(nieuw) < rang(nu))
    markeer(`Op de foto's ${d.naam(nieuw)}; in de telling staat ${d.naam(nu!)}.`);
}

export interface FotoResultaat {
  fac: Fac;
  /** Aantal velden met een ! */
  onzeker: number;
}

/**
 * Een gecontroleerde beoordeling (zie controleerBeoordeling) op een voorziening toepassen. Wijzigt
 * f niet. Geeft null als de beoordeling niet bij deze voorziening hoort. Een eerdere
 * fotobeoordeling wordt vervangen: alleen de markeringen van deze beoordeling blijven.
 */
export function pasFotosToe(f: Fac, ruimte: FotoRuimte, b: Beoordeling): FotoResultaat | null {
  if (fotoRuimteVoor(f) !== ruimte) return null;
  const uit = clone(f) as FacKeuken | FacBadkamer | FacToilet;
  const onzeker: Record<string, string> = {};
  const markeerVoor = (veld: string) => (reden: string) => {
    const r = reden.trim();
    onzeker[veld] = onzeker[veld] ? onzeker[veld] + " " + r : r;
  };
  const doelen =
    uit.kind === "keuken"
      ? keukenDoelen(uit)
      : uit.kind === "badkamer"
        ? badkamerDoelen(uit)
        : toiletDoelen(uit);
  for (const [element, o] of Object.entries(b)) {
    if (element === "toilet" && uit.kind === "badkamer") {
      badkamerToilet(uit, o, markeerVoor("toilet"));
      continue;
    }
    const d = doelen[element];
    if (d) vulIn(d, o, markeerVoor(d.veld));
  }
  delete uit.uitPve;
  uit.uitFoto = true;
  if (Object.keys(onzeker).length) uit.fotoOnzeker = onzeker;
  else delete uit.fotoOnzeker;
  return { fac: uit, onzeker: Object.keys(onzeker).length };
}

/** Het ! bij één veld weghalen (met de hand aangepast of gecontroleerd). Muteert f. */
export function fotoVeldGecontroleerd(f: Fac, veld: string): void {
  if (f.kind !== "keuken" && f.kind !== "badkamer" && f.kind !== "toilet") return;
  if (!f.fotoOnzeker) return;
  delete f.fotoOnzeker[veld];
  if (!Object.keys(f.fotoOnzeker).length) delete f.fotoOnzeker;
}
