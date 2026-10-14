import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { Rechten } from "@/lib/rollen";
import { aantalGekoppeld, bestaatKlant, type Klant } from "@/lib/wws/opslag";
import { actievePves } from "@/lib/wws/pve";
import PveBeheer from "./PveBeheer";
import { klantenQuery, klantenStore, tellingenQuery } from "./tellingStore";

const tellingenTekst = (n: number) => (n === 1 ? "1 telling" : n + " tellingen");

/**
 * Eigenaren beheren — renderKlantenBeheer() in wws-site.html: iedere collega mag toevoegen,
 * alleen een beheerder mag hernoemen en verwijderen (zoals ook de databaseregels).
 */
export default function Eigenaren({ rechten }: { rechten: Rechten }) {
  const qc = useQueryClient();
  const { data: klanten = [], isPending, error } = useQuery(klantenQuery());
  const { data: tellingen = [] } = useQuery(tellingenQuery());
  const [nieuw, setNieuw] = useState("");
  const [bewerk, setBewerk] = useState<{ id: string; naam: string } | null>(null);
  const [teVerwijderen, setTeVerwijderen] = useState<Klant | null>(null);
  const [pveOpen, setPveOpen] = useState<string | null>(null);

  const ververs = () => qc.invalidateQueries({ queryKey: ["klanten"] });
  const fout = (e: Error) => toast.error(e.message);

  const toevoegen = useMutation({
    mutationFn: (naam: string) => klantenStore.voegToe(naam),
    onSuccess: (k) => {
      setNieuw("");
      void ververs();
      toast.success("Eigenaar ‘" + k.naam + "’ toegevoegd");
    },
    onError: fout,
  });
  const hernoemen = useMutation({
    mutationFn: ({ id, naam }: { id: string; naam: string }) => klantenStore.hernoem(id, naam),
    onSuccess: () => {
      setBewerk(null);
      void ververs();
      toast.success("Eigenaar hernoemd");
    },
    onError: fout,
  });
  const verwijderen = useMutation({
    mutationFn: (id: string) => klantenStore.verwijder(id),
    onSuccess: () => {
      void ververs();
      toast.success("Eigenaar verwijderd");
    },
    onError: fout,
  });

  const n = teVerwijderen ? aantalGekoppeld(tellingen, teVerwijderen.id) : 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-4xl text-foreground">Eigenaren</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        De eigenaren of opdrachtgevers waaraan je een telling kunt koppelen.
        {rechten.isAdmin
          ? " Als beheerder kun je ze ook hernoemen en verwijderen."
          : " Hernoemen en verwijderen kan alleen een beheerder."}
      </p>

      {rechten.magSchrijven && (
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const naam = nieuw.trim();
            if (!naam) return;
            if (bestaatKlant(klanten, naam)) {
              toast.error("Er bestaat al een eigenaar met deze naam.");
              return;
            }
            toevoegen.mutate(naam);
          }}
        >
          <Input
            aria-label="Naam nieuwe eigenaar"
            placeholder="Naam nieuwe eigenaar"
            value={nieuw}
            onChange={(e) => setNieuw(e.target.value)}
            className="max-w-sm"
          />
          <Button type="submit" disabled={toevoegen.isPending || !nieuw.trim()}>
            Toevoegen
          </Button>
        </form>
      )}

      {isPending ? (
        <p className="mt-6 text-muted-foreground">Eigenaren laden…</p>
      ) : error ? (
        <p className="mt-6 text-destructive">Eigenaren laden lukte niet: {error.message}</p>
      ) : !klanten.length ? (
        <p className="mt-6 text-muted-foreground">Nog geen eigenaren toegevoegd.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border">
          {klanten.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {bewerk?.id === k.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    hernoemen.mutate(bewerk);
                  }}
                >
                  <Input
                    autoFocus
                    aria-label={"Nieuwe naam voor " + k.naam}
                    value={bewerk.naam}
                    onChange={(e) => setBewerk({ id: k.id, naam: e.target.value })}
                  />
                  <Button type="submit" size="sm" disabled={hernoemen.isPending}>
                    Opslaan
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setBewerk(null)}>
                    Annuleren
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 font-medium">
                    {k.naam}
                    <PveBadge n={actievePves(k.pves).length} />
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {tellingenTekst(aantalGekoppeld(tellingen, k.id))}
                  </span>
                  {rechten.isAdmin && (
                    <span className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-expanded={pveOpen === k.id}
                        onClick={() => setPveOpen(pveOpen === k.id ? null : k.id)}
                      >
                        {pveOpen === k.id ? "PvE's verbergen" : "PvE's beheren"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setBewerk({ id: k.id, naam: k.naam })}
                      >
                        Hernoemen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setTeVerwijderen(k)}
                      >
                        Verwijderen
                      </Button>
                    </span>
                  )}
                </>
              )}
              {rechten.isAdmin && pveOpen === k.id && <PveBeheer klant={k} />}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={teVerwijderen !== null} onOpenChange={(o) => !o && setTeVerwijderen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eigenaar verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              ‘{teVerwijderen?.naam}’ verwijderen als eigenaar?{" "}
              {n === 0
                ? "Er zijn geen tellingen aan deze eigenaar gekoppeld."
                : `${n === 1 ? "Er is 1 telling" : `Er zijn ${n} tellingen`} aan deze eigenaar gekoppeld; ${
                    n === 1 ? "die blijft" : "die blijven"
                  } bestaan maar ${n === 1 ? "verliest" : "verliezen"} de koppeling.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => teVerwijderen && verwijderen.mutate(teVerwijderen.id)}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

/** Hoeveel PvE's van deze eigenaar iets ingesteld hebben — pveBadge() in wws-site.html */
function PveBadge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">
      {n === 1 ? "PvE ingesteld" : n + " PvE's ingesteld"}
    </span>
  );
}
