import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import type { HuurIndicatie } from "@/lib/wws/huur/opslag";
import { HUUR_DISCLAIMER, maakHuurPdf } from "@/lib/wws/pdf/huur";
import { Bronnen, FactorTabel, MarkthuurKaart, WwsKaart } from "./HuurprijsIndicator";
import { huurIndicatiesQuery, huurStore, klantenQuery } from "./tellingStore";
import { useDownload } from "./useDownload";
import { RijActies } from "./RijActies";

interface Rechten {
  isAdmin?: boolean | undefined;
  magSchrijven?: boolean | undefined;
}

const euro = (x: number) => "€ " + Math.round(x).toLocaleString("nl-NL");
const datum = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const adresVan = (i: HuurIndicatie) => `${i.data.woning.straat} ${i.data.woning.huisnummer}`.trim();

/** Archief: opgeslagen huurprijsindicaties zoeken, bekijken (zoals opgeslagen), PDF, verwijderen */
export function HuurIndicatiesArchief({
  rechten,
  userId,
  tabs,
}: {
  rechten: Rechten;
  userId: string;
  tabs: ReactNode;
}) {
  const qc = useQueryClient();
  const { data = [], isPending, error } = useQuery(huurIndicatiesQuery());
  const { data: klanten = [] } = useQuery(klantenQuery());
  const klantNaam = (id: string | null) => (id && klanten.find((k) => k.id === id)?.naam) || null;
  const [zoek, setZoek] = useState("");
  const [bekeken, setBekeken] = useState<HuurIndicatie | null>(null);
  const [teVerwijderen, setTeVerwijderen] = useState<HuurIndicatie | null>(null);
  const download = useDownload();

  const lijst = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    if (!q) return data;
    return data.filter((i) =>
      [
        adresVan(i),
        i.data.woning.postcode,
        i.data.woning.plaats,
        klantNaam(i.klantId) ?? "",
        i.ownerNaam ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q.replace(/\s+/g, " ")),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, zoek, klanten]);

  const verwijderen = useMutation({
    mutationFn: (id: string) => huurStore.verwijder(id),
    onSuccess: (_x, id) => {
      if (bekeken?.id === id) setBekeken(null);
      void qc.invalidateQueries({ queryKey: ["huurindicaties"] });
      toast.success("Indicatie verwijderd.");
    },
    onError: () => toast.error("Verwijderen lukte niet."),
  });

  const pdf = (i: HuurIndicatie) =>
    void download.pdf("huur-" + i.id, (lib) =>
      maakHuurPdf(lib, { data: i.data, eigenaar: klantNaam(i.klantId) }),
    );
  const magWeg = (i: HuurIndicatie) =>
    !!rechten.magSchrijven && (i.ownerId === userId || !!rechten.isAdmin);

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] leading-tight text-foreground max-[720px]:text-[28px]">
            Archief
          </h1>
          {tabs}
          <p className="mt-1 text-sm text-muted-foreground">
            Opgeslagen huurprijsindicaties, precies zoals ze toen zijn berekend.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Zoeken"
            className="w-72 bg-card"
            placeholder="Zoek op adres, postcode, plaats of eigenaar"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />
          {rechten.magSchrijven && (
            <Button asChild>
              <Link to="/huurprijsindicator">Nieuwe indicatie</Link>
            </Button>
          )}
        </div>
      </div>

      {bekeken && (
        <BekekenIndicatie
          i={bekeken}
          eigenaar={klantNaam(bekeken.klantId)}
          kanOpnieuw={!!rechten.magSchrijven}
          pdfBezig={download.bezig === "huur-" + bekeken.id}
          onPdf={() => pdf(bekeken)}
          onSluit={() => setBekeken(null)}
        />
      )}

      <section aria-label="Huurprijsindicaties" className="gh-card">
        {isPending ? (
          <p className="p-4 text-sm text-muted-foreground">Laden…</p>
        ) : error ? (
          <p className="p-4 text-sm text-destructive">De indicaties konden niet worden geladen.</p>
        ) : lijst.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {data.length ? "Geen indicaties gevonden." : "Nog geen opgeslagen indicaties."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2 font-medium">Datum</th>
                  <th className="p-2 font-medium">Adres</th>
                  <th className="p-2 font-medium">Eigenaar</th>
                  <th className="p-2 font-medium">Door</th>
                  <th className="p-2 text-right font-medium">Markthuur</th>
                  <th className="p-2 text-right font-medium">Advies</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {lijst.map((i) => (
                  <tr key={i.id} className="border-b border-border last:border-0">
                    <td className="p-2 whitespace-nowrap">{datum(i.gemaaktOp)}</td>
                    <td className="p-2">
                      <div className="font-medium">{adresVan(i)}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.data.woning.postcode.replace(/^(\d{4})/, "$1 ")} {i.data.woning.plaats}
                      </div>
                    </td>
                    <td className="p-2">{klantNaam(i.klantId) ?? "–"}</td>
                    <td className="p-2">{i.ownerNaam ?? "–"}</td>
                    <td className="p-2 text-right tabular-nums">
                      {euro(i.data.markthuur.verwacht)}
                    </td>
                    <td className="p-2 text-right font-medium tabular-nums">
                      {euro(i.data.advies.bedrag)}
                    </td>
                    <td className="p-2">
                      <RijActies
                        naam={adresVan(i)}
                        acties={[
                          magWeg(i) && {
                            label: "Verwijderen",
                            gevaar: true,
                            onSelect: () => setTeVerwijderen(i),
                          },
                        ]}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={"Bekijk " + adresVan(i)}
                          onClick={() => setBekeken(i)}
                        >
                          Bekijken
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={"PDF " + adresVan(i)}
                          disabled={!!download.bezig}
                          onClick={() => pdf(i)}
                        >
                          PDF
                        </Button>
                      </RijActies>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AlertDialog open={!!teVerwijderen} onOpenChange={(o) => !o && setTeVerwijderen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Indicatie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              De huurprijsindicatie voor {teVerwijderen ? adresVan(teVerwijderen) : ""} wordt
              definitief verwijderd. Een gekoppelde telling blijft bestaan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange text-orange-foreground shadow-none hover:brightness-105"
              onClick={() => {
                if (teVerwijderen) verwijderen.mutate(teVerwijderen.id);
                setTeVerwijderen(null);
              }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

/** Een opgeslagen indicatie, precies zoals toen berekend (met de bronregel en factoren van toen) */
function BekekenIndicatie({
  i,
  eigenaar,
  kanOpnieuw,
  onPdf,
  pdfBezig,
  onSluit,
}: {
  i: HuurIndicatie;
  eigenaar: string | null;
  kanOpnieuw: boolean;
  onPdf: () => void;
  pdfBezig: boolean;
  onSluit: () => void;
}) {
  const d = i.data;
  const w = d.woning;
  return (
    <section
      aria-label="Opgeslagen indicatie"
      className="space-y-4 gh-card ring-2 ring-primary/40 p-4"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">
            {adresVan(i)}, {w.postcode.replace(/^(\d{4})/, "$1 ")} {w.plaats}
          </h2>
          <p className="text-xs text-muted-foreground">
            Opgeslagen op {new Date(i.gemaaktOp).toLocaleString("nl-NL")} door{" "}
            {i.ownerNaam ?? d.gemaaktDoor}
            {eigenaar ? " · eigenaar " + eigenaar : ""}. Berekend met de bronregel en factoren van
            toen; latere wijzigingen in Normen veranderen deze indicatie niet.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={pdfBezig} onClick={onPdf}>
          {pdfBezig ? "PDF maken…" : "PDF"}
        </Button>
        {kanOpnieuw && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/huurprijsindicator" search={{ opnieuw: i.id }}>
              Opnieuw berekenen met huidige tabel
            </Link>
          </Button>
        )}
        {i.tellingId && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/wws" search={{ id: i.tellingId }}>
              Telling openen
            </Link>
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onSluit}>
          Sluiten
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MarkthuurKaart m={d.markthuur} />
        <WwsKaart
          c={d.wws}
          advies={d.advies}
          grens={d.snapshot.grensVrijeSector}
          kanTellen={false}
        />
      </div>
      <FactorTabel m={d.markthuur} />
      <Bronnen m={d.markthuur} />
      <p className="text-xs text-muted-foreground" role="note">
        {HUUR_DISCLAIMER}
      </p>
    </section>
  );
}
