import { Checkbox } from "@/components/ui/checkbox";
import { useInPdf, type PdfKeuze } from "./pdfKeuzes";

function Vinkje({ keuze, children }: { keuze: PdfKeuze; children: string }) {
  const [aan, zet] = useInPdf(keuze);
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={aan} onCheckedChange={(c) => zet(c === true)} />
      {children}
    </label>
  );
}

/** De vinkjes naast een PDF-knop van een portefeuille-analyse */
export function PdfOpties() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Vinkje keuze="raming">Verduurzamingsraming in de PDF</Vinkje>
      <Vinkje keuze="efg">EFG-regels in de PDF</Vinkje>
    </div>
  );
}
