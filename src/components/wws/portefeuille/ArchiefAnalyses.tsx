import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Rechten } from "@/lib/rollen";
import type { AnalyseUitkomst } from "@/lib/wws/portefeuille/analyse";
import { eigenaarNamen, zoekAnalyses } from "@/lib/wws/portefeuille/archief";
import { nlDatum } from "@/lib/wws/portefeuille/datum";
import type { ArchiefAnalyse } from "@/lib/wws/portefeuille/opslag";
import { maakPortefeuillePdf } from "@/lib/wws/pdf/portefeuille";
import {
  archiefAnalysesQuery,
  klantenQuery,
  portefeuilleStore,
  portefeuillesQuery,
} from "../tellingStore";
import { useDownload } from "../useDownload";
import { AnalyseWeergave } from "./AnalyseWeergave";
import { HernoemAnalyseDialoog } from "./HernoemAnalyseDialoog";
import { PortefeuilleLijst } from "./PortefeuilleLijst";
import { RamingVinkje } from "./RamingVinkje";
import { ramingInPdf } from "./ramingKeuze";
import { RijActies } from "../RijActies";
import { PortefeuilleDelenDialoog } from "./PortefeuilleDelenDialoog";

const opgeslagen = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });

/** Archief, tabblad "Portefeuille-analyses": alle opgeslagen analyses, ook gecombineerde */
export function ArchiefAnalyses({
  rechten,
  userId,
  tabs,
}: {
  rechten: Rechten;
  userId: string;
  tabs: ReactNode;
}) {
  const qc = useQueryClient();
  const download = useDownload();
  const { data = [], isPending, error } = useQuery(archiefAnalysesQuery());
  const { data: klanten = [] } = useQuery(klantenQuery());
  const { data: portefeuilles = [] } = useQuery(portefeuillesQuery());
  const [delen, setDelen] = useState<ArchiefAnalyse | null>(null);
  /** De portefeuilles onder een analyse die jij mag delen (maker of beheerder) */
  const deelbaar = (a: ArchiefAnalyse) =>
    rechten.magSchrijven
      ? portefeuilles.filter(
          (p) => a.portefeuilleIds.includes(p.id) && (p.createdBy === userId || rechten.isAdmin),
        )
      : [];
  const klantNamen = useMemo(() => new Map(klanten.map((k) => [k.id, k.naam])), [klanten]);
  const [zoek, setZoek] = useState("");
  const [bekijk, setBekijk] = useState<{ a: ArchiefAnalyse; u: AnalyseUitkomst } | null>(null);
  const [weg, setWeg] = useState<ArchiefAnalyse | null>(null);
  const [hernoem, setHernoem] = useState<ArchiefAnalyse | null>(null);
  const rijen = zoekAnalyses(data, zoek, klantNamen);

  const magVerwijderen = (a: ArchiefAnalyse) =>
    rechten.magSchrijven && (a.gemaaktDoor === userId || rechten.isAdmin);

  const pdfInvoer = (a: ArchiefAnalyse, u: AnalyseUitkomst) => {
    const eigenaren = eigenaarNamen(a, klantNamen);
    return {
      portefeuille: a.titel,
      eigenaar: eigenaren.length ? eigenaren.join(", ") : null,
      delen: a.soort === "combi" ? a.portefeuilleNamen : null,
      uitkomst: u,
      metRaming: ramingInPdf(),
    };
  };

  async function pdf(a: ArchiefAnalyse) {
    await download.pdf("pdf-" + a.id, async (lib) =>
      maakPortefeuillePdf(
        lib,
        pdfInvoer(a, await portefeuilleStore.analyseUitkomst(a.soort, a.id)),
      ),
    );
  }

  async function bekijken(a: ArchiefAnalyse) {
    try {
      setBekijk({ a, u: await portefeuilleStore.analyseUitkomst(a.soort, a.id) });
    } catch {
      toast.error("Openen lukte niet.");
    }
  }

  /** Alleen een gecombineerde analyse heeft een eigen naam (migratie 0014) */
  async function hernoemen(a: ArchiefAnalyse, naam: string) {
    await portefeuilleStore.hernoemCombiAnalyse(a.id, naam);
    toast.success("Naam aangepast.");
    await qc.invalidateQueries({ queryKey: ["archief-analyses"] });
  }

  async function verwijder(a: ArchiefAnalyse) {
    try {
      if (a.soort === "combi") await portefeuilleStore.verwijderCombiAnalyse(a.id);
      else if (a.soort === "verwijderd") await portefeuilleStore.verwijderBewaardeAnalyse(a.id);
      else await portefeuilleStore.verwijderAnalyse(a.id);
      toast.success("Analyse verwijderd.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen lukte niet.");
    } finally {
      await qc.invalidateQueries({ queryKey: ["archief-analyses"] });
      for (const id of a.portefeuilleIds)
        await qc.invalidateQueries({ queryKey: ["portefeuille-analyses", id] });
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] leading-tight text-foreground max-[720px]:text-[28px]">
            Archief
          </h1>
          {tabs}
        </div>
        <Input
          className="w-full bg-card sm:w-72"
          placeholder="Zoek op naam, portefeuille, eigenaar of collega"
          aria-label="Zoeken in portefeuille-analyses"
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
        />
      </div>

      {isPending ? (
        <p className="text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="text-destructive">Laden lukte niet.</p>
      ) : !rijen.length ? (
        <p className="text-muted-foreground">
          {data.length ? "Geen analyses gevonden." : "Nog geen opgeslagen portefeuille-analyses."}
        </p>
      ) : (
        <div className="overflow-x-auto gh-card">
          <table className="w-full text-sm" aria-label="Portefeuille-analyses">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">Analyse</th>
                <th className="px-3 py-2 font-medium">Eigenaar</th>
                <th className="px-3 py-2 font-medium">Analysedatum</th>
                <th className="px-3 py-2 text-right font-medium">Adressen</th>
                <th className="px-3 py-2 font-medium">Opgeslagen</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rijen.map((a) => (
                <tr key={a.soort + a.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium">{a.titel}</span>{" "}
                    {a.soort === "combi" && <Badge variant="secondary">Gecombineerd</Badge>}
                    {a.soort === "verwijderd" && (
                      <Badge variant="outline" title="De portefeuille zelf is verwijderd">
                        Portefeuille verwijderd
                      </Badge>
                    )}
                    {a.soort === "combi" && (
                      <PortefeuilleLijst namen={a.portefeuilleNamen} className="mt-0.5" />
                    )}
                  </td>
                  <td className="px-3 py-2">{eigenaarNamen(a, klantNamen).join(", ") || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {nlDatum(a.analyseDatum)} · {a.vensterMaanden} mnd
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.aantalAdressen}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {opgeslagen(a.gemaaktOp)}
                    {a.gemaaktDoorNaam && (
                      <div className="text-xs text-muted-foreground">{a.gemaaktDoorNaam}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <RijActies
                      naam={a.titel}
                      acties={[
                        deelbaar(a).length > 0 && { label: "Delen", onSelect: () => setDelen(a) },
                        a.soort === "combi" &&
                          magVerwijderen(a) && {
                            label: "Hernoemen",
                            onSelect: () => setHernoem(a),
                          },
                        magVerwijderen(a) && {
                          label: "Verwijderen",
                          gevaar: true,
                          onSelect: () => setWeg(a),
                        },
                      ]}
                    >
                      <Button size="sm" variant="outline" onClick={() => void bekijken(a)}>
                        Bekijken
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!download.bezig}
                        onClick={() => void pdf(a)}
                      >
                        {download.bezig === "pdf-" + a.id ? "PDF maken…" : "PDF"}
                      </Button>
                    </RijActies>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!bekijk} onOpenChange={(o) => !o && setBekijk(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{bekijk?.a.titel}</DialogTitle>
          </DialogHeader>
          {bekijk && (
            <>
              {bekijk.a.soort === "combi" && (
                <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                  <span>Gecombineerd:</span>
                  <PortefeuilleLijst namen={bekijk.a.portefeuilleNamen} className="text-sm" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  disabled={!!download.bezig}
                  onClick={() =>
                    void download.pdf("pdf-bekijk", (lib) =>
                      maakPortefeuillePdf(lib, pdfInvoer(bekijk.a, bekijk.u)),
                    )
                  }
                >
                  PDF
                </Button>
                <RamingVinkje />
              </div>
              <AnalyseWeergave uitkomst={bekijk.u} />
            </>
          )}
        </DialogContent>
      </Dialog>

      <PortefeuilleDelenDialoog
        open={!!delen}
        onOpenChange={(o) => !o && setDelen(null)}
        portefeuilles={delen ? deelbaar(delen) : []}
        userId={userId}
        isAdmin={rechten.isAdmin}
      />

      <HernoemAnalyseDialoog
        naam={hernoem?.titel ?? null}
        onOpenChange={(o) => !o && setHernoem(null)}
        onOpslaan={(naam) => (hernoem ? hernoemen(hernoem, naam) : Promise.resolve())}
      />

      <AlertDialog open={!!weg} onOpenChange={(o) => !o && setWeg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Analyse verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              De opgeslagen analyse ‘{weg?.titel}’ van {weg ? nlDatum(weg.analyseDatum) : ""} wordt
              verwijderd. De portefeuilles en hun adressen blijven staan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange text-orange-foreground shadow-none hover:brightness-105"
              onClick={() => weg && void verwijder(weg)}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
