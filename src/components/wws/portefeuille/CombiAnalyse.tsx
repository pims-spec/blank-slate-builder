import { useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Rechten } from "@/lib/rollen";
import type { Klant } from "@/lib/wws/opslag";
import { analyseer, type PortefeuilleNormen } from "@/lib/wws/portefeuille/analyse";
import { combiTitel, combineerAdressen } from "@/lib/wws/portefeuille/combi";
import { vandaag } from "@/lib/wws/portefeuille/datum";
import type { Portefeuille } from "@/lib/wws/portefeuille/opslag";
import { aantal } from "@/lib/wws/portefeuille/tekst";
import { maakPortefeuillePdf } from "@/lib/wws/pdf/portefeuille";
import { portefeuilleAdressenQuery, portefeuilleStore } from "../tellingStore";
import { useDownload } from "../useDownload";
import { AnalyseWeergave } from "./AnalyseWeergave";
import { PdfOpties } from "./PdfOpties";
import { pdfOpties } from "./pdfKeuzes";

/**
 * Eén analyse over meerdere portefeuilles (bijv. van meerdere eigenaren). Een adres dat in meer
 * portefeuilles staat telt één keer. Labels ophalen gebeurt per portefeuille; hier staat alleen
 * hoeveel adressen nog niet zijn opgehaald, met een knop om die portefeuille te openen.
 */
export function CombiAnalyse({
  rechten,
  portefeuilles,
  klanten,
  instellingen,
  onOpen,
}: {
  rechten: Rechten;
  portefeuilles: readonly Portefeuille[];
  klanten: readonly Klant[];
  instellingen: PortefeuilleNormen;
  /** Een portefeuille openen (om labels op te halen) */
  onOpen: (id: string) => void;
}) {
  const qc = useQueryClient();
  const download = useDownload();
  const [gekozen, setGekozen] = useState<string[]>([]);
  const [datum, setDatum] = useState(vandaag());
  const [venster, setVenster] = useState("3");
  const [titel, setTitel] = useState("");
  const [bezig, setBezig] = useState(false);

  const klantNaam = useMemo(() => new Map(klanten.map((k) => [k.id, k.naam])), [klanten]);
  const delen = portefeuilles.filter((p) => gekozen.includes(p.id));
  const eigenarenMetPortefeuille = klanten.filter((k) =>
    portefeuilles.some((p) => p.klantId === k.id),
  );

  const adressenQ = useQueries({
    queries: delen.map((p) => portefeuilleAdressenQuery(p.id)),
  });
  const laden = adressenQ.some((q) => q.isPending);
  const lijsten = adressenQ.map((q) => q.data ?? []);
  const maanden = Math.min(24, Math.max(1, Math.round(Number(venster)) || 3));
  const uitkomst = useMemo(
    () =>
      analyseer(
        combineerAdressen(lijsten),
        /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : vandaag(),
        maanden,
        instellingen,
      ),
    // lijsten verandert alleen als de data verandert
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adressenQ.map((q) => q.dataUpdatedAt).join(","), datum, maanden, instellingen],
  );
  const nogNiet = delen
    .map((p, i) => ({
      p,
      n: (lijsten[i] ?? []).filter((a) => !a.nietInBloxsSinds && !a.resultaat).length,
    }))
    .filter((x) => x.n > 0);

  const titelTekst = titel.trim() || combiTitel(delen.map((p) => p.naam));
  const eigenaren = [
    ...new Set(delen.map((p) => (p.klantId ? klantNaam.get(p.klantId) : null)).filter(Boolean)),
  ] as string[];

  const zet = (id: string, aan: boolean) =>
    setGekozen((g) => (aan ? [...new Set([...g, id])] : g.filter((x) => x !== id)));

  async function slaOp() {
    setBezig(true);
    try {
      await portefeuilleStore.slaCombiAnalyseOp(
        titelTekst,
        delen.map((p) => ({ id: p.id, naam: p.naam, klantId: p.klantId })),
        uitkomst,
      );
      toast.success("Analyse opgeslagen in het archief.");
      await qc.invalidateQueries({ queryKey: ["archief-analyses"] });
    } catch (e) {
      toast.error("Opslaan lukte niet: " + (e instanceof Error ? e.message : ""));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="gh-card p-4" aria-label="Portefeuilles kiezen">
        <div className="flex flex-wrap items-end gap-3">
          {eigenarenMetPortefeuille.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Alle portefeuilles van eigenaar</span>
              <select
                className="h-9 max-w-full rounded-lg border border-transparent bg-muted px-2"
                value=""
                onChange={(e) => {
                  const ids = portefeuilles
                    .filter((p) => p.klantId === e.target.value)
                    .map((p) => p.id);
                  setGekozen((g) => [...new Set([...g, ...ids])]);
                }}
              >
                <option value="">Eigenaar toevoegen…</option>
                {eigenarenMetPortefeuille.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.naam}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button variant="ghost" disabled={!gekozen.length} onClick={() => setGekozen([])}>
            Niets selecteren
          </Button>
          <span className="text-sm text-muted-foreground">
            {aantal(delen.length, "portefeuille", "portefeuilles")} gekozen
          </span>
        </div>
        <ul
          className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border"
          aria-label="Portefeuilles"
        >
          {portefeuilles.map((p) => (
            <li key={p.id} className="border-b border-border last:border-0">
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={gekozen.includes(p.id)}
                  onChange={(e) => zet(p.id, e.target.checked)}
                />
                <span className="font-medium">{p.naam}</span>
                <span className="text-muted-foreground">
                  {p.klantId && klantNaam.get(p.klantId) ? "· " + klantNaam.get(p.klantId) : ""} ·{" "}
                  {aantal(p.aantalAdressen, "adres", "adressen")}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {delen.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Kies twee of meer portefeuilles voor een gecombineerde analyse.
        </p>
      ) : laden ? (
        <p className="text-sm text-muted-foreground">Adressen laden…</p>
      ) : (
        <>
          {nogNiet.length > 0 && (
            <section className="gh-card p-4 text-sm" aria-label="Nog niet opgehaald">
              <p className="text-orange-ink">
                Niet alle labels zijn opgehaald. Haal ze op in de portefeuille zelf:
              </p>
              <ul className="mt-2 space-y-1">
                {nogNiet.map(({ p, n }) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    {p.naam}: {aantal(n, "adres", "adressen")} nog niet opgehaald
                    <Button size="sm" variant="outline" onClick={() => onOpen(p.id)}>
                      Openen
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-wrap items-end gap-3 gh-card p-4">
            <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Naam van de analyse</span>
              <Input
                value={titel}
                placeholder={combiTitel(delen.map((p) => p.naam))}
                maxLength={200}
                onChange={(e) => setTitel(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Analysedatum</span>
              <Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </label>
            <label className="flex w-28 flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Venster (maanden)</span>
              <Input
                inputMode="numeric"
                value={venster}
                onChange={(e) => setVenster(e.target.value)}
              />
            </label>
            {rechten.magSchrijven && (
              <Button variant="outline" disabled={bezig} onClick={() => void slaOp()}>
                Analyse opslaan
              </Button>
            )}
            <Button
              disabled={!!download.bezig}
              onClick={() =>
                void download.pdf("pdf-combi", (lib) =>
                  maakPortefeuillePdf(lib, {
                    portefeuille: titelTekst,
                    eigenaar: eigenaren.length ? eigenaren.join(", ") : null,
                    delen: delen.map((p) => p.naam),
                    uitkomst,
                    ...pdfOpties(),
                  }),
                )
              }
            >
              {download.bezig === "pdf-combi" ? "PDF maken…" : "PDF"}
            </Button>
            <PdfOpties />
          </section>

          <p className="text-sm text-muted-foreground">
            Gecombineerd: {delen.map((p) => p.naam).join(", ")}. Een adres dat in meer portefeuilles
            staat telt één keer. Opgeslagen analyses staan in het{" "}
            <Link to="/archief" search={{ tab: "analyses" }} className="underline">
              Archief
            </Link>
            .
          </p>
          <AnalyseWeergave uitkomst={uitkomst} />
        </>
      )}
    </div>
  );
}
