import { useMemo, useState, type ReactNode } from "react";
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
import type { Normen } from "@/lib/wws";
import { MAATREGELEN } from "@/lib/wws/advies";
import {
  ENERGIE_RIJEN,
  NORM_SECTIES,
  leesPad,
  normenUitFormulier,
  type NormVeld,
} from "@/lib/wws/normenVelden";
import { CONTROLE_VRAAG, controleStatus } from "@/lib/wws/opslag";
import { instellingenStore } from "./tellingStore";

/** Kostenramingen van het verbeteradvies, als standaard voor iedereen */
const KOSTEN_VELDEN: NormVeld[] = [
  ...MAATREGELEN.filter((m) => m.key !== "indexKlasse").map((m) => ({
    label: m.naam,
    pad: "kosten." + m.kost,
  })),
  { label: "Oppervlakte nieuw balkon (m²)", pad: "kosten.balkonM2" },
];

/** Alle getalvelden van het formulier, met hun huidige waarde als tekst */
function beginwaarden(n: Normen): Record<string, string> {
  const paden = [
    ...NORM_SECTIES.flatMap((s) => s.velden.map((v) => v.pad)),
    ...ENERGIE_RIJEN.flatMap((r) => [r.pad + ".0", r.pad + ".1"]),
    ...n.voorzKeuken.map((_v, i) => `voorzKeuken.${i}.p`),
    ...n.voorzSan.map((_v, i) => `voorzSan.${i}.p`),
    ...Object.keys(n.woz).flatMap((j) => [0, 1, 2].map((x) => `woz.${j}.${x}`)),
    ...KOSTEN_VELDEN.map((v) => v.pad),
  ];
  return Object.fromEntries(paden.map((p) => [p, String(leesPad(n, p) ?? "")]));
}

const datumLang = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

/** Normen en parameters beheren (alleen admins) — renderNormen()/saveNormen() in wws-site.html */
export default function NormenBeheer({ normen }: { normen: Normen }) {
  const qc = useQueryClient();
  const [getallen, setGetallen] = useState(() => beginwaarden(normen));
  const [naam, setNaam] = useState(normen.naam);
  const [gecontroleerd, setGecontroleerd] = useState(normen.gecontroleerd || "");
  const [bevestig, setBevestig] = useState(false);
  const status = controleStatus(normen.gecontroleerd);

  const opslaan = useMutation({
    mutationFn: (n: Normen) => instellingenStore.slaNormenOp(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["normen"] }),
    onError: (e: Error) => toast.error("Opslaan lukte niet: " + e.message),
  });

  const nieuw = useMemo(
    () => normenUitFormulier(normen, getallen, { naam, gecontroleerd }),
    [normen, getallen, naam, gecontroleerd],
  );

  const zet = (pad: string, waarde: string) => setGetallen((g) => ({ ...g, [pad]: waarde }));
  const veld = (v: NormVeld) => (
    <label key={v.pad} className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{v.label}</span>
      <Input
        inputMode="decimal"
        className="tabular-nums"
        value={getallen[v.pad] ?? ""}
        onChange={(e) => zet(v.pad, e.target.value)}
      />
    </label>
  );
  const cel = (pad: string, label: string) => (
    <Input
      aria-label={label}
      inputMode="decimal"
      className="h-8 w-24 tabular-nums"
      value={getallen[pad] ?? ""}
      onChange={(e) => zet(pad, e.target.value)}
    />
  );

  const vandaag = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <div>
        <h1 className="font-display text-4xl text-foreground">Normen en parameters</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Deze waarden komen uit het Beleidsboek Waarderingsstelsel zelfstandige woonruimte van de
          Huurcommissie (geldend per 1 juli 2026) en de huurprijstabel per 1 januari 2026. Pas ze
          alleen aan als de Huurcommissie nieuwe waarden publiceert. Elke vastgelegde versie bewaart
          de normen waarmee hij is berekend.
        </p>
      </div>

      <section
        className={`rounded-lg border p-4 text-sm ${
          status.nodig ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-card"
        }`}
        aria-label="Controle van de normen"
      >
        {status.nodig ? (
          <>
            <p className="font-medium">Tijd voor de maandelijkse controle</p>
            <p className="mt-1">{status.reden} Vraag Claude in een gesprek:</p>
            <p className="mt-2 rounded-md bg-background p-2 italic">{CONTROLE_VRAAG}</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigator.clipboard
                    .writeText(CONTROLE_VRAAG)
                    .then(() => toast("Vraag gekopieerd"))
                    .catch(() => toast.error("Kopiëren lukte niet"))
                }
              >
                Vraag kopiëren
              </Button>
              <Button
                size="sm"
                disabled={opslaan.isPending}
                onClick={() =>
                  opslaan.mutate(
                    { ...structuredClone(normen), gecontroleerd: vandaag },
                    {
                      onSuccess: () => {
                        setGecontroleerd(vandaag);
                        toast.success("Controle vastgelegd");
                      },
                    },
                  )
                }
              >
                Gecontroleerd
              </Button>
            </div>
          </>
        ) : (
          <p>
            Normen gecontroleerd op{" "}
            {normen.gecontroleerd ? datumLang(normen.gecontroleerd) : "nog niet"}.
          </p>
        )}
      </section>

      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          setBevestig(true);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Laatst gecontroleerd op</span>
            <Input
              type="date"
              value={gecontroleerd}
              onChange={(e) => setGecontroleerd(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Naam normenset</span>
            <Input value={naam} onChange={(e) => setNaam(e.target.value)} />
          </label>
        </div>

        {NORM_SECTIES.slice(0, 1).map((s) => (
          <Sectie key={s.titel} titel={s.titel}>
            <div className="grid gap-3 sm:grid-cols-3">{s.velden.map(veld)}</div>
          </Sectie>
        ))}

        <Sectie titel="Energielabel">
          <table className="text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-4 font-medium">Label</th>
                <th className="py-1 pr-4 font-medium">Eengezins</th>
                <th className="py-1 font-medium">Meergezins</th>
              </tr>
            </thead>
            <tbody>
              {ENERGIE_RIJEN.map((r) => (
                <tr key={r.pad}>
                  <td className="py-1 pr-4">{r.label}</td>
                  <td className="py-1 pr-4">{cel(r.pad + ".0", r.label + " eengezins")}</td>
                  <td className="py-1">{cel(r.pad + ".1", r.label + " meergezins")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sectie>

        {NORM_SECTIES.slice(1, 2).map((s) => (
          <Sectie key={s.titel} titel={s.titel}>
            <div className="grid gap-3 sm:grid-cols-3">{s.velden.map(veld)}</div>
            <VoorzTabel lijst={normen.voorzKeuken} prefix="voorzKeuken" cel={cel} />
          </Sectie>
        ))}

        {NORM_SECTIES.slice(2, 3).map((s) => (
          <Sectie key={s.titel} titel={s.titel}>
            <div className="grid gap-3 sm:grid-cols-3">{s.velden.map(veld)}</div>
            <VoorzTabel lijst={normen.voorzSan} prefix="voorzSan" cel={cel} />
          </Sectie>
        ))}

        {NORM_SECTIES.slice(3, 4).map((s) => (
          <Sectie key={s.titel} titel={s.titel}>
            <div className="grid gap-3 sm:grid-cols-3">{s.velden.map(veld)}</div>
          </Sectie>
        ))}

        <Sectie titel="WOZ-kengetallen">
          <table className="text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-4 font-medium">Beschikking</th>
                <th className="py-1 pr-4 font-medium">Onderdeel I (€)</th>
                <th className="py-1 pr-4 font-medium">Onderdeel II (€)</th>
                <th className="py-1 font-medium">II kleine nieuwbouw COROP (€)</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(normen.woz)
                .sort()
                .reverse()
                .map((j) => (
                  <tr key={j}>
                    <td className="py-1 pr-4">1 januari {j}</td>
                    {[0, 1, 2].map((x) => (
                      <td key={x} className="py-1 pr-4">
                        {cel(`woz.${j}.${x}`, `WOZ ${j} kolom ${x + 1}`)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">{NORM_SECTIES[4]!.velden.map(veld)}</div>
        </Sectie>

        {NORM_SECTIES.slice(5).map((s) => (
          <Sectie key={s.titel} titel={s.titel}>
            <div className="grid gap-3 sm:grid-cols-3">{s.velden.map(veld)}</div>
          </Sectie>
        ))}

        <Sectie titel="Standaardkosten verbeteradvies">
          <p className="mb-3 text-xs text-muted-foreground">
            De kostenramingen waarmee het verbeteradvies begint; ook op te slaan vanuit het
            adviesvenster.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">{KOSTEN_VELDEN.map(veld)}</div>
        </Sectie>

        <p className="text-xs text-muted-foreground">
          De maximale huurprijzen komen uit de huurprijstabel per 1 januari 2026 (Bijlage 3 van het
          beleidsboek, 40 t/m 250 punten). Boven 250 punten wordt per punt het verschil tussen 249
          en 250 punten opgeteld.
        </p>

        <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 py-3">
          <Button type="submit" disabled={opslaan.isPending}>
            Normen opslaan
          </Button>
        </div>
      </form>

      <AlertDialog open={bevestig} onOpenChange={setBevestig}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Normen opslaan?</AlertDialogTitle>
            <AlertDialogDescription>
              Je staat op het punt de normen en parameters aan te passen. Dit geldt direct voor alle
              collega's en voor elke nieuwe berekening — pas dit alleen aan als de Huurcommissie
              zelf nieuwe waarden heeft gepubliceerd. Weet je het zeker?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                opslaan.mutate(nieuw, { onSuccess: () => toast.success("Normen opgeslagen") })
              }
            >
              Opslaan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Sectie({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">{titel}</h2>
      {children}
    </section>
  );
}

function VoorzTabel({
  lijst,
  prefix,
  cel,
}: {
  lijst: Normen["voorzKeuken"];
  prefix: string;
  cel: (pad: string, label: string) => ReactNode;
}) {
  return (
    <table className="mt-3 text-sm">
      <tbody>
        {lijst.map((it, i) => (
          <tr key={it.k}>
            <td className="py-1 pr-4">{it.l}</td>
            <td className="py-1">{cel(`${prefix}.${i}.p`, it.l)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
