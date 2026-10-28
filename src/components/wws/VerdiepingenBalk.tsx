import { useState } from "react";
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
import type { PlatVerdieping, WwsInput } from "@/lib/wws";
import { ruimtenVanVerdieping } from "@/lib/wws/plattegrond/verdiepingen";

/**
 * De verdiepingen van een samengestelde plattegrond, elk met een ✕ om hem te verwijderen. Vraagt
 * eerst om bevestiging, met het vinkje om ook de ruimten van die verdieping weg te halen.
 */
export default function VerdiepingenBalk({
  input,
  verdiepingen,
  onVerwijder,
}: {
  input: WwsInput;
  verdiepingen: readonly PlatVerdieping[];
  /** Weglaten: alleen tonen (alleen-lezen) */
  onVerwijder?: (i: number, metRuimten: boolean) => void;
}) {
  const [vraag, setVraag] = useState<number | null>(null);
  const [metRuimten, setMetRuimten] = useState(true);
  if (verdiepingen.length < 2) return null;
  const v = vraag === null ? null : verdiepingen[vraag];
  const n = v ? ruimtenVanVerdieping(input, v.naam) : 0;
  return (
    <>
      <ul aria-label="Verdiepingen op de plattegrond" className="mt-1 flex flex-wrap gap-1">
        {verdiepingen.map((x, i) => (
          <li
            key={x.naam}
            className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-xs"
          >
            {x.naam}
            {onVerwijder && (
              <button
                type="button"
                aria-label={"Verdieping verwijderen: " + x.naam}
                className="rounded px-1 hover:text-destructive"
                onClick={() => {
                  setMetRuimten(true);
                  setVraag(i);
                }}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      <AlertDialog open={v != null} onOpenChange={(o) => !o && setVraag(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{v?.naam} verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              De tekening van deze verdieping gaat van de plattegrond af; de andere blijven staan.
              Dit wordt bewaard bij Opslaan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {n > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={metRuimten}
                onChange={(e) => setMetRuimten(e.target.checked)}
              />
              <span>
                Ook {n === 1 ? "de ruimte" : `de ${n} ruimten`} van deze verdieping uit de telling
                halen
              </span>
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            Een buitenruimte van deze verdieping is bij het inlezen opgeteld met de andere; pas die
            zo nodig zelf aan.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (vraag !== null) onVerwijder?.(vraag, n > 0 && metRuimten);
                setVraag(null);
              }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
