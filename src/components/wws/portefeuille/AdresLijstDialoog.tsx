import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdresRegel } from "@/lib/wws/portefeuille/analyse";
import { nlDatum } from "@/lib/wws/portefeuille/datum";
import { aantal } from "@/lib/wws/portefeuille/tekst";

export interface Doorklik {
  titel: string;
  aantal: number;
  /** Ontbreekt bij opgeslagen analyses van vóór de doorklik */
  adressen: AdresRegel[] | undefined;
}

/** Popup met de adressen achter een staaf of een categorie van het risicoprofiel */
export function AdresLijstDialoog({ d, onSluit }: { d: Doorklik | null; onSluit: () => void }) {
  return (
    <Dialog open={!!d} onOpenChange={(o) => !o && onSluit()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{d?.titel}</DialogTitle>
          <DialogDescription>{d ? aantal(d.aantal, "woning", "woningen") : ""}</DialogDescription>
        </DialogHeader>
        {d &&
          (!d.adressen ? (
            <p className="text-sm text-muted-foreground">
              Bij deze opgeslagen analyse is de lijst met adressen niet bewaard. Maak de analyse
              opnieuw om de adressen te zien.
            </p>
          ) : !d.adressen.length ? (
            <p className="text-sm text-muted-foreground">Geen woningen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label={"Adressen: " + d.titel}>
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Adres</th>
                    <th className="py-1 pr-3 font-medium">Label</th>
                    <th className="py-1 pr-3 font-medium">Registratie</th>
                    <th className="py-1 font-medium">Verloopt</th>
                  </tr>
                </thead>
                <tbody>
                  {d.adressen.map((a, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1.5 pr-3">{a.adres}</td>
                      <td className="py-1.5 pr-3">{a.klasse ?? "geen"}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                        {nlDatum(a.registratiedatum) || "—"}
                      </td>
                      <td className="py-1.5 whitespace-nowrap tabular-nums">
                        {nlDatum(a.verloopdatum) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </DialogContent>
    </Dialog>
  );
}
