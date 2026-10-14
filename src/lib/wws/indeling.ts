// Indelingsadvies — overgezet uit openIndeling(), indelingGenFacRow(),
// indelingSplitsCirculatie(), indelingBouwVariant(), genereerIndelingVarianten(),
// indelingVariantBlokjes(), indelingVloerplanLayout(), indelingBuitenrand(),
// indelingUnieBbox(), indelingVerwarmdWens() en indelingToepassen() in wws-site.html.
// indeling.vergelijk.test.ts vergelijkt de uitkomst met de originele code.
//
// Bewuste verschillen met de bron (zie toepassen()):
// - de bron zet bij toepassen een getekend blokkenschema als plattegrondImg; hier wordt een
//   bestaande plattegrondImg verwijderd (die past niet meer bij de nieuwe indeling) en toont de
//   app het schema live;
// - eigenaar en gebruikt PvE (meta.klantId/meta.pveId) worden pas bij toepassen gekoppeld, door
//   de aanroeper; de bron zet klantId al bij stap 1 → 2 en zet geen pveId.
import { facDefault, facKind, num, overigType, r2, vertrekType } from "./basis";
import { calc } from "./calc";
import type { Normen } from "./normen";
import { pasPveOpFac, type Pve } from "./pve";
import type { Fac, FacKind, OverigeRuimte, Vertrek, WwsInput, WwsResultaat } from "./types";

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

export type Groep = "vertrekken" | "overig";
export type IndelingStatus = "vrij" | "vast" | "negeren";

export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Hoek = "tl" | "tr" | "bl" | "br";
export type Notches = Record<Hoek, { w: number; h: number } | null>;

/** Een bestaande ruimte in het indelingsadvies (stap 2) */
export interface IndelingRuimte {
  key: Groep;
  idx: number;
  naam: string | undefined;
  type: string;
  m2: number;
  kind: FacKind | null;
  status: IndelingStatus;
  /** Positie op een ingelezen plattegrond (fase 4); nu alleen doorgegeven */
  bbox: Bbox | null;
  notch: Notches;
}

/** Een voorgestelde ruimte; _indVast/_indNieuw alleen voor het schema, niet om op te slaan */
export type IndelingRij = (Vertrek | OverigeRuimte) & {
  _indVast?: boolean;
  _indNieuw?: boolean;
  bbox?: Bbox;
};

export interface IndelingVariant {
  vertrekken: IndelingRij[];
  overig: IndelingRij[];
  nSlaap: number;
  R: WwsResultaat;
  input: WwsInput;
  /** Vangnet: er was nergens een toilet, de eerste badkamer kreeg er een (zie toiletVangnet) */
  toiletToegevoegd?: boolean;
  /** Ook na het vangnet geen toilet (geen badkamer in de variant) */
  geenToilet?: boolean;
}

const typeVan = (key: Groep, t: string) => (key === "vertrekken" ? vertrekType(t) : overigType(t));

// ---------- verwarmd ----------

const AUTO_VERWARMD_OVERIG = new Set(["wasruimte"]);
export function autoVerwarmd(key: Groep, type: string): boolean {
  return key === "vertrekken" ? true : AUTO_VERWARMD_OVERIG.has(type);
}
/** Wordt een voorgestelde ruimte van dit type als verwarmd meegeteld? — indelingVerwarmdWens() */
export function verwarmdWens(key: Groep, type: string, pve: Pve | null | undefined): boolean {
  const ind = pve?.indeling as { verwarmd?: Record<string, unknown> } | undefined;
  const w = ind && ind.verwarmd;
  const k = key + ":" + type;
  if (w && Object.prototype.hasOwnProperty.call(w, k)) return !!w[k];
  return autoVerwarmd(key, type);
}

// ---------- stap 2: ruimten uit de telling ----------

export function bboxOk(b: unknown): b is Bbox {
  if (!b || typeof b !== "object") return false;
  const { x, y, w, h } = b as Record<string, unknown>;
  return (
    [x, y, w, h].every((v) => typeof v === "number" && isFinite(v)) &&
    (w as number) > 0 &&
    (h as number) > 0 &&
    (x as number) >= -0.02 &&
    (y as number) >= -0.02 &&
    (x as number) + (w as number) <= 1.02 &&
    (y as number) + (h as number) <= 1.02
  );
}

const HOEKEN: Hoek[] = ["tl", "tr", "bl", "br"];
const legeNotches = (): Notches => ({ tl: null, tr: null, bl: null, br: null });

export function normaliseerNotch(n: unknown): Notches {
  const out = legeNotches();
  if (!n || typeof n !== "object") return out;
  const o = n as Record<string, { w: number; h: number } | undefined> & { w?: number; h?: number };
  if (HOEKEN.some((h) => o[h] !== undefined)) {
    HOEKEN.forEach((h) => {
      const v = o[h];
      if (v && v.w > 0.01 && v.h > 0.01) out[h] = { w: v.w, h: v.h };
    });
    return out;
  }
  if ((o.w as number) > 0.01 && (o.h as number) > 0.01)
    out.tl = { w: o.w as number, h: o.h as number };
  return out;
}

/** De ruimten van de telling, met beginstatus: voorzieningen vast, de rest vrij — openIndeling() */
export function ruimtenUitTelling(input: WwsInput): IndelingRuimte[] {
  const rooms: IndelingRuimte[] = [];
  (["vertrekken", "overig"] as const).forEach((key) => {
    (input[key] || []).forEach((r, i) => {
      const kind = facKind(key, r.type);
      const extra = r as unknown as { bbox?: unknown; notch?: unknown };
      rooms.push({
        key,
        idx: i,
        naam: r.naam,
        type: r.type,
        m2: num(r.m2),
        kind,
        status: kind ? "vast" : "vrij",
        bbox: bboxOk(extra.bbox) ? (extra.bbox as Bbox) : null,
        notch: normaliseerNotch(extra.notch),
      });
    });
  });
  return rooms;
}

// ---------- varianten ----------

/** Nieuwe ruimte met voorziening, eventueel uit het PvE — indelingGenFacRow() */
function genFacRow(
  key: Groep,
  type: string,
  naam: string,
  m2: number,
  kind: FacKind,
  pve: Pve | null,
): IndelingRij {
  const row = {
    type,
    naam,
    m2: String(r2(m2)).replace(".", ","),
    maten: [],
    verwarmd: verwarmdWens(key, type, pve),
    _indNieuw: true,
  } as unknown as IndelingRij;
  const fac = facDefault(kind, false);
  if (pve) pasPveOpFac(fac, pve);
  row.fac = fac as never;
  return row;
}

/**
 * Een vrije hal/overloop verdwijnt niet helemaal: ca. 30% (min. 2 m²) blijft behouden, de
 * rest gaat de pot in — indelingSplitsCirculatie().
 */
export function splitsCirculatie(rooms: readonly IndelingRuimte[], input: WwsInput) {
  const gewoneVrij: IndelingRuimte[] = [];
  const behoudenCirculatie: { key: Groep; row: IndelingRij }[] = [];
  let poolUitVerkeer = 0;
  rooms.forEach((r) => {
    if (typeVan(r.key, r.type).verkeer) {
      const behoud = Math.min(r.m2, Math.max(2, r2(r.m2 * 0.3)));
      poolUitVerkeer += r2(r.m2 - behoud);
      if (behoud > 0) {
        const bron = (input[r.key] || [])[r.idx];
        const row = (bron ? clone(bron) : { type: r.type, naam: r.naam, maten: [] }) as IndelingRij;
        row.m2 = String(behoud).replace(".", ",");
        row.maten = [];
        row._indVast = true;
        if (r.bbox && r.m2 > 0) {
          const f = Math.sqrt(Math.max(0, Math.min(1, behoud / r.m2)));
          row.bbox = {
            x: r.bbox.x,
            y: r.bbox.y,
            w: Math.max(0.02, r.bbox.w * f),
            h: Math.max(0.02, r.bbox.h * f),
          };
        } else delete row.bbox;
        behoudenCirculatie.push({ key: r.key, row });
      }
    } else gewoneVrij.push(r);
  });
  return {
    poolBasis: gewoneVrij.reduce((s, r) => s + r.m2, 0) + poolUitVerkeer,
    behoudenCirculatie,
  };
}

interface IndelingWens {
  apartToilet?: string;
  wasruimte?: string;
  keuken?: string;
  slaapkamers?: unknown;
}

/**
 * Ruimtelijst voor een aantal slaapkamers: vaste ruimten blijven, de vrije ruimte gaat in één
 * pot die over ontbrekende voorzieningen, een woonkamer en de slaapkamers wordt verdeeld.
 * null als er minder dan 6 m² per slaapkamer overblijft — indelingBouwVariant().
 */
export function bouwVariant(
  nSlaap: number,
  pve: Pve | null,
  rooms: readonly IndelingRuimte[],
  input: WwsInput,
): { vertrekken: IndelingRij[]; overig: IndelingRij[]; nSlaap: number } | null {
  const vast = rooms.filter((r) => r.status === "vast");
  const vrij = rooms.filter((r) => r.status === "vrij");
  const circulatie = splitsCirculatie(vrij, input);
  let pool = circulatie.poolBasis;
  const nieuweFac: { key: Groep; row: IndelingRij }[] = [];
  const heeftVasteWoonkamer = vast.some(
    (r) => ["woonkamer", "woonkamer_ok", "woonslaap", "woonslaap_ok"].includes(r.type) && r.m2 > 0,
  );
  const vastBadkamer = vast.find((r) => r.kind === "badkamer" && r.m2 > 0);
  const wens: IndelingWens = ((pve && pve.indeling) || {}) as IndelingWens;
  let badkamerFacVoorIntegratie: Fac | null = null;
  let nieuwToiletToegevoegd = false;
  const keukenOpenGewenst =
    wens.keuken === "open" &&
    !heeftVasteWoonkamer &&
    !vast.some((r) => r.kind === "keuken" && r.m2 > 0);
  let keukenOpenM2 = 0;
  (["keuken", "badkamer", "toilet", "was"] as const).forEach((kind) => {
    const heeftVrije = vrij.some((r) => r.kind === kind);
    const heeftVaste = vast.some((r) => r.kind === kind && r.m2 > 0);
    if (kind === "toilet") {
      if (wens.apartToilet === "nee") return;
      if (wens.apartToilet !== "ja" && vastBadkamer) return;
    }
    if (kind === "was" && wens.wasruimte === "nee") return;
    if (kind === "keuken" && keukenOpenGewenst) {
      keukenOpenM2 = Math.min(8, Math.max(2, pool * 0.12));
      pool -= keukenOpenM2;
      return;
    }
    let verplicht = kind !== "was";
    if (kind === "was" && wens.wasruimte === "ja") verplicht = true;
    if (!heeftVaste && (heeftVrije || verplicht)) {
      const standaardM2 = { keuken: 8, badkamer: 5, toilet: 2, was: 3 }[kind];
      const m2 = Math.min(standaardM2, Math.max(2, pool * 0.12));
      pool -= m2;
      const type =
        kind === "keuken"
          ? "keuken"
          : kind === "badkamer"
            ? "badkamer"
            : kind === "toilet"
              ? "toilet"
              : "wasruimte";
      const naam =
        kind === "keuken"
          ? "Keuken"
          : kind === "badkamer"
            ? "Badkamer"
            : kind === "toilet"
              ? "Toilet"
              : "Wasruimte";
      const key: Groep = kind === "toilet" || kind === "was" ? "overig" : "vertrekken";
      const genRow = genFacRow(key, type, naam, m2, kind, pve);
      nieuweFac.push({ key, row: genRow });
      if (kind === "badkamer") badkamerFacVoorIntegratie = genRow.fac ?? null;
      if (kind === "toilet") nieuwToiletToegevoegd = true;
    }
  });
  // Geen aparte toiletruimte gewenst: de nieuwe badkamer telt zelf een toilet
  const bi = badkamerFacVoorIntegratie as Fac | null;
  if (
    wens.apartToilet === "nee" &&
    bi &&
    bi.kind === "badkamer" &&
    bi.san &&
    !bi.san.toiletStaand &&
    !bi.san.toiletHang
  ) {
    bi.san.toiletStaand = 1;
  }
  let woon: IndelingRij | null = null;
  if (!heeftVasteWoonkamer) {
    const GEWICHT_WOON = 1.35;
    let woonBasisM2 = nSlaap > 0 ? (pool * GEWICHT_WOON) / (GEWICHT_WOON + nSlaap) : pool;
    woonBasisM2 = Math.max(12, woonBasisM2);
    pool -= woonBasisM2;
    const woonM2 = woonBasisM2 + keukenOpenM2;
    woon = {
      type: keukenOpenM2 > 0 ? "woonkamer_ok" : "woonkamer",
      naam: keukenOpenM2 > 0 ? "Woonkamer met open keuken" : "Woonkamer",
      m2: String(r2(woonM2)).replace(".", ","),
      maten: [],
      verwarmd: verwarmdWens("vertrekken", "woonkamer", pve),
      _indNieuw: true,
    } as unknown as IndelingRij;
    if (keukenOpenM2 > 0) {
      const fac = facDefault("keuken", false);
      if (pve) pasPveOpFac(fac, pve);
      woon.fac = fac as never;
    }
  }
  const perSlaap = nSlaap > 0 ? pool / nSlaap : 0;
  if (nSlaap > 0 && perSlaap < 6) return null;
  const slaapkamers: IndelingRij[] = [];
  for (let i = 0; i < nSlaap; i++)
    slaapkamers.push({
      type: "slaapkamer",
      naam: "Slaapkamer " + (i + 1),
      m2: String(r2(perSlaap)).replace(".", ","),
      maten: [],
      verwarmd: verwarmdWens("vertrekken", "slaapkamer", pve),
      _indNieuw: true,
    } as unknown as IndelingRij);
  const vertrekken: IndelingRij[] = [],
    overig: IndelingRij[] = [];
  vast.forEach((r) => {
    if (r.kind && !(r.m2 > 0)) return;
    const bron = (input[r.key] || [])[r.idx];
    if (!bron) return;
    const row = clone(bron) as IndelingRij;
    if (r.kind && pve && row.fac) pasPveOpFac(row.fac, pve);
    // naast een nieuwe, losse toiletruimte vervalt het toilet in de behouden badkamer
    const san = (row.fac as { san?: Record<string, unknown> } | undefined)?.san;
    if (r.kind === "badkamer" && nieuwToiletToegevoegd && san) {
      san["toiletStaand"] = 0;
      san["toiletHang"] = 0;
    }
    row._indVast = true;
    (r.key === "vertrekken" ? vertrekken : overig).push(row);
  });
  circulatie.behoudenCirculatie.forEach((c) =>
    (c.key === "vertrekken" ? vertrekken : overig).push(c.row),
  );
  nieuweFac.forEach((n) => (n.key === "vertrekken" ? vertrekken : overig).push(n.row));
  if (woon) vertrekken.push(woon);
  slaapkamers.forEach((s) => vertrekken.push(s));
  return { vertrekken, overig, nSlaap };
}

/** De slaapkamer-aantallen die worden doorgerekend: huidig −1/0/+1/+2, plus opgegeven en PvE-wens */
export function kandidaten(
  rooms: readonly IndelingRuimte[],
  extraSlaap: string,
  pve: Pve | null,
): number[] {
  const huidigSlaap = rooms.filter((r) => r.type === "slaapkamer" || r.type === "slaap_san").length;
  const extra = extraSlaap ? Math.round(num(extraSlaap)) : 0;
  const ind = (pve && pve.indeling) as IndelingWens | undefined;
  const pveSlaap = ind && ind.slaapkamers ? Math.round(num(ind.slaapkamers)) : 0;
  const set = new Set([
    Math.max(1, huidigSlaap - 1),
    Math.max(1, huidigSlaap),
    huidigSlaap + 1,
    huidigSlaap + 2,
  ]);
  if (extra > 0) set.add(extra);
  if (pveSlaap > 0) set.add(pveSlaap);
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Alle varianten, elk doorgerekend met calc — precies genereerIndelingVarianten() uit de bron,
 * zonder het toiletvangnet. Alleen voor de vergelijkingstest; de app gebruikt berekenVarianten().
 */
export function berekenVariantenKern(
  input: WwsInput,
  rooms: readonly IndelingRuimte[],
  pve: Pve | null,
  extraSlaap: string,
  N: Normen,
): IndelingVariant[] {
  return varianten(input, rooms, pve, extraSlaap, N, false);
}

/** Alle varianten met het toiletvangnet (bewuste afwijking, zie toiletVangnet), doorgerekend met calc */
export function berekenVarianten(
  input: WwsInput,
  rooms: readonly IndelingRuimte[],
  pve: Pve | null,
  extraSlaap: string,
  N: Normen,
): IndelingVariant[] {
  return varianten(input, rooms, pve, extraSlaap, N, true);
}

function varianten(
  input: WwsInput,
  rooms: readonly IndelingRuimte[],
  pve: Pve | null,
  extraSlaap: string,
  N: Normen,
  metVangnet: boolean,
): IndelingVariant[] {
  const out: IndelingVariant[] = [];
  kandidaten(rooms, extraSlaap, pve).forEach((n) => {
    const kaal = bouwVariant(n, pve, rooms, input);
    if (!kaal) return;
    const v = metVangnet ? toiletVangnet(kaal) : kaal;
    const genInput = clone(input);
    genInput.vertrekken = v.vertrekken as Vertrek[];
    genInput.overig = v.overig as OverigeRuimte[];
    out.push({ ...v, R: calc(genInput, N), input: genInput });
  });
  return out;
}

// ---------- toiletvangnet (bewuste afwijking van de bron) ----------

/** Heeft de variant ergens een toilet: een toiletruimte met toilet, of een badkamer met toilet? */
export function heeftToilet(v: Pick<IndelingVariant, "vertrekken" | "overig">): boolean {
  return [...v.vertrekken, ...v.overig].some((r) => {
    const f = r.fac;
    if (!f) return false;
    if (f.kind === "toilet") return f.toilet.toilet !== "geen";
    if (f.kind === "badkamer") return num(f.san.toiletStaand) + num(f.san.toiletHang) > 0;
    return false;
  });
}

/**
 * Vangnet na bouwVariant: heeft de variant nergens een toilet, dan krijgt de eerste badkamer
 * (behouden of nieuw) een staand toilet — zoals de bron al doet voor een nieuw voorgestelde
 * badkamer bij "geen aparte toiletruimte". De bron laat dit gat open bij een behouden badkamer
 * zonder toilet (apartToilet "nee", of "auto" als de toiletruimte vervalt): een variant zonder
 * toilet is geen bruikbaar advies. Wijzigt de variant niet; geeft een nieuwe terug.
 */
export function toiletVangnet<T extends Pick<IndelingVariant, "vertrekken" | "overig">>(
  v: T,
): T & { toiletToegevoegd: boolean; geenToilet: boolean } {
  const uit = { ...v, vertrekken: clone(v.vertrekken), overig: clone(v.overig) };
  if (heeftToilet(uit)) return { ...uit, toiletToegevoegd: false, geenToilet: false };
  const badkamer = [...uit.vertrekken, ...uit.overig].find((r) => r.fac?.kind === "badkamer");
  if (badkamer && badkamer.fac?.kind === "badkamer") {
    badkamer.fac.san.toiletStaand = 1;
    return { ...uit, toiletToegevoegd: true, geenToilet: false };
  }
  return { ...uit, toiletToegevoegd: false, geenToilet: true };
}

// ---------- schema ----------

export interface Blokje {
  label: string;
  m2: number;
  vast: boolean;
  nieuw: boolean;
}

/** Ruimten van een variant als blokjes (naam, m², vast/nieuw) — indelingVariantBlokjes() */
export function blokjes(v: Pick<IndelingVariant, "vertrekken" | "overig">): Blokje[] {
  return v.vertrekken
    .map((r) => ({
      label: r.naam || vertrekType(r.type).l,
      m2: num(r.m2),
      vast: !!r._indVast,
      nieuw: !!r._indNieuw,
    }))
    .concat(
      v.overig.map((r) => ({
        label: r.naam || overigType(r.type).l,
        m2: num(r.m2),
        vast: !!r._indVast,
        nieuw: !!r._indNieuw,
      })),
    )
    .filter((b) => b.m2 > 0);
}

/**
 * Verdeelt ruimten (elk met m²) over een vlak van W×H in een paar rijen, oppervlak evenredig
 * met m² — indelingVloerplanLayout(). Zelfde volgorde als de invoer.
 */
export function vloerplanLayout(items: readonly { m2: number }[], W: number, H: number): Bbox[] {
  const n = items.length;
  if (!n) return [];
  const totaal = items.reduce((s, it) => s + it.m2, 0) || 1;
  const nRijen = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * (H / W))) || 1));
  const volgorde = items.map((it, i) => ({ it, i })).sort((a, b) => b.it.m2 - a.it.m2);
  const rijen = Array.from({ length: nRijen }, () => ({
    items: [] as { it: { m2: number }; i: number }[],
    totaal: 0,
  }));
  volgorde.forEach(({ it, i }) => {
    let doel = rijen[0]!;
    rijen.forEach((r) => {
      if (r.totaal < doel.totaal) doel = r;
    });
    doel.items.push({ it, i });
    doel.totaal += it.m2;
  });
  const out = new Array<Bbox>(n);
  let y = 0;
  rijen
    .filter((r) => r.items.length)
    .forEach((r) => {
      const h = Math.max(1, (r.totaal / totaal) * H);
      let x = 0;
      r.items.forEach(({ it, i }) => {
        const w = Math.max(1, (it.m2 / r.totaal) * W);
        out[i] = { x, y, w, h };
        x += w;
      });
      y += h;
    });
  return out;
}

/** Aan welke buitenrand (binnen 14 px) grenst een blok? Voor het raamsymbool — indelingBuitenrand() */
export function buitenrand(
  x: number,
  y: number,
  w: number,
  h: number,
  W: number,
  H: number,
  PAD: number,
) {
  const marge = 14;
  const afstanden: [string, number][] = [
    ["links", x - PAD],
    ["rechts", W - PAD - (x + w)],
    ["boven", y - PAD],
    ["onder", H - PAD - (y + h)],
  ];
  const dichtstbij = afstanden.reduce((a, b) => (b[1] < a[1] ? b : a));
  return dichtstbij[1] <= marge ? (dichtstbij[0] as "links" | "rechts" | "boven" | "onder") : null;
}

/** Kleinste rechthoek om alle geldige bbox'en — indelingUnieBbox() (voor fase 4) */
export function unieBbox(rooms: readonly { bbox?: unknown }[]): Bbox | null {
  const geldig = rooms.filter((r) => bboxOk(r.bbox)).map((r) => r.bbox as Bbox);
  if (!geldig.length) return null;
  const x0 = Math.min(...geldig.map((b) => b.x)),
    y0 = Math.min(...geldig.map((b) => b.y));
  const x1 = Math.max(...geldig.map((b) => b.x + b.w)),
    y1 = Math.max(...geldig.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: Math.max(0.02, x1 - x0), h: Math.max(0.02, y1 - y0) };
}

// ---------- toepassen ----------

/**
 * De invoer na het toepassen van een variant — indelingToepassen(): ruimten van de variant,
 * zonder de schema-markeringen en zonder bbox's. Bewust anders dan de bron: plattegrondImg
 * wordt verwijderd (de bron zet er een getekend schema voor in de plaats). Geen stil invullen
 * door het PvE: de variant wordt precies overgenomen zoals hij is gemaakt.
 */
export function toepassen(
  input: WwsInput,
  v: Pick<IndelingVariant, "vertrekken" | "overig">,
): WwsInput {
  const uit = clone(input) as WwsInput & { plattegrondImg?: unknown };
  const strip = (r: IndelingRij) => {
    const x = clone(r);
    delete x._indVast;
    delete x._indNieuw;
    delete x.bbox;
    return x;
  };
  uit.vertrekken = v.vertrekken.map(strip) as Vertrek[];
  uit.overig = v.overig.map(strip) as OverigeRuimte[];
  delete uit.plattegrondImg;
  return uit;
}
