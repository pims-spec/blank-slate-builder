// Excel-export van het archief — exporteerArchiefExcel() in wws-site.html. SheetJS (xlsx) wordt
// meegegeven, zodat het in de browser pas bij het exporteren geladen wordt (zie pdf/laden.ts).
// excel.vergelijk.test.ts vergelijkt de celwaarden met die van de originele functie.
import type * as XLSXType from "xlsx";
import { calc } from "./calc";
import { SEGMENT_NAMEN } from "./calc";
import type { Normen } from "./normen";
import { weergaveAdres } from "./opslag/doc";
import type { Telling } from "./opslag/types";

export type XlsxLib = typeof XLSXType;

export interface ExcelOpties {
  /** Naam van de eigenaar (klant) bij meta.klantId; leeg als er geen is */
  klantNaam: (klantId: string) => string;
  /** Naam van de collega die de telling heeft gemaakt — eigenaarNaam() in de bron */
  collegaNaam: (t: Telling) => string;
}

/** De rijen van de export, met live herberekende punten, segment en huur */
export function excelRijen(
  lijst: readonly Telling[],
  N: Normen,
  o: ExcelOpties,
): Record<string, string | number>[] {
  return lijst.map((t) => {
    let totaal: number | null = t.laatstePunten != null ? t.laatstePunten : null,
      seg = "",
      maxHuur: number | null = null;
    try {
      const R = calc(t.input, N);
      totaal = R.totaal;
      seg = R.seg;
      maxHuur = R.maxHuur;
    } catch {
      // onvolledige oude telling: laatst opgeslagen punten
    }
    const m = t.meta;
    return {
      Naam: (m && m.naam) || "",
      Adres: weergaveAdres(m) || "",
      Postcode: (m && m.postcode) || "",
      Huisnummer: (m && m.huisnummer) || "",
      Plaats: (m && m.plaats) || "",
      Collega: o.collegaNaam(t),
      Eigenaar: o.klantNaam(m && m.klantId),
      Woningtype:
        t.input && t.input.woningtype === "eengezins" ? "Eengezinswoning" : "Meergezinswoning",
      Punten: totaal != null ? totaal : "",
      Segment: seg ? SEGMENT_NAMEN[seg as keyof typeof SEGMENT_NAMEN] : "",
      "Max. huur": maxHuur != null ? maxHuur : "",
      Peildatum: (m && m.peildatum) || "",
      "Aantal versies": t.aantalVersies != null ? t.aantalVersies : t.versieCount || 0,
      // de bron gebruikt updatedAt uit het document
      "Laatst bijgewerkt": t.updatedAt ? new Date(t.updatedAt).toLocaleDateString("nl-NL") : "",
      "Laatst bewerkt door": (t.lastEditedBy && t.lastEditedBy.naam) || "",
    };
  });
}

/** Het xlsx-bestand; null als er niets te exporteren is */
export function maakArchiefExcel(
  XLSX: XlsxLib,
  lijst: readonly Telling[],
  N: Normen,
  o: ExcelOpties,
): { blob: Blob; bestandsnaam: string; aantal: number } | null {
  if (!lijst.length) return null;
  const rows = excelRijen(lijst, N, o);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [28, 28, 10, 12, 16, 18, 22, 20, 9, 14, 12, 12, 14, 16, 18].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tellingen");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return {
    blob: new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    bestandsnaam: "Tellingen export " + new Date().toISOString().slice(0, 10) + ".xlsx",
    aantal: rows.length,
  };
}
