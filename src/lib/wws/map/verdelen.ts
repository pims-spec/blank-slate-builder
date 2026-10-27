// "Map inlezen": een hele map (van de computer of uit Google Drive) verdelen in de plattegrond en de
// foto's. Eerst op bestandstype (een PDF is een plattegrond) en bestandsnaam ("plattegrond",
// "bouwtekening", "floorplan"…); daarna kan de foto-sortering van Gemini een afbeelding nog als
// plattegrond herkennen (metSortering). De gebruiker kijkt alles na voordat er iets gebeurt.
import { MAX_WONING_FOTOS, type FotoSortering } from "../foto/sorteren";

/** Groter wordt overgeslagen (een telefoonfoto is een paar MB, een PDF-tekening zelden meer) */
export const MAX_BESTAND_MB = 25;

export interface MapBestand {
  /** Pad in de map, bijv. "Woning/keuken 1.jpg"; zonder map gewoon de naam */
  pad: string;
  /** MIME-type zoals de browser of Drive het opgeeft; mag leeg zijn */
  type: string;
  /** Bytes; 0 = onbekend */
  grootte: number;
}

export type MapLabel = "plattegrond" | "foto" | "niet";
/** Waaraan de plattegrond herkend is */
export type MapBron = "pdf" | "naam" | "ai";

export interface MapItem {
  /** Index in de lijst bestanden die verdeelMap kreeg */
  i: number;
  pad: string;
  soort: "pdf" | "afbeelding";
  label: MapLabel;
  bron: MapBron | null;
  /** Wat de foto-sortering zei (alleen bij afbeeldingen die gesorteerd zijn) */
  sortering?: FotoSortering;
}

export interface Overgeslagen {
  pad: string;
  reden: string;
}

const naamVan = (pad: string) => pad.split("/").pop() ?? pad;
const extensie = (pad: string) => /\.([a-z0-9]+)$/i.exec(naamVan(pad))?.[1]?.toLowerCase() ?? "";

/** Systeembestanden en verborgen bestanden ("._foto.jpg", ".DS_Store", "__MACOSX/…", Thumbs.db) */
export function isVerborgen(pad: string): boolean {
  return pad
    .split("/")
    .some((d) => d.startsWith(".") || d === "__MACOSX" || /^(thumbs\.db|desktop\.ini)$/i.test(d));
}

/** pdf, afbeelding (JPG, PNG, WebP), heic (kan de browser meestal niet lezen) of null */
export function bestandSoort(pad: string, type: string): "pdf" | "afbeelding" | "heic" | null {
  const t = type.toLowerCase();
  const ext = extensie(pad);
  if (t === "application/pdf" || (!t && ext === "pdf")) return "pdf";
  if (/^image\/hei[cf]/.test(t) || ext === "heic" || ext === "heif") return "heic";
  if (/^image\/(jpeg|png|webp)$/.test(t)) return "afbeelding";
  if (!t && /^(jpe?g|png|webp)$/.test(ext)) return "afbeelding";
  return null;
}

/** Zegt de bestandsnaam dat het een plattegrond is? */
export function naamIsPlattegrond(pad: string): boolean {
  const n = naamVan(pad)
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ");
  return /(plattegrond|bouwtekening|floor ?plan|plattegr\b|\btekening|\bplan\b|\bpg\b)/.test(n);
}

/**
 * De bestanden van de map verdelen. Op pad gesorteerd (nummers op volgorde). Hoogstens 30 foto's;
 * de rest, verborgen bestanden niet meegerekend, komt bij overgeslagen met de reden.
 */
export function verdeelMap(bestanden: readonly MapBestand[]): {
  items: MapItem[];
  overgeslagen: Overgeslagen[];
} {
  const volgorde = bestanden
    .map((b, i) => ({ ...b, i }))
    .filter((b) => !isVerborgen(b.pad))
    .sort((a, b) => a.pad.localeCompare(b.pad, "nl", { numeric: true, sensitivity: "base" }));
  const items: MapItem[] = [];
  const overgeslagen: Overgeslagen[] = [];
  let fotos = 0;
  for (const b of volgorde) {
    const soort = bestandSoort(b.pad, b.type);
    const sla = (reden: string) => overgeslagen.push({ pad: b.pad, reden });
    if (!soort) sla("Geen foto (JPG, PNG, WebP) of PDF.");
    else if (soort === "heic")
      sla(
        "HEIC kan de browser niet lezen. Zet de foto's op de telefoon op 'Meest compatibel' (JPG).",
      );
    else if (b.grootte > MAX_BESTAND_MB * 1024 * 1024) sla(`Groter dan ${MAX_BESTAND_MB} MB.`);
    else if (soort === "pdf")
      items.push({ i: b.i, pad: b.pad, soort, label: "plattegrond", bron: "pdf" });
    else if (naamIsPlattegrond(b.pad))
      items.push({ i: b.i, pad: b.pad, soort, label: "plattegrond", bron: "naam" });
    else if (fotos >= MAX_WONING_FOTOS) sla(`Meer dan ${MAX_WONING_FOTOS} foto's.`);
    else {
      fotos++;
      items.push({ i: b.i, pad: b.pad, soort, label: "foto", bron: null });
    }
  }
  return { items, overgeslagen };
}

/** De items die naar de foto-sortering gaan: de afbeeldingen met label foto, in volgorde */
export const teSorteren = (items: readonly MapItem[]) =>
  items.filter((x) => x.soort === "afbeelding" && x.label === "foto");

/**
 * De uitkomst van de sortering (in de volgorde van teSorteren) bij de items zetten. Wat Gemini
 * een plattegrond noemt, krijgt dat label (bron ai).
 */
export function metSortering(
  items: readonly MapItem[],
  sortering: readonly FotoSortering[],
): MapItem[] {
  const per = new Map(teSorteren(items).map((x, j) => [x.i, sortering[j]]));
  return items.map((x) => {
    const s = per.get(x.i);
    if (!s) return x;
    return s.soort === "plattegrond"
      ? { ...x, sortering: s, label: "plattegrond", bron: "ai" }
      : { ...x, sortering: s };
  });
}

const BRON_VOORKEUR: Record<MapBron, number> = { pdf: 0, naam: 1, ai: 2 };

/** Welke plattegrond standaard wordt ingelezen: liefst een PDF, dan op naam, dan door de AI */
export function kiesPlattegrond(items: readonly MapItem[]): number | null {
  const p = items
    .filter((x) => x.label === "plattegrond")
    .sort((a, b) => BRON_VOORKEUR[a.bron ?? "ai"] - BRON_VOORKEUR[b.bron ?? "ai"]);
  return p[0]?.i ?? null;
}

/** De keuzes per label; een PDF kan geen foto zijn */
export const labelOpties = (x: MapItem): MapLabel[] =>
  x.soort === "pdf" ? ["plattegrond", "niet"] : ["plattegrond", "foto", "niet"];

/**
 * Wat er na het nakijken gebeurt: de plattegrond die wordt ingelezen (index of null) en de foto's
 * met hun sortering. Een foto zonder sortering (de gebruiker maakte er zelf een foto van) of met
 * "plattegrond" telt als "anders": die kiest de gebruiker daarna zelf bij een ruimte.
 */
export function mapStappen(
  items: readonly MapItem[],
  plattegrond: number | null,
): {
  plattegrond: number | null;
  fotos: number[];
  sortering: FotoSortering[];
  fout: string | null;
} {
  const p = items.find((x) => x.i === plattegrond && x.label === "plattegrond")?.i ?? null;
  const fotos = items.filter((x) => x.label === "foto");
  const sortering = fotos.map((x) =>
    x.sortering && x.sortering.soort !== "plattegrond"
      ? x.sortering
      : { soort: "anders" as const, reden: "Niet gesorteerd; kies zelf de ruimte." },
  );
  const fout =
    fotos.length > MAX_WONING_FOTOS
      ? `Hoogstens ${MAX_WONING_FOTOS} foto's; er zijn er ${fotos.length}.`
      : p === null && fotos.length === 0
        ? "Kies een plattegrond of minstens één foto."
        : null;
  return { plattegrond: p, fotos: fotos.map((x) => x.i), sortering, fout };
}
