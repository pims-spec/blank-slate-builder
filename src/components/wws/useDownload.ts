import { useState } from "react";
import { toast } from "sonner";
import type { XlsxLib } from "@/lib/wws/excel";
import { bewaarBestand, laadPdfLib, laadXlsx } from "@/lib/wws/pdf/laden";
import type { PdfLib } from "@/lib/wws/pdf/stijl";

interface Bestand {
  blob: Blob;
  bestandsnaam: string;
}

/**
 * PDF- of Excel-download met een bezig-status en de meldingen uit wws-site.html. Alleen
 * lezen: maakt een bestand en slaat niets op, dus ook voor de kijkrol.
 */
export function useDownload() {
  const [bezig, setBezig] = useState<string | null>(null);

  async function pdf(
    sleutel: string,
    maak: (lib: PdfLib) => Bestand | null | Promise<Bestand | null>,
    melding = "PDF opgeslagen",
  ) {
    if (bezig) return;
    setBezig(sleutel);
    try {
      const lib = await laadPdfLib();
      const b = await maak(lib);
      if (!b) return;
      bewaarBestand(b.bestandsnaam, b.blob);
      toast(melding);
    } catch (e) {
      console.error(e);
      toast.error("Downloaden lukte niet.");
    } finally {
      setBezig(null);
    }
  }

  async function excel(
    sleutel: string,
    maak: (XLSX: XlsxLib) => (Bestand & { aantal: number }) | null,
  ) {
    if (bezig) return;
    setBezig(sleutel);
    try {
      const XLSX = await laadXlsx();
      const b = maak(XLSX);
      if (!b) {
        toast("Niets om te exporteren met de huidige zoekopdracht/filters.");
        return;
      }
      bewaarBestand(b.bestandsnaam, b.blob);
      toast("Export gestart (" + b.aantal + " telling" + (b.aantal === 1 ? "" : "en") + ").");
    } catch (e) {
      console.error(e);
      toast.error("Downloaden lukte niet.");
    } finally {
      setBezig(null);
    }
  }

  return { bezig, pdf, excel };
}
