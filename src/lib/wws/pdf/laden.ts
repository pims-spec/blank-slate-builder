// jsPDF, jspdf-autotable en SheetJS zijn groot en alleen nodig bij een download: pas dan laden
// (aparte chunks), en nooit tijdens server-side rendering.
import type { XlsxLib } from "../excel";
import type { PdfLib } from "./stijl";

let pdfLib: Promise<PdfLib> | null = null;
export function laadPdfLib(): Promise<PdfLib> {
  pdfLib ??= Promise.all([import("jspdf"), import("jspdf-autotable")])
    .then(([j, a]) => ({ jsPDF: j.jsPDF, autoTable: a.autoTable }))
    .catch((e: unknown) => {
      pdfLib = null; // een volgende poging mag het opnieuw proberen
      throw e;
    });
  return pdfLib;
}

let xlsx: Promise<XlsxLib> | null = null;
export function laadXlsx(): Promise<XlsxLib> {
  xlsx ??= import("xlsx").catch((e: unknown) => {
    xlsx = null;
    throw e;
  });
  return xlsx;
}

/** Een bestand downloaden in de browser — saveFile() in wws-site.html */
export function bewaarBestand(bestandsnaam: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bestandsnaam;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}
