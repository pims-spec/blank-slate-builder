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
// - de app geeft bouwVariant IndelingOpties mee (raamregel, één toilet, hal bij de woonkamer,
//   open keuken, voorzieningen); zonder opties rekent bouwVariant precies als de bron.
import { ensureFac, facDefault, facKind, num, overigType, r2, vertrekType } from "./basis";
import { calc } from "./calc";
import type { Normen } from "./normen";
import { facIsOnbewerkt, pasPveOpFac, type Pve } from "./pve";
import type {
  Fac,
  FacBadkamer,
  FacKeuken,
  FacKind,
  FacToilet,
  OverigeRuimte,
  Vertrek,
  WwsInput,
  WwsResultaat,
} from "./types";

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
  /** Positie op de ingelezen plattegrond (fracties 0–1) */
  bbox: Bbox | null;
  notch: Notches;
  /** Raam naar de buitenlucht (alleen in de app, zie ruimtenVoorAdvies); ontbreekt = vertrek ja */
  raam?: boolean;
}

/** Een voorgestelde ruimte; _indVast/_indNieuw alleen voor het schema, niet om op te slaan */
export type IndelingRij = (Vertrek | OverigeRuimte) & {
  _indVast?: boolean;
  _indNieuw?: boolean;
  /** Vaste ruimte vergroot met m² uit de hal (opties.halBijWoon) */
  _indErbij?: number;
  bbox?: Bbox;
};

/**
 * Keuzes van de app bij het genereren (bewuste afwijkingen van de bron). Wordt er niets
 * meegegeven, dan rekent bouwVariant als de bron.
 */
export interface IndelingOpties {
  /** Hal en overloop tot 2 m², de rest bij de (nieuwe of vaste) woonkamer */
  halBijWoon?: boolean;
  /** De keuken loopt open over in de woonkamer: samen één "woonkamer met open keuken" */
  keukenOpen?: boolean;
  /** Wat er in elke keuken, badkamer en toiletruimte van de varianten komt */
  voorzieningen?: Voorzieningen | null;
}

/** De voorzieningen die in de woning komen (punt "wat komt er in de woning") */
export interface Voorzieningen {
  keuken: FacKeuken["keuken"];
  san: FacBadkamer["san"];
  toilet: FacToilet["toilet"];
}

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
  /** Aantal slaapkamers in de variant, vaste meegeteld (alleen in de app) */
  slaapTotaal?: number;
  /** Extra punten doordat de hal bij de woonkamer/keuken is getrokken (opties.halBijWoon) */
  halWinst?: number;
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
export function splitsCirculatie(
  rooms: readonly IndelingRuimte[],
  input: WwsInput,
  /** Alleen 2 m² behouden (opties.halBijWoon), niet 30% */
  minimaal = false,
) {
  const gewoneVrij: IndelingRuimte[] = [];
  const behoudenCirculatie: { key: Groep; row: IndelingRij }[] = [];
  let poolUitVerkeer = 0;
  rooms.forEach((r) => {
    if (typeVan(r.key, r.type).verkeer) {
      const behoud = minimaal ? Math.min(r.m2, 2) : Math.min(r.m2, Math.max(2, r2(r.m2 * 0.3)));
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
    poolUitVerkeer,
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
  opties?: IndelingOpties,
): { vertrekken: IndelingRij[]; overig: IndelingRij[]; nSlaap: number } | null {
  const vast = rooms.filter((r) => r.status === "vast");
  const vrij = rooms.filter((r) => r.status === "vrij");
  const circulatie = splitsCirculatie(vrij, input, !!opties?.halBijWoon);
  let pool = circulatie.poolBasis;
  // m² uit de hal die naar de woonkamer of keuken gaan, niet naar de slaapkamers
  let halPool = 0;
  if (opties?.halBijWoon) {
    halPool = circulatie.poolUitVerkeer;
    pool -= halPool;
  }
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
      // app: een toiletruimte hoeft niet groter te zijn dan ca. 1 m² (Bouwbesluit 0,9 × 1,2 m)
      const standaardM2 = { keuken: 8, badkamer: 5, toilet: opties ? 1.1 : 2, was: 3 }[kind];
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
  // app: een woon- of slaapkamer moet een raam hebben, dus er komen niet meer van dan er vrije
  // ruimten met raam zijn
  if (opties) {
    const metRaam = vrij.filter(
      (r) => r.m2 > 0 && !typeVan(r.key, r.type).verkeer && (r.raam ?? r.key === "vertrekken"),
    ).length;
    if (nSlaap + (heeftVasteWoonkamer ? 0 : 1) > metRaam) return null;
  }
  let woon: IndelingRij | null = null;
  if (!heeftVasteWoonkamer) {
    const GEWICHT_WOON = 1.35;
    let woonBasisM2 = nSlaap > 0 ? (pool * GEWICHT_WOON) / (GEWICHT_WOON + nSlaap) : pool;
    woonBasisM2 = Math.max(12, woonBasisM2);
    pool -= woonBasisM2;
    const woonM2 = woonBasisM2 + keukenOpenM2 + halPool;
    halPool = 0;
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
  // app: zonder nieuwe woonkamer gaan de m² uit de hal (en bij 0 slaapkamers de rest van de pot)
  // naar de vaste woonkamer (ook een woonkamer met open keuken). Zonder vaste woonkamer is er
  // altijd een nieuwe, en daar zitten ze al in.
  let erbij = halPool + (opties && nSlaap === 0 && !woon ? pool : 0);
  const erbijNaar =
    erbij > 0
      ? vast.find(
          (r) =>
            r.key === "vertrekken" &&
            ["woonkamer", "woonkamer_ok", "woonslaap", "woonslaap_ok"].includes(r.type) &&
            r.m2 > 0,
        )
      : undefined;
  if (erbijNaar) {
    pool -= erbij - halPool;
  } else {
    pool += halPool;
    erbij = 0;
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
    if (r === erbijNaar) {
      row.m2 = String(r2(num(row.m2) + erbij)).replace(".", ",");
      row.maten = [];
      row._indErbij = r2(erbij);
    }
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
  /** App: ook 0 nieuwe slaapkamers als er al een vaste slaapkamer is (bijv. alleen de hal erbij) */
  metNul = false,
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
  if (
    metNul &&
    rooms.some(
      (r) => r.status === "vast" && (r.type === "slaapkamer" || r.type === "slaap_san") && r.m2 > 0,
    )
  )
    set.add(0);
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
  return varianten(input, rooms, pve, extraSlaap, N, undefined);
}

/**
 * Alle varianten zoals de app ze toont, doorgerekend met calc. Bewuste afwijkingen van de bron:
 * de opties in bouwVariant (raamregel, toiletruimte van 1,1 m², hal bij de woonkamer) en daarna
 * keukenOpenSamenvoegen, voorzieningenToepassen, eenToilet, toiletVangnet en
 * slaapkamersDoornummeren.
 */
export function berekenVarianten(
  input: WwsInput,
  rooms: readonly IndelingRuimte[],
  pve: Pve | null,
  extraSlaap: string,
  N: Normen,
  opties: IndelingOpties = {},
): IndelingVariant[] {
  const uit = varianten(input, rooms, pve, extraSlaap, N, opties);
  if (!opties.halBijWoon) return uit;
  // wat levert de hal bij de woonkamer op? Vergelijk met dezelfde variant zonder
  const zonder = varianten(input, rooms, pve, extraSlaap, N, { ...opties, halBijWoon: false });
  return uit.map((v) => {
    const z = zonder.find((x) => x.nSlaap === v.nSlaap);
    return z ? { ...v, halWinst: r2(v.R.totaal - z.R.totaal) } : v;
  });
}

function varianten(
  input: WwsInput,
  rooms: readonly IndelingRuimte[],
  pve: Pve | null,
  extraSlaap: string,
  N: Normen,
  opties: IndelingOpties | undefined,
): IndelingVariant[] {
  const out: IndelingVariant[] = [];
  kandidaten(rooms, extraSlaap, pve, !!opties).forEach((n) => {
    const kaal = bouwVariant(n, pve, rooms, input, opties);
    if (!kaal) return;
    // de bewuste afwijkingen als aparte stappen na bouwVariant
    let v: Omit<IndelingVariant, "R" | "input"> = kaal;
    if (opties) {
      if (opties.keukenOpen) v = keukenOpenSamenvoegen(v);
      if (opties.voorzieningen) v = voorzieningenToepassen(v, opties.voorzieningen);
      if (!meerWoonlagen(input)) v = eenToilet(v);
      v = slaapkamersDoornummeren(toiletVangnet(v));
      v = { ...v, slaapTotaal: aantalSlaapkamers(v) };
    }
    const genInput = clone(input);
    genInput.vertrekken = v.vertrekken as Vertrek[];
    genInput.overig = v.overig as OverigeRuimte[];
    out.push({ ...v, R: calc(genInput, N), input: genInput });
  });
  return out;
}

const aantalSlaapkamers = (v: Pick<IndelingVariant, "vertrekken">) =>
  v.vertrekken.filter((r) => (r.type === "slaapkamer" || r.type === "slaap_san") && num(r.m2) > 0)
    .length;

// ---------- woonlagen, raam en toilet (bewuste afwijking van de bron) ----------

const VERDIEPING_TYPES = new Set(["overloop", "zolderkamer", "zolder"]);

/** Meer dan één woonlaag: een eengezinswoning, of een overloop, zolderkamer of zolder in de telling */
export function meerWoonlagen(input: WwsInput): boolean {
  if (input.woningtype === "eengezins") return true;
  return [...input.vertrekken, ...input.overig].some(
    (r) => VERDIEPING_TYPES.has(r.type) && num(r.m2) > 0,
  );
}

/** Heeft de ruimte een raam naar buiten? Onbekend: een vertrek wel, de rest niet */
export function heeftRaam(key: Groep, rij: { type: string; raam?: boolean }): boolean {
  if (typeof rij.raam === "boolean") return rij.raam;
  return key === "vertrekken";
}

const midden = (b: Bbox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/**
 * Welk toilet blijft er bij twee of meer toiletruimten? Het toilet op de meest logische plek: het
 * dichtst bij een getekende hal of gang. Weet de app dat niet, dan het kleinste toilet van minstens
 * 0,9 m² (een toilet hoeft niet groter te zijn dan ca. 1 m²), anders het grootste.
 */
export function logischToilet(
  toiletten: readonly IndelingRuimte[],
  rooms: readonly IndelingRuimte[],
): IndelingRuimte | undefined {
  const hal = rooms.find((r) => r.bbox && typeVan(r.key, r.type).verkeer)?.bbox;
  const metBbox = toiletten.filter((t) => t.bbox);
  if (hal && metBbox.length) {
    const h = midden(hal);
    const afstand = (t: IndelingRuimte) => {
      const m = midden(t.bbox!);
      return Math.hypot(m.x - h.x, m.y - h.y);
    };
    return metBbox.reduce((a, b) => (afstand(b) < afstand(a) ? b : a));
  }
  const groot = toiletten.filter((t) => t.m2 >= 0.9);
  if (groot.length) return groot.reduce((a, b) => (b.m2 < a.m2 ? b : a));
  return toiletten.reduce((a, b) => (b.m2 > a.m2 ? b : a), toiletten[0]!);
}

/**
 * De ruimten voor het advies in de app: ruimtenUitTelling plus het raam per ruimte, en in een
 * woning met één woonlaag blijft er één toiletruimte vast (logischToilet); de andere staan op
 * "vrij herindelen", zodat hun m² naar andere ruimten gaan.
 */
export function ruimtenVoorAdvies(input: WwsInput): IndelingRuimte[] {
  const rooms = ruimtenUitTelling(input).map((r) => {
    const rij = input[r.key][r.idx] as { type: string; raam?: boolean };
    return { ...r, raam: heeftRaam(r.key, rij) };
  });
  if (meerWoonlagen(input)) return rooms;
  const toiletten = rooms.filter((r) => r.kind === "toilet" && r.m2 > 0);
  if (toiletten.length < 2) return rooms;
  const blijft = logischToilet(toiletten, rooms);
  return rooms.map((r) => (toiletten.includes(r) && r !== blijft ? { ...r, status: "vrij" } : r));
}

/**
 * Eén woonlaag: is er een toiletruimte met toilet, dan krijgt de badkamer geen toilet meer.
 * Eén toilet is genoeg. Wijzigt de variant niet.
 */
export function eenToilet<T extends Pick<IndelingVariant, "vertrekken" | "overig">>(v: T): T {
  const toiletruimte = v.overig.some(
    (r) => r.fac?.kind === "toilet" && r.fac.toilet.toilet !== "geen" && num(r.m2) > 0,
  );
  if (!toiletruimte) return v;
  const uit = { ...v, vertrekken: clone(v.vertrekken) };
  uit.vertrekken.forEach((r) => {
    if (r.fac?.kind === "badkamer") {
      r.fac.san.toiletStaand = 0;
      r.fac.san.toiletHang = 0;
    }
  });
  return uit;
}

// ---------- open keuken en voorzieningen (bewuste afwijking van de bron) ----------

/**
 * De keuken loopt open over in de woonkamer: de eerste keuken en de eerste woonkamer worden
 * samen één "woonkamer met open keuken" (m² opgeteld, de voorzieningen van de keuken). Een open
 * keuken is geen aparte keuken. Wijzigt de variant niet.
 */
export function keukenOpenSamenvoegen<T extends Pick<IndelingVariant, "vertrekken" | "overig">>(
  v: T,
): T {
  const ki = v.vertrekken.findIndex((r) => r.type === "keuken" && num(r.m2) > 0);
  const wi = v.vertrekken.findIndex((r) => r.type === "woonkamer" && num(r.m2) > 0);
  if (ki < 0 || wi < 0) return v;
  const k = v.vertrekken[ki]!,
    w = v.vertrekken[wi]!;
  const samen = {
    type: "woonkamer_ok",
    naam: "Woonkamer met open keuken",
    m2: String(r2(num(k.m2) + num(w.m2))).replace(".", ","),
    maten: [],
    verwarmd: !!(w.verwarmd || k.verwarmd),
    fac: clone(k.fac),
  } as IndelingRij;
  if (k._indVast && w._indVast) samen._indVast = true;
  else samen._indNieuw = true;
  if (k.raam || w.raam) samen.raam = true;
  const erbij = num(k._indErbij) + num(w._indErbij);
  if (erbij > 0) samen._indErbij = r2(erbij);
  const vertrekken = v.vertrekken.filter((_, i) => i !== ki);
  vertrekken[vertrekken.indexOf(w)] = samen;
  return { ...v, vertrekken };
}

/**
 * Wat erin komt: elke keuken (ook een woonkamer met open keuken), badkamer en toiletruimte van
 * de variant krijgt deze voorzieningen. Wijzigt de variant niet.
 */
export function voorzieningenToepassen<T extends Pick<IndelingVariant, "vertrekken" | "overig">>(
  v: T,
  vz: Voorzieningen,
): T {
  const zet = (r: IndelingRij): IndelingRij => {
    const f = r.fac;
    if (!f) return r;
    if (f.kind === "keuken") return { ...r, fac: { kind: "keuken", keuken: clone(vz.keuken) } };
    if (f.kind === "badkamer") return { ...r, fac: { kind: "badkamer", san: clone(vz.san) } };
    if (f.kind === "toilet") return { ...r, fac: { kind: "toilet", toilet: clone(vz.toilet) } };
    return r;
  };
  return { ...v, vertrekken: v.vertrekken.map(zet), overig: v.overig.map(zet) };
}

/**
 * Beginwaarden voor "wat komt er in de woning": per voorziening het PvE (als dat onderdeel actief
 * is), anders wat er in de telling al is ingevuld, anders de standaard (staand toilet, wastafel en
 * douche, aanrecht 1–2 m).
 */
export function standaardVoorzieningen(input: WwsInput, pve: Pve | null): Voorzieningen {
  const facs = [...input.vertrekken, ...input.overig].map((r) => r.fac).filter(Boolean) as Fac[];
  const ingevuld = <K extends FacKind>(kind: K) =>
    facs.find((f) => f.kind === kind && !facIsOnbewerkt(f)) as
      Extract<Fac, { kind: K }> | undefined;
  const keuken = pve?.keuken?.actief
    ? pve.keuken.keuken
    : (ingevuld("keuken")?.keuken ?? (facDefault("keuken") as FacKeuken).keuken);
  const san = pve?.badkamer?.actief
    ? pve.badkamer.san
    : (ingevuld("badkamer")?.san ?? (facDefault("badkamer") as FacBadkamer).san);
  const toilet = pve?.toilet?.actief
    ? pve.toilet.toilet
    : (ingevuld("toilet")?.toilet ?? (facDefault("toilet") as FacToilet).toilet);
  return clone({ keuken, san, toilet });
}

/** Beginwaarde van "keuken is open naar de woonkamer": een keuken die zo is ingelezen */
export function keukenOpenStandaard(input: WwsInput): boolean {
  return input.vertrekken.some((r) => r.type === "keuken" && r.openKeuken === true);
}

// ---------- slaapkamers doornummeren (bewuste afwijking van de bron) ----------

const SLAAPKAMER_NAAM = /^Slaapkamer (\d+)$/i;

/**
 * Nieuw voorgestelde slaapkamers heten in de bron altijd "Slaapkamer 1", "Slaapkamer 2", …,
 * ook als er al een vaste "Slaapkamer 1" is (twee keer dezelfde naam). Hier worden ze
 * doorgenummerd na het hoogste nummer van de bestaande (niet-nieuwe) ruimten. Alleen de namen
 * die bouwVariant zelf gaf; de punten veranderen niet. Wijzigt de variant zelf niet.
 */
export function slaapkamersDoornummeren<T extends Pick<IndelingVariant, "vertrekken" | "overig">>(
  v: T,
): T {
  const alle = [...v.vertrekken, ...v.overig];
  const hoogste = alle
    .filter((r) => !r._indNieuw)
    .map((r) => SLAAPKAMER_NAAM.exec(String(r.naam ?? "").trim()))
    .reduce((m, x) => (x ? Math.max(m, Number(x[1])) : m), 0);
  if (!hoogste) return v;
  let nr = hoogste;
  const hernoem = (r: IndelingRij): IndelingRij =>
    r._indNieuw && r.type === "slaapkamer" && SLAAPKAMER_NAAM.test(String(r.naam ?? ""))
      ? { ...r, naam: "Slaapkamer " + ++nr }
      : r;
  return { ...v, vertrekken: v.vertrekken.map(hernoem), overig: v.overig.map(hernoem) };
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
 * zonder de schema-markeringen en zonder bbox's. De oude plattegrond (plattegrondImg of de
 * verwijzing naar Storage) past niet meer bij de nieuwe indeling en gaat eruit; de editor zet er
 * het blokkenschema of de AI-afbeelding voor in de plaats, zoals de bron. Geen stil invullen
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
    delete x._indErbij;
    delete x.bbox;
    return x;
  };
  uit.vertrekken = v.vertrekken.map(strip) as Vertrek[];
  uit.overig = v.overig.map(strip) as OverigeRuimte[];
  delete uit.plattegrondImg;
  delete uit.plattegrond;
  return uit;
}

// ---------- tekenen op de plattegrond ----------

export type RuimteWijziging = Partial<{
  bbox: Bbox;
  m2: number;
  notch: Notches;
  herkomst: string | undefined;
}>;

/**
 * Een vlak op de plattegrond is verplaatst/vergroot/ingekeept: in de ruimtelijst én in de
 * telling zelf (de bron wijzigde cur.input direct). Geeft nieuwe kopieën terug.
 */
export function ruimteWijzigen(
  input: WwsInput,
  rooms: readonly IndelingRuimte[],
  i: number,
  w: RuimteWijziging,
): { input: WwsInput; rooms: IndelingRuimte[] } {
  const r = rooms[i];
  if (!r) return { input, rooms: [...rooms] };
  const nr: IndelingRuimte = { ...r };
  if (w.bbox) nr.bbox = w.bbox;
  if (w.m2 !== undefined) nr.m2 = w.m2;
  if (w.notch) nr.notch = w.notch;
  const uit = { ...input, [r.key]: [...input[r.key]] } as WwsInput;
  const lijst = uit[r.key] as (IndelingRij & { notch?: unknown; herkomst?: string })[];
  const bron = lijst[r.idx];
  if (bron) {
    const b = { ...bron };
    if (w.bbox) b.bbox = w.bbox;
    if (w.m2 !== undefined) b.m2 = String(w.m2).replace(".", ",");
    if (w.notch) {
      if (Object.values(w.notch).every((x) => !x)) delete b.notch;
      else b.notch = w.notch;
    }
    if (w.herkomst !== undefined) b.herkomst = w.herkomst;
    lijst[r.idx] = b;
  }
  return { input: uit, rooms: rooms.map((x, j) => (j === i ? nr : x)) };
}

/** Een op de tekening ingetekende ruimte toevoegen — indelingVoegRuimteToe(), met lege voorzieningen */
export function ruimteToevoegen(
  input: WwsInput,
  rooms: readonly IndelingRuimte[],
  n: { key: Groep; type: string; naam: string; m2: string; bbox: Bbox },
): { input: WwsInput; rooms: IndelingRuimte[] } {
  const rij = {
    type: n.type,
    naam: n.naam,
    m2: n.m2,
    maten: [],
    bbox: { ...n.bbox },
    verwarmd: autoVerwarmd(n.key, n.type),
  } as unknown as Vertrek & OverigeRuimte;
  // bewuste afwijking: een getekende ruimte begint leeg, net als een ingelezen ruimte (de bron
  // vulde de standaard in: staand toilet, wastafel en douche)
  ensureFac(n.key, rij, true);
  const uit = { ...input, [n.key]: [...input[n.key], rij] } as WwsInput;
  const kind = facKind(n.key, n.type);
  return {
    input: uit,
    rooms: [
      ...rooms,
      {
        key: n.key,
        idx: uit[n.key].length - 1,
        naam: n.naam,
        type: n.type,
        m2: num(n.m2),
        kind,
        status: kind ? "vast" : "vrij",
        bbox: { ...n.bbox },
        notch: normaliseerNotch(null),
      },
    ],
  };
}
