import { calc } from "../calc";
import { legeInput } from "../legeInput";
import type { Normen } from "../normen";
import type { Segment, WwsInput } from "../types";
import type { Bewerker, TellingDoc, TellingMeta, VersieDoc, VersieResultaat } from "./types";

type Obj = Record<string, unknown>;
/** Ingelezen jsonb: dezelfde velden als T, maar nog niet gecontroleerd */
type Los<T> = { [K in keyof T]?: unknown };
type MetaVeld =
  "naam" | "adres" | "postcode" | "huisnummer" | "plaats" | "bouwjaar" | "peildatum" | "opsteller";
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const tekst = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
const getal = (v: unknown, standaard: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : standaard;
const getalOfNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const vandaag = () => new Date().toISOString().slice(0, 10);

/** Lege meta, gelijk aan emptyTelling().meta in wws-site.html (zonder klant/favoriet). */
export function legeMeta(): TellingMeta {
  return {
    naam: "",
    adres: "",
    postcode: "",
    huisnummer: "",
    plaats: "",
    bouwjaar: "",
    peildatum: vandaag(),
    opsteller: "",
  };
}

/** "Straat 12, Plaats" — zoals weergaveAdres() in wws-site.html */
export function weergaveAdres(meta: Partial<TellingMeta> | null | undefined): string {
  const m = meta ?? {};
  const straatHn = [m.adres, m.huisnummer].filter(Boolean).join(" ").trim();
  return [straatHn, m.plaats].filter(Boolean).join(", ");
}

/** Naam voor in lijsten: de naam van de telling, anders het adres. */
export function tellingTitel(meta: Partial<TellingMeta> | null | undefined): string {
  return (meta?.naam || weergaveAdres(meta) || "Naamloze telling").trim();
}

/** Zoals standaardVersieNaam() in wws-site.html */
export function standaardVersieNaam(meta: Partial<TellingMeta>, nr: number): string {
  return (weergaveAdres(meta) || meta.naam || "Puntentelling").trim() + " - versie " + nr;
}

/** Sleutel van een versie in telling_versies.id: v0001, v0002, … */
export function versieId(nr: number): string {
  return "v" + String(nr).padStart(4, "0");
}

/**
 * Zet een opgeslagen (of onvolledige) invoer om naar een geldige WwsInput: ontbrekende
 * rubrieken en velden worden aangevuld met de waarden van een lege telling.
 */
export function leesInput(raw: unknown): WwsInput {
  const basis = legeInput() as unknown as Obj;
  if (!isObj(raw)) return basis as unknown as WwsInput;
  const uit: Obj = { ...basis, ...raw };
  for (const [k, standaard] of Object.entries(basis)) {
    const waarde = raw[k];
    if (Array.isArray(standaard)) uit[k] = Array.isArray(waarde) ? waarde : standaard;
    else if (isObj(standaard)) uit[k] = isObj(waarde) ? { ...standaard, ...waarde } : standaard;
  }
  // lijsten binnen rubrieken (de rubrieken zelf zijn hierboven al nieuwe objecten)
  const lijsten: [string, string][] = [
    ["buiten", "ruimten"],
    ["gem", "vertrekken"],
    ["gem", "overig"],
  ];
  for (const [rubriek, lijst] of lijsten) {
    const r = uit[rubriek];
    if (isObj(r) && !Array.isArray(r[lijst])) r[lijst] = [];
  }
  return structuredClone(uit) as unknown as WwsInput;
}

export function leesMeta(raw: unknown): TellingMeta {
  const r: Obj & Los<Pick<TellingMeta, MetaVeld>> = isObj(raw) ? raw : {};
  const leeg = legeMeta();
  return {
    ...r,
    naam: tekst(r.naam),
    adres: tekst(r.adres),
    postcode: tekst(r.postcode),
    huisnummer: tekst(r.huisnummer),
    plaats: tekst(r.plaats),
    bouwjaar: tekst(r.bouwjaar),
    peildatum: tekst(r.peildatum) || leeg.peildatum,
    opsteller: tekst(r.opsteller),
  };
}

function leesBewerker(raw: unknown): Bewerker | null {
  if (!isObj(raw)) return null;
  const r: Los<Bewerker> = raw;
  if (typeof r.id !== "string") return null;
  return { id: r.id, naam: tekst(r.naam), email: tekst(r.email) };
}

/** Leest `tellingen.data` uit de database veilig in. */
export function leesTellingDoc(raw: unknown): TellingDoc {
  const r: Los<TellingDoc> = isObj(raw) ? raw : {};
  const versieCount = getal(r.versieCount, 0);
  return {
    meta: leesMeta(r.meta),
    input: leesInput(r.input),
    versieCount,
    aantalVersies: getal(r.aantalVersies, versieCount),
    basedOn: getalOfNull(r.basedOn),
    createdAt: tekst(r.createdAt),
    updatedAt: tekst(r.updatedAt),
    laatstePunten: getalOfNull(r.laatstePunten),
    lastEditedBy: leesBewerker(r.lastEditedBy),
  };
}

const SEGMENTEN: readonly Segment[] = ["laag", "midden", "hoog"];

/** Leest `telling_versies.data` uit de database veilig in. */
export function leesVersieDoc(raw: unknown, standaardNormen: Normen): VersieDoc {
  const r: Los<VersieDoc> = isObj(raw) ? raw : {};
  const res: Los<VersieResultaat> = isObj(r.resultaat) ? r.resultaat : {};
  const seg = SEGMENTEN.find((s) => s === res.seg) ?? "laag";
  return {
    nr: getal(r.nr, 0),
    notitie: tekst(r.notitie),
    createdAt: tekst(r.createdAt),
    meta: leesMeta(r.meta),
    input: leesInput(r.input),
    normen: isObj(r.normen) ? (r.normen as unknown as Normen) : standaardNormen,
    resultaat: {
      totaal: getal(res.totaal, 0),
      exact: getal(res.exact, 0),
      seg,
      maxHuur: getalOfNull(res.maxHuur),
      rows: Array.isArray(res.rows) ? (res.rows as VersieDoc["resultaat"]["rows"]) : [],
    },
  };
}

/** De staat van een telling in de editor. */
export interface TellingStaat {
  meta: TellingMeta;
  input: WwsInput;
  versieCount: number;
  aantalVersies: number;
  basedOn: number | null;
  createdAt: string;
}

export function nieuweTellingStaat(opsteller = "", nu = new Date()): TellingStaat {
  return {
    meta: { ...legeMeta(), opsteller },
    input: legeInput(),
    versieCount: 0,
    aantalVersies: 0,
    basedOn: null,
    createdAt: nu.toISOString(),
  };
}

/** Bouwt `tellingen.data` uit de editorstaat — zoals tellingDoc() in wws-site.html. */
export function maakTellingDoc(
  s: TellingStaat,
  normen: Normen,
  bewerker: Bewerker | null,
  nu = new Date(),
): TellingDoc {
  return {
    meta: structuredClone(s.meta),
    input: structuredClone(s.input),
    versieCount: s.versieCount,
    aantalVersies: s.aantalVersies,
    basedOn: s.basedOn,
    createdAt: s.createdAt,
    updatedAt: nu.toISOString(),
    laatstePunten: calc(s.input, normen).totaal,
    lastEditedBy: bewerker,
  };
}

/**
 * Legt de huidige staat vast als nieuwe versie (nummer = versieCount + 1), met de gebruikte
 * normen en het resultaat — zoals saveVersie() in wws-site.html. Een lege naam wordt de
 * standaardnaam "adres - versie n".
 */
export function maakVersie(
  s: TellingStaat,
  normen: Normen,
  naam: string,
  nu = new Date(),
): VersieDoc {
  const nr = s.versieCount + 1;
  const R = calc(s.input, normen);
  return {
    nr,
    notitie: naam.trim() || standaardVersieNaam(s.meta, nr),
    createdAt: nu.toISOString(),
    meta: structuredClone(s.meta),
    input: structuredClone(s.input),
    normen: structuredClone(normen),
    resultaat: { totaal: R.totaal, exact: R.exact, seg: R.seg, maxHuur: R.maxHuur, rows: R.rows },
  };
}

/** Een versie openen: de werkversie krijgt meta en invoer van die versie (zoals openVersie()). */
export function openVersieInStaat(s: TellingStaat, v: VersieDoc): TellingStaat {
  return {
    ...s,
    meta: structuredClone(v.meta),
    input: leesInput(structuredClone(v.input)),
    basedOn: v.nr,
  };
}
