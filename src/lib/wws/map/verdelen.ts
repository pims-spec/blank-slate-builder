// "Map inlezen": een hele map (van de computer of uit Google Drive) verdelen in de plattegrond en de
// foto's. Eerst op bestandstype (een PDF is een plattegrond) en bestandsnaam ("plattegrond",
// "bouwtekening", "floorplan"…); daarna kan de foto-sortering van Gemini een afbeelding nog als
// plattegrond herkennen (metSortering). De gebruiker kijkt alles na voordat er iets gebeurt.
import { MAX_WONING_FOTOS, type FotoSortering } from "../foto/sorteren";
import {
  MAX_VERDIEPINGEN,
  stelVerdiepingVoor,
  VERDIEPING_NAMEN,
} from "../plattegrond/verdiepingen";

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
  /** Bij een plattegrond: de verdieping (of "Berging") */
  verdieping?: string;
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
  return { items: metVerdiepingen(items), overgeslagen };
}

/** Volgorde waarin plattegronden zonder herkenbare naam een verdieping krijgen */
const VOLGORDE = [
  "Begane grond",
  "1e verdieping",
  "2e verdieping",
  "3e verdieping",
  "4e verdieping",
];

/**
 * Elke plattegrond zonder verdieping krijgt er een: eerst die met een verdieping in de
 * bestandsnaam, dan de rest de eerste vrije (begane grond, 1e, …). Nooit dubbel als dat kan.
 */
export function metVerdiepingen(items: readonly MapItem[]): MapItem[] {
  const bezet = new Set(
    items.flatMap((x) => (x.label === "plattegrond" && x.verdieping ? [x.verdieping] : [])),
  );
  const uit = items.map((x) => ({ ...x }));
  const open = uit.filter((x) => x.label === "plattegrond" && !x.verdieping);
  // zegt de naam iets? dan is het voorstel niet afhankelijk van het volgnummer
  const uitNaam = (pad: string) =>
    stelVerdiepingVoor(pad, 0) === stelVerdiepingVoor(pad, 1) ? stelVerdiepingVoor(pad, 0) : null;
  for (const x of open) {
    const v = uitNaam(x.pad);
    if (v && !bezet.has(v)) {
      x.verdieping = v;
      bezet.add(v);
    }
  }
  for (const x of open) {
    if (x.verdieping) continue;
    const v = VOLGORDE.find((n) => !bezet.has(n)) ?? "Begane grond";
    x.verdieping = v;
    bezet.add(v);
  }
  return uit;
}

/** De items die naar de foto-sortering gaan: de afbeeldingen met label foto, in volgorde */
export const teSorteren = (items: readonly MapItem[]) =>
  items.filter((x) => x.soort === "afbeelding" && x.label === "foto");

/**
 * De uitkomst van de sortering (in de volgorde van teSorteren) bij de items zetten. Wat Gemini
 * een plattegrond noemt, krijgt dat label (bron ai) en een verdieping; een andere ruimte dan
 * keuken, badkamer of toilet wordt niet gebruikt (de fotobeoordeling kent alleen die drie).
 */
export function metSortering(
  items: readonly MapItem[],
  sortering: readonly FotoSortering[],
): MapItem[] {
  const per = new Map(teSorteren(items).map((x, j) => [x.i, sortering[j]]));
  return metVerdiepingen(
    items.map((x) => {
      const s = per.get(x.i);
      if (!s) return x;
      if (s.soort === "plattegrond")
        return { ...x, sortering: s, label: "plattegrond", bron: "ai" };
      return s.soort === "anders" ? { ...x, sortering: s, label: "niet" } : { ...x, sortering: s };
    }),
  );
}

// ---------- één keuzelijst per bestand ----------
// Badkamer, toilet en keuken (een foto voor de fotobeoordeling), een verdieping of berging (een
// plattegrond), of niet gebruiken. "foto" is een foto waarvan de ruimte later wordt gekozen (als
// het herkennen niet lukte).

export const FOTO_KEUZES = ["badkamer", "toilet", "keuken"] as const;
export const PLATTEGROND_KEUZES = [
  "Begane grond",
  "1e verdieping",
  "2e verdieping",
  "3e verdieping",
  "Berging",
] as const;
export type MapKeuze = string;

const isFotoKeuze = (k: string): k is (typeof FOTO_KEUZES)[number] =>
  (FOTO_KEUZES as readonly string[]).includes(k);

/** De keuze die nu bij het bestand hoort */
export function keuzeVan(x: MapItem): MapKeuze {
  if (x.label === "niet") return "niet";
  if (x.label === "plattegrond") return x.verdieping ?? "Begane grond";
  const s = x.sortering?.soort;
  return s && isFotoKeuze(s) ? s : "foto";
}

/** Het bestand met een andere keuze (een PDF kan geen foto zijn) */
export function metKeuze(x: MapItem, k: MapKeuze): MapItem {
  if (k === "niet") return { ...x, label: "niet" };
  if (k === "foto") return x.soort === "pdf" ? x : { ...x, label: "foto" };
  if (isFotoKeuze(k)) {
    if (x.soort === "pdf") return x;
    const reden = x.sortering?.soort === k ? x.sortering.reden : "Zelf gekozen.";
    return { ...x, label: "foto", sortering: { soort: k, reden } };
  }
  if (!(VERDIEPING_NAMEN as readonly string[]).includes(k)) return x;
  return { ...x, label: "plattegrond", verdieping: k };
}

/** De keuzes in de lijst, gegroepeerd; de huidige staat er altijd tussen */
export function keuzeOpties(x: MapItem): { fotos: string[]; plattegronden: string[] } {
  const huidig = keuzeVan(x);
  const fotos: string[] = x.soort === "pdf" ? [] : [...FOTO_KEUZES];
  if (huidig === "foto") fotos.push("foto");
  const plattegronden: string[] = [...PLATTEGROND_KEUZES];
  if (x.label === "plattegrond" && !plattegronden.includes(huidig)) plattegronden.push(huidig);
  return { fotos, plattegronden };
}

/**
 * Wat er na het nakijken gebeurt: de plattegronden die worden ingelezen (elk een verdieping, in de
 * volgorde van de map) en de foto's met hun sortering. Een foto zonder sortering (de gebruiker
 * maakte er zelf een foto van) of met "plattegrond" telt als "anders": die kiest de gebruiker
 * daarna zelf bij een ruimte.
 */
export function mapStappen(items: readonly MapItem[]): {
  plattegronden: number[];
  /** De verdieping per plattegrond */
  verdiepingen: string[];
  fotos: number[];
  sortering: FotoSortering[];
  fout: string | null;
} {
  const platItems = items.filter((x) => x.label === "plattegrond");
  const plattegronden = platItems.map((x) => x.i);
  const verdiepingen = platItems.map((x) => x.verdieping ?? "Begane grond");
  const fotos = items.filter((x) => x.label === "foto");
  const sortering = fotos.map((x) =>
    x.sortering && x.sortering.soort !== "plattegrond"
      ? x.sortering
      : { soort: "anders" as const, reden: "Niet gesorteerd; kies zelf de ruimte." },
  );
  const fout =
    fotos.length > MAX_WONING_FOTOS
      ? `Hoogstens ${MAX_WONING_FOTOS} foto's; er zijn er ${fotos.length}.`
      : plattegronden.length > MAX_VERDIEPINGEN
        ? `Hoogstens ${MAX_VERDIEPINGEN} plattegronden (verdiepingen); zet de rest op Niet gebruiken.`
        : new Set(verdiepingen).size < verdiepingen.length
          ? "Twee plattegronden hebben dezelfde verdieping. Kies bij elke plattegrond een andere."
          : plattegronden.length === 0 && fotos.length === 0
            ? "Kies een plattegrond of minstens één foto."
            : null;
  return { plattegronden, verdiepingen, fotos: fotos.map((x) => x.i), sortering, fout };
}
