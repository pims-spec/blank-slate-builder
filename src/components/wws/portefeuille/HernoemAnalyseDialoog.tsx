import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { geldigeAnalyseNaam, MAX_ANALYSE_NAAM } from "@/lib/wws/portefeuille/combi";

interface Props {
  /** De huidige naam; null = venster dicht */
  naam: string | null;
  onOpenChange: (open: boolean) => void;
  /** Opslaan; bij succes sluit het venster, bij een fout blijft het open met de melding */
  onOpslaan: (naam: string) => Promise<void>;
}

/** De naam van een gecombineerde analyse aanpassen (archief, portefeuille-analyses) */
export function HernoemAnalyseDialoog({ naam, onOpenChange, onOpslaan }: Props) {
  return (
    <Dialog open={naam !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {naam !== null && (
          <Inhoud huidig={naam} onOpslaan={onOpslaan} onSluit={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Inhoud({
  huidig,
  onOpslaan,
  onSluit,
}: {
  huidig: string;
  onOpslaan: Props["onOpslaan"];
  onSluit: () => void;
}) {
  const [naam, setNaam] = useState(huidig);
  const [melding, setMelding] = useState("");
  const [bezig, setBezig] = useState(false);

  return (
    <form
      className="min-w-0 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const nieuw = geldigeAnalyseNaam(naam);
        if (!nieuw) {
          setMelding(`Geef de analyse een naam van 1 tot ${MAX_ANALYSE_NAAM} tekens.`);
          return;
        }
        if (nieuw === huidig) {
          onSluit();
          return;
        }
        setBezig(true);
        setMelding("");
        onOpslaan(nieuw)
          .then(onSluit)
          .catch((err: unknown) =>
            setMelding(err instanceof Error ? err.message : "De naam aanpassen lukte niet."),
          )
          .finally(() => setBezig(false));
      }}
    >
      <DialogHeader>
        <DialogTitle>Analyse hernoemen</DialogTitle>
        <DialogDescription>
          De nieuwe naam staat in het archief en op de PDF. De analyse zelf verandert niet.
        </DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Naam</span>
        <Input
          autoFocus
          maxLength={MAX_ANALYSE_NAAM}
          value={naam}
          onChange={(e) => setNaam(e.target.value)}
        />
      </label>
      <p className="min-h-5 text-sm text-destructive" role="status">
        {melding}
      </p>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onSluit}>
          Annuleren
        </Button>
        <Button type="submit" disabled={bezig}>
          {bezig ? "Opslaan…" : "Opslaan"}
        </Button>
      </DialogFooter>
    </form>
  );
}
