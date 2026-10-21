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
import { AI_LIMIET_STANDAARD, mergeNormen } from "@/lib/wws/normen";
import { MAATREGELEN, NIVEAU_STANDAARD, NIVEAUS, type Haalbaarheid } from "@/lib/wws/advies";
import {
  ENERGIE_RIJEN,
  NORM_SECTIES,
  leesPad,
  normenUitFormulier,
  type NormVeld,
} from "@/lib/wws/normenVelden";
import { CONTROLE_VRAAG, controleStatus } from "@/lib/wws/opslag";
import { LABELS } from "@/lib/wws";
import {
  efgOmschrijving,
  portefeuilleNormen,
  type GeenLabelEfg,
  type PortefeuilleNormen,
} from "@/lib/wws/portefeuille/analyse";
import {
  BOUWJAAR_KLASSEN,
  BOUWJAAR_NAMEN,
  RAMING_BRON,
} from "@/lib/wws/portefeuille/verduurzaming";
import { huurNormen, type HuurNormen } from "@/lib/wws/huur";
import HuurNormenBeheer from "./HuurNormenBeheer";
import { instellingenStore } from "./tellingStore";

/** Kostenramingen van het verbeteradvies, als standaard voor iedereen */
const KOSTEN_VELDEN: NormVeld[] = [
  ...MAATREGELEN.filter((m) => m.key !== "indexKlasse").map((m) => ({
    label: m.naam,
    pad: "kosten." + m.kost,
  })),
  { label: "Oppervlakte nieuw balkon (m²)", pad: "kosten.balkonM2" },
];

/**
 * Eenvoudsniveau per maatregel in het verbeteradvies. Het energielabel en het extra toilet volgen
 * een vaste regel (aantal labelstappen; wel of geen bestaande toiletruimte) en staan er niet in.
 */
const NIVEAU_MAATREGELEN = MAATREGELEN.filter(
  (m) => !["indexKlasse", "label", "toilet", "sanExtra", "keukenExtra"].includes(m.key),
);

/** Alleen wat afwijkt van de standaard bewaren, zodat nieuwe standaarden doorwerken */
function afwijkendeNiveaus(n: Record<string, Haalbaarheid>): Record<string, Haalbaarheid> {
  return Object.fromEntries(Object.entries(n).filter(([k, v]) => NIVEAU_STANDAARD[k] !== v));
}

/** Daglimiet AI-gebruik per gebruiker (ai_gebruik_boeken() in de database leest dit) */
const AI_VELDEN: NormVeld[] = [
  { label: "Plattegrond/advies inlezen (Claude) per dag", pad: "aiLimiet.lezen" },
  { label: "AI-afbeeldingen (Gemini) per dag", pad: "aiLimiet.afbeelding" },
];

/** Met de standaard-AI-limiet als die nog niet is ingesteld */
const metAiLimiet = (n: Normen): Normen => ({
  ...n,
  aiLimiet: { ...AI_LIMIET_STANDAARD, ...n.aiLimiet },
});

/** Alle getalvelden van het formulier, met hun huidige waarde als tekst */
function beginwaarden(n: Normen): Record<string, string> {
  const paden = [
    ...NORM_SECTIES.flatMap((s) => s.velden.map((v) => v.pad)),
    ...ENERGIE_RIJEN.flatMap((r) => [r.pad + ".0", r.pad + ".1"]),
    ...n.voorzKeuken.map((_v, i) => `voorzKeuken.${i}.p`),
    ...n.voorzSan.map((_v, i) => `voorzSan.${i}.p`),
    ...Object.keys(n.woz).flatMap((j) => [0, 1, 2].map((x) => `woz.${j}.${x}`)),
    ...KOSTEN_VELDEN.map((v) => v.pad),
    ...AI_VELDEN.map((v) => v.pad),
  ];
  const m = metAiLimiet(n);
  return Object.fromEntries(paden.map((p) => [p, String(leesPad(m, p) ?? "")]));
}

const datumLang = (iso: string) =>
  new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

/** Normen en parameters beheren (alleen admins) — renderNormen()/saveNormen() in wws-site.html */
export default function NormenBeheer({ normen }: { normen: Normen }) {
  const qc = useQueryClient();
  // de normen waarop het formulier is gebaseerd (na "terugzetten" de standaard)
  const [basis, setBasis] = useState(normen);
  const [getallen, setGetallen] = useState(() => beginwaarden(normen));
  const [naam, setNaam] = useState(normen.naam);
  const [gecontroleerd, setGecontroleerd] = useState(normen.gecontroleerd || "");
  const [bevestig, setBevestig] = useState(false);
  const [terugzetten, setTerugzetten] = useState(false);
  const [pf, setPf] = useState<PortefeuilleNormen>(() => portefeuilleNormen(normen.portefeuille));
  const [huur, setHuur] = useState<HuurNormen>(() => huurNormen(normen.huurindicator));
  const [niveaus, setNiveaus] = useState<Record<string, Haalbaarheid>>(() => ({
    ...NIVEAU_STANDAARD,
    ...normen.adviesNiveaus,
  }));

  /** btnNormReset: het formulier vullen met de standaardwaarden; pas opgeslagen bij "Normen opslaan" */
  function zetStandaardTerug() {
    const d = mergeNormen(null);
    setBasis(d);
    setGetallen(beginwaarden(d));
    setNaam(d.naam);
    setGecontroleerd(d.gecontroleerd || "");
    setPf(portefeuilleNormen(null));
    setNiveaus({ ...NIVEAU_STANDAARD });
    setHuur(huurNormen(null));
    toast("Standaardwaarden ingevuld. Klik op ‘Normen opslaan’ om ze te bewaren.");
  }
  const status = controleStatus(normen.gecontroleerd);

  const opslaan = useMutation({
    mutationFn: (n: Normen) => instellingenStore.slaNormenOp(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["normen"] }),
    onError: (e: Error) => toast.error("Opslaan lukte niet: " + e.message),
  });

  const nieuw = useMemo(() => {
    const n = normenUitFormulier(metAiLimiet(basis), getallen, { naam, gecontroleerd });
    // hele getallen 0–9999 (de database accepteert alleen die; anders geldt de standaard)
    const heel = (x: number, d: number) =>
      Number.isFinite(x) ? Math.max(0, Math.min(9999, Math.round(x))) : d;
    n.aiLimiet = {
      lezen: heel(n.aiLimiet!.lezen, AI_LIMIET_STANDAARD.lezen),
      afbeelding: heel(n.aiLimiet!.afbeelding, AI_LIMIET_STANDAARD.afbeelding),
    };
    // portefeuille-analyse: gecontroleerd aangevuld (ongeldige waarden → standaard)
    n.portefeuille = portefeuilleNormen(pf);
    n.adviesNiveaus = afwijkendeNiveaus(niveaus);
    // huurprijsindicator: ongeldige regels en factoren vallen terug op de standaard
    n.huurindicator = huurNormen(huur);
    return n;
  }, [basis, getallen, naam, gecontroleerd, pf, niveaus, huur]);

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
        <h1 className="font-display text-[34px] leading-tight text-foreground max-[720px]:text-[28px]">
          Normen en parameters
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Deze waarden komen uit het Beleidsboek Waarderingsstelsel zelfstandige woonruimte van de
          Huurcommissie (geldend per 1 juli 2026) en de huurprijstabel per 1 januari 2026. Pas ze
          alleen aan als de Huurcommissie nieuwe waarden publiceert. Elke vastgelegde versie bewaart
          de normen waarmee hij is berekend.
        </p>
      </div>

      <section
        className={`rounded-xl p-4 text-sm ${status.nodig ? "bg-warn" : "gh-card"}`}
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
          <div className="max-w-full overflow-x-auto">
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
          </div>
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
          <div className="max-w-full overflow-x-auto">
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
          </div>
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

        <Sectie titel="Eenvoud van maatregelen (verbeteradvies)">
          <p className="mb-3 text-xs text-muted-foreground">
            Het verbeteradvies kiest eerst de eenvoudige maatregelen en pas daarna op kosten per
            punt; een lastigere maatregel komt alleen als het doel anders niet gehaald wordt. Het
            energielabel (3 of meer stappen: lastig) en een extra toilet (zonder bestaande
            toiletruimte: lastig) volgen een vaste regel.
          </p>
          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-3">
            {(
              [
                ["Maatregelen", NIVEAU_MAATREGELEN.map((m) => [m.key, m.naam] as const)],
                [
                  "Extra keukenvoorzieningen",
                  basis.voorzKeuken.map((v) => ["keukenExtra." + v.k, v.l] as const),
                ],
                [
                  "Extra sanitaire voorzieningen",
                  basis.voorzSan.map((v) => ["sanExtra." + v.k, v.l] as const),
                ],
              ] as const
            ).map(([titel, rijen]) => (
              <div key={titel}>
                <h3 className="mb-2 text-sm font-medium">{titel}</h3>
                <ul className="space-y-1.5">
                  {rijen.map(([k, l]) => (
                    <li key={k} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">{l}</span>
                      <select
                        className="h-8 shrink-0 rounded-lg border border-transparent bg-muted px-2 text-sm"
                        aria-label={"Niveau: " + l}
                        value={niveaus[k] ?? "gemiddeld"}
                        onChange={(e) =>
                          setNiveaus({ ...niveaus, [k]: e.target.value as Haalbaarheid })
                        }
                      >
                        {NIVEAUS.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Sectie>

        <Sectie titel="AI-gebruik per gebruiker per dag">
          <p className="mb-3 text-xs text-muted-foreground">
            Hoe vaak elke collega per dag een plattegrond of verduurzamingsadvies kan laten inlezen,
            en hoeveel AI-afbeeldingen per collega per dag gemaakt kunnen worden. Ook mislukte
            pogingen tellen mee.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">{AI_VELDEN.map(veld)}</div>
        </Sectie>

        <Sectie titel="Portefeuille-analyse">
          <p className="mb-3 text-xs text-muted-foreground">
            Instellingen voor de analyse van energielabels per portefeuille. De EFG-regels zijn
            instelbaar omdat de wettelijke invulling nog gecontroleerd moet worden; de analyse en de
            PDF tonen de omschrijving hieronder.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">
                EP-Online: aanvragen per seconde (max. 10)
              </span>
              <Input
                inputMode="decimal"
                className="tabular-nums"
                value={String(pf.epPerSeconde)}
                onChange={(e) =>
                  setPf({ ...pf, epPerSeconde: Number(e.target.value.replace(",", ".")) })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Bloxs: aanvragen per seconde (max. 5)</span>
              <Input
                inputMode="decimal"
                className="tabular-nums"
                value={String(pf.bloxsPerSeconde)}
                onChange={(e) =>
                  setPf({ ...pf, bloxsPerSeconde: Number(e.target.value.replace(",", ".")) })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Verouderd: geregistreerd vóór</span>
              <Input
                type="date"
                value={pf.verouderdVoor}
                onChange={(e) => setPf({ ...pf, verouderdVoor: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">EFG-regels: ingangsdatum</span>
              <Input
                type="date"
                value={pf.efg.ingangsdatum}
                onChange={(e) => setPf({ ...pf, efg: { ...pf.efg, ingangsdatum: e.target.value } })}
              />
            </label>
          </div>
          <fieldset className="mt-3">
            <legend className="text-sm text-muted-foreground">
              EFG-regels: labels die eronder vallen
            </legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {LABELS.map((l) => (
                <label key={l} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={pf.efg.klassen.includes(l)}
                    onChange={(e) =>
                      setPf({
                        ...pf,
                        efg: {
                          ...pf.efg,
                          klassen: e.target.checked
                            ? LABELS.filter((x) => x === l || pf.efg.klassen.includes(x))
                            : pf.efg.klassen.filter((x) => x !== l),
                        },
                      })
                    }
                  />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-3 flex max-w-md flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              EFG-regels: woningen zonder geregistreerd label
            </span>
            <select
              className="h-9 rounded-lg border border-transparent bg-muted px-2 text-sm"
              value={pf.efg.geenLabel}
              onChange={(e) =>
                setPf({ ...pf, efg: { ...pf.efg, geenLabel: e.target.value as GeenLabelEfg } })
              }
            >
              <option value="apart">Apart vermelden</option>
              <option value="meetellen">Meetellen in de EFG-groep</option>
              <option value="negeren">Niet vermelden</option>
            </select>
          </label>
          <p
            className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-xs"
            aria-live="polite"
          >
            Omschrijving in de analyse: {efgOmschrijving(portefeuilleNormen(pf).efg)}
          </p>
        </Sectie>

        <Sectie titel="Huurprijsindicator">
          <HuurNormenBeheer waarde={huur} onChange={setHuur} />
        </Sectie>

        <Sectie titel="Verduurzamingsraming">
          <p className="mb-3 text-sm text-muted-foreground">
            Grove kostenindicatie per woning om naar label D en naar C te komen: labelstappen ×
            gebruiksoppervlakte (BAG) × bedrag per m² per stap × factor voor het bouwjaar. Met een
            lage en een hoge prijs ontstaat een bandbreedte. Zonder bedragen toont de analyse alleen
            de labelstappen.
          </p>
          <p className="mb-3 rounded-lg border border-border bg-muted px-3 py-2 text-xs">
            {RAMING_BRON}
          </p>
          <div className="grid max-w-md grid-cols-2 gap-3">
            {(
              [
                ["perM2Laag", "€ per m² per labelstap (laag)"],
                ["perM2Hoog", "€ per m² per labelstap (hoog)"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pf.raming[k] || ""}
                  placeholder="0"
                  onChange={(e) =>
                    setPf({
                      ...pf,
                      raming: { ...pf.raming, [k]: Number(e.target.value), ingesteld: true },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <table className="mt-4 text-sm" aria-label="Per bouwjaar">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-4 font-medium">Bouwjaar</th>
                <th className="py-1 pr-4 font-medium">Factor op de kosten</th>
                <th className="py-1 font-medium">Aangenomen label zonder registratie</th>
              </tr>
            </thead>
            <tbody>
              {BOUWJAAR_KLASSEN.map((k) => (
                <tr key={k}>
                  <td className="py-1 pr-4">{BOUWJAAR_NAMEN[k]}</td>
                  <td className="py-1 pr-4">
                    <Input
                      type="number"
                      min={0.1}
                      max={10}
                      step="0.05"
                      className="w-24"
                      aria-label={"Factor " + BOUWJAAR_NAMEN[k]}
                      value={pf.raming.factor[k]}
                      onChange={(e) =>
                        setPf({
                          ...pf,
                          raming: {
                            ...pf.raming,
                            factor: { ...pf.raming.factor, [k]: Number(e.target.value) },
                          },
                        })
                      }
                    />
                  </td>
                  <td className="py-1">
                    <select
                      className="h-9 rounded-lg border border-transparent bg-muted px-2 text-sm"
                      aria-label={"Aangenomen label " + BOUWJAAR_NAMEN[k]}
                      value={pf.raming.aangenomen[k]}
                      onChange={(e) =>
                        setPf({
                          ...pf,
                          raming: {
                            ...pf.raming,
                            aangenomen: { ...pf.raming.aangenomen, [k]: e.target.value },
                          },
                        })
                      }
                    >
                      {LABELS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sectie>

        <p className="text-xs text-muted-foreground">
          De maximale huurprijzen komen uit de huurprijstabel per 1 januari 2026 (Bijlage 3 van het
          beleidsboek, 40 t/m 250 punten). Boven 250 punten wordt per punt het verschil tussen 249
          en 250 punten opgeteld.
        </p>

        <div className="sticky bottom-0 -mx-6 border-t border-border bg-background px-6 py-3">
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={opslaan.isPending}>
              Normen opslaan
            </Button>
            <Button type="button" variant="outline" onClick={() => setTerugzetten(true)}>
              Normen terugzetten naar standaard
            </Button>
          </div>
        </div>
      </form>

      <AlertDialog open={terugzetten} onOpenChange={setTerugzetten}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Normen terugzetten?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle normen terugzetten naar de standaardwaarden? Het formulier wordt gevuld met de
              standaard; er wordt pas iets opgeslagen als je daarna op ‘Normen opslaan’ klikt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={zetStandaardTerug}>Terugzetten</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    <div className="max-w-full overflow-x-auto">
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
    </div>
  );
}
