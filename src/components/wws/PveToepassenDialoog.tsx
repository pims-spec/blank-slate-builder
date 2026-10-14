import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Klant } from "@/lib/wws/opslag";
import { actievePves } from "@/lib/wws/pve";

export interface PveVraag {
  klant: Klant;
  /** Voorkeur (meta.pveId); leeg = het enige actieve PvE, als er één is */
  pveId: string;
}

/**
 * "PvE toepassen?" — vraagPveToepassen()/bevestigPveToepassen() in wws-site.html. Bij meer dan
 * één actief PvE kies je welk.
 */
export default function PveToepassenDialoog({
  vraag,
  onSluit,
  onToepassen,
}: {
  vraag: PveVraag | null;
  onSluit: () => void;
  onToepassen: (vraag: PveVraag, pveId: string) => void;
}) {
  const actief = vraag ? actievePves(vraag.klant.pves) : [];
  const standaard = vraag
    ? actief.some((p) => p.id === vraag.pveId)
      ? vraag.pveId
      : actief.length === 1
        ? actief[0]!.id
        : ""
    : "";
  const [keuze, setKeuze] = useState(standaard);
  useEffect(() => setKeuze(standaard), [standaard, vraag]);

  return (
    <AlertDialog open={vraag !== null} onOpenChange={(o) => !o && onSluit()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>PvE toepassen?</AlertDialogTitle>
          <AlertDialogDescription>
            {actief.length > 1
              ? "Deze eigenaar heeft meerdere PvE's. Kies hieronder welke je wilt toepassen op deze telling — alleen keuken-, badkamer- en toiletruimten die nog niet handmatig zijn ingevuld worden aangevuld; wat je al had ingevuld blijft ongemoeid."
              : "Wil je het standaard PvE van deze eigenaar toepassen op deze telling? Alleen keuken-, badkamer- en toiletruimten die nog niet handmatig zijn ingevuld worden aangevuld; wat je al had ingevuld blijft ongemoeid. Aangevulde ruimten krijgen een markering, zodat je ze ter plekke kunt controleren."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {actief.length > 1 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Welk PvE wil je toepassen?</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={keuze}
              onChange={(e) => setKeuze(e.target.value)}
            >
              <option value="" disabled>
                Kies een PvE…
              </option>
              {actief.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.naam}
                </option>
              ))}
            </select>
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Niet toepassen</AlertDialogCancel>
          <AlertDialogAction disabled={!keuze} onClick={() => vraag && onToepassen(vraag, keuze)}>
            Toepassen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
