// Afbeeldingen voorbereiden in de browser — fileToCanvas(), canvasToBlob() en pdfAllText() in
// wws-site.html. pdf.js wordt pas geladen als er echt een PDF is (eigen chunk, eigen worker; niet
// van een CDN).

/** Langste zijde, zoals de bron */
export const MAX_ZIJDE = 2200;

let pdfjs: Promise<typeof import("pdfjs-dist")> | null = null;
function laadPdfjs() {
  pdfjs ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjs;
}

async function openPdf(file: Blob) {
  const lib = await laadPdfjs();
  const taak = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  return { pdf: await taak.promise, sluit: () => taak.destroy() };
}

/** Bestand (PNG/JPG/WebP of de eerste pagina van een PDF) naar een canvas van max 2200 px */
export async function bestandNaarCanvas(file: File): Promise<HTMLCanvasElement> {
  if (file.type === "application/pdf") {
    const { pdf, sluit } = await openPdf(file);
    const page = await pdf.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const scale = Math.min(4, MAX_ZIJDE / Math.max(vp0.width, vp0.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = vp.width;
    c.height = vp.height;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvas: c, canvasContext: ctx, viewport: vp }).promise;
    await sluit();
    return c;
  }
  let bron: CanvasImageSource;
  let w: number, h: number;
  try {
    const bm = await createImageBitmap(file);
    bron = bm;
    w = bm.width;
    h = bm.height;
  } catch {
    throw new Error("Dit bestand is geen geldige afbeelding.");
  }
  if (!w || !h)
    throw new Error("Deze afbeelding kon niet worden gelezen (geen afmetingen gevonden).");
  const scale = Math.min(1, MAX_ZIJDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bron, 0, 0, c.width, c.height);
  (bron as ImageBitmap).close?.();
  return c;
}

/** Canvas naar JPEG (kwaliteit 0,85, zoals de bron voor Claude) */
export function canvasNaarJpeg(c: HTMLCanvasElement, kwaliteit = 0.85): Promise<Blob> {
  return new Promise((ok, fout) =>
    c.toBlob(
      (b) =>
        b
          ? ok(b)
          : fout(
              new Error(
                "Omzetten van de tekening naar een afbeelding is mislukt (mogelijk te groot voor dit apparaat).",
              ),
            ),
      "image/jpeg",
      kwaliteit,
    ),
  );
}

export async function blobNaarBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

export function bytesNaarBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64NaarBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export const naarDataUrl = (b64: string, type: string) => `data:${type};base64,${b64}`;

export async function blobNaarDataUrl(b: Blob): Promise<string> {
  return naarDataUrl(bytesNaarBase64(await blobNaarBytes(b)), b.type || "image/jpeg");
}

/** Afmetingen van een afbeelding (data-URL of blob) */
export async function afmetingen(b: Blob): Promise<{ breedte: number; hoogte: number }> {
  const bm = await createImageBitmap(b);
  const r = { breedte: bm.width, hoogte: bm.height };
  bm.close();
  return r;
}

/** Alle tekst uit een PDF, max 90.000 tekens — pdfAllText() */
export async function pdfTekst(file: Blob): Promise<{ n: number; text: string; leeg: boolean }> {
  const { pdf, sluit } = await openPdf(file);
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages && out.join("\n").length < 90000; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const t = tc.items
      .map((it) => ("str" in it ? it.str.trim() : ""))
      .filter(Boolean)
      .join(" ");
    if (t) out.push("[Pagina " + i + "]\n" + t);
  }
  const n = pdf.numPages;
  await sluit();
  const text = out.join("\n\n").slice(0, 90000);
  return { n, text, leeg: text.replace(/\[Pagina \d+\]/g, "").trim().length < 20 };
}
