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
export interface PdfLib {
  jsPDF: typeof jsPDF;
  autoTable: typeof AutoTable;
}
export type RGB = [number, number, number];

export const PDF_W = 210,
  PDF_M = 16;
export const PDF_PUR: RGB = [91, 65, 255],
  PDF_INK: RGB = [10, 10, 26],
  PDF_MUT: RGB = [92, 92, 122],
  PDF_SOFT: RGB = [237, 240, 255],
  PDF_ALT: RGB = [248, 248, 255],
  PDF_LINE: RGB = [230, 230, 242];
export const PDF_WARN_BG: RGB = [255, 241, 232],
  PDF_WARN_INK: RGB = [154, 66, 18];
export const PDF_SEGC: Record<Segment, RGB> = {
  laag: [229, 72, 77],
  midden: [255, 124, 58],
  hoog: [48, 164, 108],
};
/** jsPDF's standaardlettertype kent geen ² en – */
export const pdfTxt = (s: unknown) =>
  String(s ?? "")
    .replace(/²/g, "2")
    .replace(/–/g, "-");

export const segName = (s: Segment) => SEGMENT_NAMEN[s];

/** Een tabel tekenen; geeft de onderkant terug (doc.lastAutoTable.finalY in de bron) */
export function tabel(lib: PdfLib, doc: Doc, opts: UserOptions): number {
  lib.autoTable(doc, opts);
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/** Nieuwe A4 zoals in de bron */
export const nieuwDoc = (lib: PdfLib) =>
  new lib.jsPDF({ unit: "mm", format: "a4", compress: true });

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
