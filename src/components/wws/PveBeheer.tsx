import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import type { Klant } from "@/lib/wws/opslag";
import { pveActief, pveNaamBestaat, pveUitFormulier, type Pve, type PveWerk } from "@/lib/wws/pve";
import PveDialoog from "./PveDialoog";
import { klantenStore } from "./tellingStore";

const uid = () => crypto.randomUUID();

/** De PvE's van één eigenaar beheren (alleen admins) — klantPvePanelHtml() in wws-site.html */
export default function PveBeheer({ klant }: { klant: Klant }) {
  const qc = useQueryClient();
  const [bewerk, setBewerk] = useState<{ pve: Pve | null } | null>(null);
  const [hernoem, setHernoem] = useState<{ id: string; naam: string } | null>(null);
  const [teVerwijderen, setTeVerwijderen] = useState<Pve | null>(null);

  const opslaan = useMutation({
    mutationFn: (pves: Pve[]) => klantenStore.slaPvesOp(klant.id, pves),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["klanten"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const lijst = klant.pves
    .slice()
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl", { sensitivity: "base" }));

  function opslaanUitFormulier(werk: PveWerk, naam: string) {
    const bestaand = bewerk?.pve ?? null;
    if (!naam.trim()) {
      toast.error("Geef dit PvE een naam.");
      return;
    }
    if (pveNaamBestaat(klant.pves, naam, bestaand?.id)) {
      toast.error("Er bestaat al een PvE met deze naam bij deze eigenaar.");
      return;
    }
    const p = pveUitFormulier(werk, bestaand, naam, uid);
    const nieuw = bestaand ? klant.pves.map((x) => (x.id === p.id ? p : x)) : [...klant.pves, p];
    opslaan.mutate(nieuw, {
      onSuccess: () => {
        setBewerk(null);
        toast.success("PvE ‘" + p.naam + "’ opgeslagen voor " + klant.naam + ".");
      },
    });
  }

  return (
    <div
      className="mt-2 w-full space-y-2 rounded-md bg-muted/40 p-3"
      aria-label={"PvE's van " + klant.naam}
    >
      {lijst.length ? (
        <ul className="space-y-1">
          {lijst.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              {hernoem?.id === p.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const naam = hernoem.naam.trim();
                    if (!naam || naam === p.naam) return setHernoem(null);
                    if (pveNaamBestaat(klant.pves, naam, p.id))
                      return void toast.error(
                        "Er bestaat al een PvE met deze naam bij deze eigenaar.",
                      );
                    opslaan.mutate(
                      klant.pves.map((x) => (x.id === p.id ? { ...x, naam } : x)),
                      {
                        onSuccess: () => {
                          setHernoem(null);
                          toast.success("PvE hernoemd.");
                        },
                      },
                    );
                  }}
                >
                  <Input
                    autoFocus
                    aria-label={"Nieuwe naam voor PvE " + p.naam}
                    value={hernoem.naam}
                    className="h-8"
                    onChange={(e) => setHernoem({ id: p.id, naam: e.target.value })}
                  />
                  <Button type="submit" size="sm" disabled={opslaan.isPending}>
                    Opslaan
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setHernoem(null)}>
                    Annuleren
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 font-medium">{p.naam}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {pveActief(p) ? "Actief" : "Nog niets ingesteld"}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setBewerk({ pve: p })}>
                    Bewerken
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHernoem({ id: p.id, naam: p.naam })}
                  >
                    Hernoemen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setTeVerwijderen(p)}
                  >
                    Verwijderen
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nog geen PvE’s voor deze eigenaar.</p>
      )}
      <Button size="sm" variant="outline" onClick={() => setBewerk({ pve: null })}>
        + Nieuw PvE toevoegen
      </Button>

      <PveDialoog
        open={bewerk !== null}
        onOpenChange={(o) => !o && setBewerk(null)}
        pve={bewerk?.pve ?? null}
        eigenaarNaam={klant.naam}
        bezig={opslaan.isPending}
        onOpslaan={opslaanUitFormulier}
      />

      <AlertDialog open={teVerwijderen !== null} onOpenChange={(o) => !o && setTeVerwijderen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>PvE verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              PvE ‘{teVerwijderen?.naam}’ van {klant.naam} verwijderen? Tellingen waarop het al is
              toegepast, houden hun ingevulde ruimten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                teVerwijderen &&
                opslaan.mutate(
                  klant.pves.filter((x) => x.id !== teVerwijderen.id),
                  { onSuccess: () => toast.success("PvE verwijderd.") },
                )
              }
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
