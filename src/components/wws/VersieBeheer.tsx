import { useState } from "react";
import { toast } from "sonner";
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
import { standaardVersieNaam, type Versie } from "@/lib/wws/opslag";
import { tellingStore } from "./tellingStore";

const foutTekst = (e: unknown) =>
  e instanceof Error ? e.message : ((e as { message?: string })?.message ?? "Er ging iets mis.");

interface Props {
  versie: Versie;
  tellingId: string;
  onHernoemd: (v: Versie) => void;
  onVerwijderd: (v: Versie) => void;
}

/** Versie hernoemen (#dlgNaam, Enter bevestigt) en verwijderen — openHernoem/saveHernoem/deleteVersie */
export default function VersieBeheer({ versie: v, tellingId, onHernoemd, onVerwijderd }: Props) {
  const [hernoem, setHernoem] = useState(false);
  const [naam, setNaam] = useState("");
  const [verwijder, setVerwijder] = useState(false);
  const [bezig, setBezig] = useState(false);

  async function slaNaamOp() {
    const n = naam.trim();
    if (!n || bezig) return;
    setBezig(true);
    try {
      onHernoemd(await tellingStore.werkVersieBij(tellingId, v.id, { notitie: n }));
      setHernoem(false);
      toast("Versie hernoemd");
    } catch (e) {
      toast.error(foutTekst(e));
    } finally {
      setBezig(false);
    }
  }

  async function verwijderNu() {
    try {
      await tellingStore.verwijderVersie(tellingId, v.id);
      onVerwijderd(v);
    } catch (e) {
      toast.error(foutTekst(e));
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        aria-label={"Versie " + v.nr + " hernoemen"}
        onClick={() => {
          setNaam(v.notitie || standaardVersieNaam(v.meta, v.nr));
          setHernoem(true);
        }}
      >
        Hernoemen
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        aria-label={"Versie " + v.nr + " verwijderen"}
        onClick={() => setVerwijder(true)}
      >
        Verwijderen
      </Button>

      <Dialog open={hernoem} onOpenChange={setHernoem}>
        <DialogContent className="max-w-md">
          <form
            className="min-w-0 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void slaNaamOp();
            }}
          >
            <DialogHeader>
              <DialogTitle>Versie hernoemen</DialogTitle>
              <DialogDescription>Versie {v.nr}</DialogDescription>
            </DialogHeader>
            <Input
              aria-label="Naam van de versie"
              maxLength={200}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setHernoem(false)}>
                Annuleren
              </Button>
              <Button type="submit" disabled={!naam.trim() || bezig}>
                Opslaan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={verwijder} onOpenChange={setVerwijder}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Versie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Versie {v.nr}
              {v.notitie ? " (‘" + v.notitie + "’)" : ""} definitief verwijderen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange text-orange-foreground shadow-none hover:brightness-105"
              onClick={() => void verwijderNu()}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
