// Gedeelde PDF-stijl en hulpfuncties — de PDF_*-constanten, pdfTxt(), wozCapNoteText(),
// facSummary() en segName() uit wws-site.html. jsPDF en jspdf-autotable worden meegegeven
// (PdfLib), zodat ze in de browser pas bij het downloaden geladen worden (zie laden.ts).
import type { jsPDF } from "jspdf";
import type { autoTable as AutoTable, UserOptions } from "jspdf-autotable";
import { num } from "../basis";
import { SEGMENT_NAMEN } from "../calc";
import type { Normen } from "../normen";
import type { Fac, FacBadkamer, FacKind, Segment, WwsResultaat } from "../types";

export type Doc = jsPDF;
/** Ingesloten huisstijl-lettertype (Inter 4.1, vendor/fonts), als base64-TTF */
export interface Lettertype {
  regular: string;
  bold: string;
}
export interface PdfLib {
  jsPDF: typeof jsPDF;
  autoTable: typeof AutoTable;
  /** Zonder lettertype: Helvetica, zoals de bron */
  lettertype?: Lettertype | undefined;
}
export type RGB = [number, number, number];

export const PDF_W = 210,
  PDF_M = 16;
// Kleuren van GoHome UI: indigo #5B41FF, inkt #1d1d1f, stille tekst #636A77, Frost #EDF0FF,
// haarlijn #E5E5EA, Wash #FFF5E5 met Ember #C2410C
export const PDF_PUR: RGB = [91, 65, 255],
  PDF_INK: RGB = [29, 29, 31],
  PDF_MUT: RGB = [99, 106, 119],
  PDF_SOFT: RGB = [237, 240, 255],
  PDF_ALT: RGB = [247, 247, 250],
  PDF_LINE: RGB = [229, 229, 234];
/** Grijs canvas van GoHome UI (#F2F2F7): de achtergrond van het voorblad */
export const PDF_CANVAS: RGB = [242, 242, 247];
/** Hoek van een kaart: 12px in de gids, in mm op A4 */
export const PDF_KAART_HOEK = 3.2;
export const PDF_WARN_BG: RGB = [255, 245, 229],
  PDF_WARN_INK: RGB = [194, 65, 12];
export const PDF_SEGC: Record<Segment, RGB> = {
  laag: [229, 72, 77],
  midden: [255, 124, 58],
  hoog: [48, 164, 108],
};
/**
 * jsPDF's standaardlettertype (Helvetica) kent geen ², – en ≤. De bron vervangt alleen ² en –;
 * een tekst met "≤" (de energie-indexklassen) wordt dan als losse, gespatieerde letters getekend.
 * De app sluit daarom Inter in (het huisstijl-lettertype, zie `nieuwDoc`); dat kent "≤", dus
 * die blijft staan. Alleen als Inter niet geladen kon worden, wordt "≤" nog "<=".
 */
let bronModus = false;
/** Maakt de huidige PDF bron-getrouw (zonder bewuste afwijkingen)? */
export const isBronModus = () => bronModus;
let interActief = false;
export const pdfTxt = (s: unknown) => {
  const t = String(s ?? "");
  // Inter kent ², – en ≤; alleen bron-getrouw of zonder Inter worden ze 2, - en <=
  if (bronModus) return t.replace(/²/g, "2").replace(/–/g, "-");
  return interActief ? t : t.replace(/²/g, "2").replace(/–/g, "-").replace(/≤/g, "<=");
};
/** "m²" in de huisstijl (Inter), anders "m2" zoals de bron */
export const pdfM2 = () => pdfTxt("m²");

/**
 * Draait het maken van een PDF bron-getrouw (Helvetica, zonder de bewuste afwijkingen) of in de
 * huisstijl. Alleen de vergelijkingstests gebruiken bronGetrouw = true. Het maken van een PDF is
 * synchroon, dus de instelling geldt precies voor die ene PDF.
 */
export function binnenTekenset<T>(bronGetrouw: boolean | undefined, maak: () => T): T {
  const [oudBron, oudInter] = [bronModus, interActief];
  bronModus = !!bronGetrouw;
  interActief = false;
  try {
    return maak();
  } finally {
    bronModus = oudBron;
    interActief = oudInter;
  }
}

export const segName = (s: Segment) => SEGMENT_NAMEN[s];

/** Een tabel tekenen; geeft de onderkant terug (doc.lastAutoTable.finalY in de bron) */
export function tabel(lib: PdfLib, doc: Doc, opts: UserOptions): number {
  lib.autoTable(doc, bronModus ? opts : huisstijlTabel(opts));
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

const zelfdeKleur = (a: unknown, b: RGB) =>
  Array.isArray(a) && a.length === 3 && a.every((x, i) => x === b[i]);

/**
 * Tabellen zoals in de app (GoHome UI): een stille kopregel in kleine hoofdletters zonder vlak,
 * alleen een haarlijn onder elke rij, geen raster en geen zebra. De bron-kleuren worden per cel
 * omgezet, zodat de bestaande tabellen niet elk apart aangepast hoeven te worden:
 * - indigo kopvlak → geen vlak, stille tekst;
 * - Frost (subkop en totaal) → licht grijs vlak; een totaal in indigo blijft indigo;
 * - rasterlijnen → alleen een haarlijn aan de onderkant.
 * Tabellen met theme "plain" (sleutel–waarde) houden hun vorm; alleen een kopregel krijgt de stijl.
 */
export function huisstijlTabel(opts: UserOptions): UserOptions {
  const plain = opts.theme === "plain";
  const eigen = opts.didParseCell;
  return {
    ...opts,
    theme: "plain",
    ...(plain ? {} : { alternateRowStyles: {} }),
    didParseCell: (d) => {
      eigen?.(d);
      const s = d.cell.styles;
      // kop en voet volgen de uitlijning van hun kolom (zonder vlak valt een scheve kop op)
      const kolom = opts.columnStyles?.[d.column.index];
      if (d.section !== "body" && kolom?.halign) s.halign = kolom.halign;
      if (d.section === "head") {
        s.fillColor = false;
        s.textColor = PDF_MUT;
        s.fontStyle = "bold";
        s.fontSize = Math.min(Number(s.fontSize) || 9, 7.5);
        d.cell.text = d.cell.text.map((t) => t.toUpperCase());
        s.lineColor = PDF_LINE;
        s.lineWidth = { bottom: 0.3 };
        return;
      }
      if (plain) return;
      if (zelfdeKleur(s.fillColor, PDF_SOFT) || zelfdeKleur(s.fillColor, PDF_ALT))
        s.fillColor = PDF_ALT;
      else if (zelfdeKleur(s.fillColor, PDF_PUR)) {
        s.fillColor = PDF_ALT;
        s.textColor = PDF_INK;
      } else s.fillColor = false;
      s.lineColor = PDF_LINE;
      s.lineWidth = { bottom: 0.2 };
    },
  };
}

/**
 * Tekst op één regel van hoogstens `breedte` mm (met het huidige lettertype); langer eindigt op
 * "…". De tekst moet al door pdfTxt() zijn gegaan.
 */
export function eenRegel(doc: Doc, t: string, breedte: number): string {
  const regels = doc.splitTextToSize(t, breedte) as string[];
  return regels.length > 1 ? regels[0]!.replace(/\s*\S{0,3}$/, "") + "…" : (regels[0] ?? "");
}

/** Hoek van een kaart: 12px in de huisstijl, bron-getrouw de oorspronkelijke maat */
export const kaartHoek = (bron: number) => (bronModus ? bron : PDF_KAART_HOEK);

/** Rand van een kaart: een haarlijn in de huisstijl, bron-getrouw de lila rand */
export function kaartRand(doc: Doc, bron: RGB, bronDikte: number) {
  doc.setDrawColor(...(bronModus ? bron : PDF_LINE));
  doc.setLineWidth(bronModus ? bronDikte : 0.2);
}

/**
 * Sectiekop zoals in de app: inkt en halfvet, gewoon gespeld. Bron-getrouw indigo hoofdletters,
 * zoals in wws-site.html (`bronGrootte`: de lettergrootte van de bron).
 */
export function sectieKop(doc: Doc, t: string, x: number, y: number, bronGrootte = 11) {
  doc.setFont("helvetica", "bold");
  if (bronModus) {
    doc.setFontSize(bronGrootte);
    doc.setTextColor(...PDF_PUR);
    doc.text(t.toUpperCase(), x, y);
  } else {
    doc.setFontSize(12);
    doc.setTextColor(...PDF_INK);
    doc.text(t, x, y);
  }
}

/** Nieuwe A4 zoals in de bron; in de huisstijl met Inter in plaats van Helvetica */
export function nieuwDoc(lib: PdfLib): Doc {
  const doc = new lib.jsPDF({ unit: "mm", format: "a4", compress: true });
  if (!bronModus && lib.lettertype) {
    metInter(doc, lib.lettertype);
    interActief = true;
  }
  return doc;
}

export const HUISSTIJL_FONT = "Inter";

/**
 * Inter (Regular en Bold) in het document, en elke keuze voor "helvetica" — ook die van
 * jspdf-autotable — wordt Inter. Schuin bestaat niet in de ingesloten set; dat wordt gewoon.
 */
function metInter(doc: Doc, l: Lettertype) {
  doc.addFileToVFS("Inter-Regular.ttf", l.regular);
  doc.addFont("Inter-Regular.ttf", HUISSTIJL_FONT, "normal");
  doc.addFileToVFS("Inter-Bold.ttf", l.bold);
  doc.addFont("Inter-Bold.ttf", HUISSTIJL_FONT, "bold");
  const zet = doc.setFont.bind(doc);
  doc.setFont = ((naam: string, stijl?: string, gewicht?: string | number) =>
    naam === "helvetica"
      ? zet(HUISSTIJL_FONT, /bold/.test(stijl ?? "") ? "bold" : "normal")
      : zet(naam, stijl, gewicht)) as Doc["setFont"];
  doc.setFont("helvetica", "normal");
}

/** Voettekst "GoHome gohome.io  Pagina i van n" vanaf pagina `vanaf` */
export function voettekst(doc: Doc, vanaf: number) {
  const W = PDF_W,
    M = PDF_M;
  const pages = doc.getNumberOfPages();
  for (let i = vanaf; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...PDF_LINE);
    doc.setLineWidth(0.3);
    doc.line(M, 282, W - M, 282);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_INK);
    doc.text("GoHome", M, 287);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...PDF_MUT);
    doc.text("gohome.io", M + 13, 287);
    doc.text("Pagina " + i + " van " + pages, W - M, 287, { align: "right" });
  }
}

/** Veilige bestandsnaam-basis, zoals in de bron */
export const bestandsBasis = (s: string) => s.replace(/[^\w-]+/g, "_").slice(0, 60);

/** Waarschuwing zodra de WOZ-cap actief is — wozCapNoteText() */
export function wozCapNoteText(R: WwsResultaat | null | undefined, N: Normen): string {
  if (!R || !R.wozCapActief) return "";
  return R.wozCapFloor
    ? "Let op: de " +
        N.wozCapPct +
        "% WOZ-cap is actief. Zonder de cap had deze woning 187 punten of meer; door de cap zakt hij daaronder en geldt een waardering van " +
        N.grensMidden +
        " punten."
    : "Let op: de " +
        N.wozCapPct +
        "% WOZ-cap is actief. De WOZ-waarde draagt niet voor de volle waarde bij, omdat dit meer dan " +
        N.wozCapPct +
        "% van het totaal aantal punten zou zijn.";
}

/** Korte samenvatting van de voorzieningen in een ruimte — facSummary() */
export function facSummary(kind: FacKind, f: Fac): string {
  const telAan = (o: Record<string, unknown> | undefined) =>
    Object.values(o || {}).reduce<number>((s, x) => s + (num(x) > 0 ? 1 : 0), 0);
  if (kind === "keuken" && f.kind === "keuken") {
    const n = telAan(f.keuken.voorz);
    return (
      "Keuken: aanrecht " +
      { "<1": "< 1 m", "1-2": "1–2 m", ">=2": "> 2 m" }[f.keuken.lengte] +
      (n ? ", " + n + " voorziening" + (n > 1 ? "en" : "") : "")
    );
  }
  if (
    (kind === "badkamer" || kind === "slaap_san") &&
    (f.kind === "badkamer" || f.kind === "slaap_san")
  ) {
    // slaap_san heeft geen toiletten of voorz; de bron leest ze toch (→ 0)
    const b = f.san as Partial<FacBadkamer["san"]>;
    const p: string[] = [];
    if (num(b.toiletStaand)) p.push(num(b.toiletStaand) + "× staand toilet");
    if (num(b.toiletHang)) p.push(num(b.toiletHang) + "× hangend toilet");
    if (num(b.wastafel)) p.push(num(b.wastafel) + "× wastafel");
    if (num(b.meerpers)) p.push(num(b.meerpers) + "× meerpersoonswastafel");
    if (num(b.douche)) p.push(num(b.douche) + "× douche");
    if (num(b.bad)) p.push(num(b.bad) + "× bad");
    if (num(b.badDouche)) p.push(num(b.badDouche) + "× bad met douche");
    const n = b.voorz ? telAan(b.voorz as Record<string, unknown>) : 0;
    if (n) p.push(n + " extra");
    return "Sanitair: " + (p.join(", ") || "nog niets ingevuld");
  }
  if (kind === "toilet" && f.kind === "toilet") {
    const t = f.toilet;
    return (
      "Toilet: " +
      { geen: "geen toilet", staand: "staand toilet", hangend: "hangend toilet" }[t.toilet] +
      (t.fontein ? ", fontein" : "")
    );
  }
  if (kind === "was" && f.kind === "was") return "Wastafel: " + (f.was.wastafel ? "ja" : "nee");
  return "";
}
