// Alleen voor tests: tekst uit een PDF halen (pdfjs-dist, devDependency) en willekeurige
// woninggegevens maken. Niet importeren vanuit de app.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { legeMeta } from "../opslag/doc";
import type { TellingMeta } from "../opslag/types";
import { rng } from "../testdata";

/** Blob → bytes; jsdom's Blob kent geen arrayBuffer() */
export function bytesVan(blob: Blob): Promise<Uint8Array> {
  return new Promise((ok, fout) => {
    const r = new FileReader();
    r.onload = () => ok(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => fout(r.error);
    r.readAsArrayBuffer(blob);
  });
}

/** De tekst van elke pagina, als lijst van tekststukken in tekenvolgorde */
export async function pdfTekst(blob: Blob): Promise<string[][]> {
  const taak = getDocument({ data: await bytesVan(blob), verbosity: 0 });
  const pdf = await taak.promise;
  const paginas: string[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    paginas.push(tc.items.map((it) => ("str" in it ? it.str : "")).filter((s) => s.trim() !== ""));
  }
  await taak.destroy();
  return paginas;
}

/** Willekeurige woninggegevens, met lange namen, toevoegingen, ² en – erin */
export function willekeurigeMeta(seed: number): TellingMeta {
  const R = rng(seed + 13_000_003);
  const kies = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
  const kans = (p: number) => R() < p;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  return {
    ...legeMeta(),
    naam: kies([
      "",
      "TEST Woning " + seed,
      "TEST – een heel lange naam voor een woning met 85 m² en nog veel meer tekst erachter zodat de titel niet past",
      "TEST Ünïcode & co",
    ]),
    adres: kans(0.8) ? kies(["Damrak", "Oosterdokskade", "Lange Nieuwstraat", "Ä-straat"]) : "",
    huisnummer: kies(["1", "12", "12 A", "12-2", "143 bis", ""]),
    postcode: kans(0.8) ? int(1000, 9999) + kies(["AB", "XX", "LG"]) : "",
    plaats: kans(0.8) ? kies(["Amsterdam", "Den Haag", "'s-Hertogenbosch"]) : "",
    bouwjaar: kans(0.6) ? String(int(1900, 2024)) : "",
    peildatum: kans(0.9)
      ? `2026-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`
      : "",
    opsteller: kans(0.7) ? kies(["Pim", "Collega Één"]) : "",
  };
}
