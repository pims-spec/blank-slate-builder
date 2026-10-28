import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { bezitVanGebruiker, verwijderGebruiker } from "@/lib/gebruikerVerwijderen.functions";
import {
  bezitTekst,
  ontvangers,
  OVERDRACHT_FOUTEN,
  overdrachtZin,
  portefeuilleTekst,
} from "@/lib/gebruikerVerwijderen";

interface Gebruiker {
  id: string;
  display_name: string | null;
  email: string | null;
  magSchrijven: boolean;
}

const naam = (g: Pick<Gebruiker, "display_name" | "email">) => g.display_name || g.email || "";

/** Venster: gebruiker verwijderen, met een verplichte ontvanger voor de tellingen */
export function GebruikerVerwijderen({
  gebruiker,
  gebruikers,
  onSluit,
}: {
  gebruiker: Gebruiker;
  gebruikers: readonly Gebruiker[];
  onSluit: () => void;
}) {
  const [ontvanger, setOntvanger] = useState("");
  const tel = useServerFn(bezitVanGebruiker);
  const verwijder = useServerFn(verwijderGebruiker);
  const qc = useQueryClient();
  const keuzes = ontvangers(gebruikers, gebruiker.id);
  const bezit = useQuery({
    queryKey: ["gebruiker-bezit", gebruiker.id],
    queryFn: () => tel({ data: { userId: gebruiker.id } }),
    staleTime: 0,
  });
  const mutatie = useMutation({
    mutationFn: async () => {
      const r = await verwijder({ data: { userId: gebruiker.id, ontvangerId: ontvanger } });
      if (!r.ok) throw new Error(OVERDRACHT_FOUTEN[r.fout]);
      return r;
    },
    onSuccess: (r) => {
      const naar = keuzes.find((k) => k.id === ontvanger);
      toast.success(
        `${naam(gebruiker)} is verwijderd: ${bezitTekst(r)} overgedragen aan ${naar ? naam(naar) : "de ontvanger"}.`,
      );
      onSluit();
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["all-users"] });
      qc.invalidateQueries({ queryKey: ["gebruiker-bezit", gebruiker.id] });
    },
  });
  const ontvangerNaam = keuzes.find((k) => k.id === ontvanger);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutatie.isPending) onSluit();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{naam(gebruiker)} verwijderen?</DialogTitle>
          <DialogDescription>
            Het account wordt definitief verwijderd. Dit kan niet ongedaan worden gemaakt. Het
            e-mailadres kun je later opnieuw uitnodigen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ontvanger">Tellingen gaan naar</Label>
            <select
              id="ontvanger"
              className="w-full rounded-lg border border-transparent bg-muted px-3 py-2 text-sm text-foreground"
              value={ontvanger}
              disabled={mutatie.isPending}
              onChange={(e) => setOntvanger(e.target.value)}
            >
              <option value="">Kies een collega…</option>
              {keuzes.map((k) => (
                <option key={k.id} value={k.id}>
                  {naam(k)}
                </option>
              ))}
            </select>
          </div>
          {bezit.isPending ? (
            <p className="text-sm text-muted-foreground">Tellen…</p>
          ) : bezit.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Tellen lukte niet. Probeer het later opnieuw.
            </p>
          ) : (
            <p className="text-sm text-foreground" data-testid="overdracht">
              {overdrachtZin(bezit.data, ontvangerNaam ? naam(ontvangerNaam) : null)}
              {bezit.data.portefeuilles > 0 && <> {portefeuilleTekst(bezit.data.portefeuilles)}</>}
            </p>
          )}
          {mutatie.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mutatie.error.message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={mutatie.isPending} onClick={onSluit}>
              Annuleren
            </Button>
            <Button
              variant="destructive"
              disabled={!ontvanger || !bezit.isSuccess || mutatie.isPending}
              onClick={() => mutatie.mutate()}
            >
              {mutatie.isPending ? "Verwijderen…" : "Definitief verwijderen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
