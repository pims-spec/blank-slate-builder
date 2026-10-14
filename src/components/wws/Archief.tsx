import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { SEGMENT_NAMEN, calc, type Segment } from "@/lib/wws";
import { tellingTitel, weergaveAdres, type Telling } from "@/lib/wws/opslag";
import { NORMEN, tellingStore, tellingenQuery } from "./tellingStore";

interface Rij {
  t: Telling;
  titel: string;
  adres: string;
  punten: number | null;
  seg: Segment | null;
}

/** Punten en segment live herberekenen met de huidige normen, zoals het archief in wws-site.html */
function naarRij(t: Telling): Rij {
  let punten = t.laatstePunten;
  let seg: Segment | null = null;
  try {
    const R = calc(t.input, NORMEN);
    punten = R.totaal;
    seg = R.seg;
  } catch {
    // onvolledige oude telling: laatst opgeslagen punten tonen
  }
  const adres = weergaveAdres(t.meta);
  return {
    t,
    titel: tellingTitel(t.meta),
    adres: adres === tellingTitel(t.meta) ? "" : adres,
    punten,
    seg,
  };
}

const datumTijd = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });

export default function Archief({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(tellingenQuery());
  const [zoek, setZoek] = useState("");
  const [teVerwijderen, setTeVerwijderen] = useState<Rij | null>(null);

  const rijen = useMemo(() => (data ?? []).map(naarRij), [data]);
  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    if (!q) return rijen;
    return rijen.filter((r) =>
      [r.titel, r.adres, r.t.meta.postcode, r.t.ownerNaam ?? ""].some((s) =>
        s.toLowerCase().includes(q),
      ),
    );
  }, [rijen, zoek]);

  const verwijder = useMutation({
    mutationFn: (id: string) => tellingStore.verwijder(id),
    onSuccess: () => {
      toast.success("Telling verwijderd");
      void queryClient.invalidateQueries({ queryKey: ["tellingen"] });
    },
    onError: (e) => toast.error("Verwijderen lukte niet: " + e.message),
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Archief</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? "Alle tellingen van alle collega's." : "Je opgeslagen tellingen."}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            aria-label="Zoeken"
            placeholder="Zoek op naam, adres of postcode"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            className="w-72"
          />
          <Button asChild>
            <Link to="/wws">Nieuwe telling</Link>
          </Button>
        </div>
      </div>

      {isPending ? (
        <p className="text-muted-foreground">Tellingen laden…</p>
      ) : error ? (
        <p className="text-destructive">Tellingen laden lukte niet: {error.message}</p>
      ) : rijen.length === 0 ? (
        <p className="text-muted-foreground">Nog geen tellingen. Start met een nieuwe telling.</p>
      ) : zichtbaar.length === 0 ? (
        <p className="text-muted-foreground">Niets gevonden voor ‘{zoek}’.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Naam / adres</th>
                {isAdmin && <th className="px-3 py-2 font-medium">Eigenaar</th>}
                <th className="px-3 py-2 text-right font-medium">Punten</th>
                <th className="px-3 py-2 font-medium">Segment</th>
                <th className="px-3 py-2 font-medium">Laatst gewijzigd</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Acties</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {zichtbaar.map((r) => (
                <tr key={r.t.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <Link to="/wws" search={{ id: r.t.id }} className="font-medium hover:underline">
                      {r.titel}
                    </Link>
                    {r.adres && <div className="text-xs text-muted-foreground">{r.adres}</div>}
                  </td>
                  {isAdmin && <td className="px-3 py-2">{r.t.ownerNaam ?? "—"}</td>}
                  <td className="px-3 py-2 text-right tabular-nums">{r.punten ?? "—"}</td>
                  <td className="px-3 py-2">{r.seg ? SEGMENT_NAMEN[r.seg] : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{datumTijd(r.t.gewijzigdOp)}</td>
                  <td className="whitespace-nowrap px-3 py-1 text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/wws" search={{ id: r.t.id }}>
                        Openen
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setTeVerwijderen(r)}
                    >
                      Verwijderen
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={teVerwijderen !== null} onOpenChange={(o) => !o && setTeVerwijderen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Telling verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              ‘{teVerwijderen?.titel}’
              {teVerwijderen && teVerwijderen.t.aantalVersies > 0
                ? teVerwijderen.t.aantalVersies === 1
                  ? " en de opgeslagen versie"
                  : ` en alle ${teVerwijderen.t.aantalVersies} opgeslagen versies`
                : ""}{" "}
              worden definitief verwijderd. Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => teVerwijderen && verwijder.mutate(teVerwijderen.t.id)}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
