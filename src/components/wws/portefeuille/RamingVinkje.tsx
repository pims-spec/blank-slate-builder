import { Checkbox } from "@/components/ui/checkbox";
import { useRamingInPdf } from "./ramingKeuze";

/** Het vinkje naast een PDF-knop van een portefeuille-analyse */
export function RamingVinkje({ className }: { className?: string }) {
  const [aan, zet] = useRamingInPdf();
  return (
    <label className={"inline-flex cursor-pointer items-center gap-2 text-sm " + (className ?? "")}>
      <Checkbox checked={aan} onCheckedChange={(c) => zet(c === true)} />
      Verduurzamingsraming in de PDF
    </label>
  );
}
