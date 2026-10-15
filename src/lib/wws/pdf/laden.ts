// jsPDF, jspdf-autotable en SheetJS zijn groot en alleen nodig bij een download: pas dan laden
// (aparte chunks), en nooit tijdens server-side rendering.
import type { XlsxLib } from "../excel";
import type { Lettertype, PdfLib } from "./stijl";
import interRegularUrl from "../../../../vendor/fonts/inter-4.1/Inter-Regular.ttf?url";
import interBoldUrl from "../../../../vendor/fonts/inter-4.1/Inter-Bold.ttf?url";

/** bytes → base64 (in stukken, zodat grote bestanden de call stack niet opblazen) */
function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Het huisstijl-lettertype (Inter 4.1, OFL) voor de PDF's. Lukt het laden niet, dan maakt de app
 * de PDF met Helvetica, zoals de bron (en "≤" als "<=").
 */
async function laadLettertype(): Promise<Lettertype | undefined> {
  try {
    const [regular, bold] = await Promise.all(
      [interRegularUrl, interBoldUrl].map(async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error("lettertype");
        return base64(new Uint8Array(await r.arrayBuffer()));
      }),
    );
    return { regular: regular!, bold: bold! };
  } catch {
    console.warn("[pdf] huisstijl-lettertype niet geladen; Helvetica gebruikt");
    return undefined;
  }
}

let pdfLib: Promise<PdfLib> | null = null;
export function laadPdfLib(): Promise<PdfLib> {
  pdfLib ??= Promise.all([import("jspdf"), import("jspdf-autotable"), laadLettertype()])
    .then(([j, a, lettertype]) => ({ jsPDF: j.jsPDF, autoTable: a.autoTable, lettertype }))
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
