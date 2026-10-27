import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { eur, fmt, num, type EnergieAdvies, type WwsInput } from "@/lib/wws";
import {
  MAATREGELEN,
  adviesOpties,
  berekenAdvies,
  selectieResultaat,
  standaardInstellingen,
  type AdviesInstellingen,
  type AdviesStap,
  type Haalbaarheid,
  type Kosten,
  type KostenKey,
  type MaatregelKey,
} from "@/lib/wws/advies";
import {
  terugvalBijAfmelden,
  terugvalTekst,
  vergelijkBeginlabel,
} from "@/lib/wws/advies/energieAdvies";
import type { TellingMeta } from "@/lib/wws/opslag";
import { maakAdviesPdf, maakRoutePdf } from "@/lib/wws/pdf/rapporten";
import type { PdfRapportPlattegrond } from "@/lib/wws/pdf/delen";
import { useNormen } from "./NormenContext";
import { useDownload } from "./useDownload";
import EnergieAdviesBlok from "./EnergieAdviesBlok";
import EnergieAdviesKeuze from "./EnergieAdviesKeuze";
import { instellingenStore } from "./tellingStore";

const H_LABEL: Record<Haalbaarheid, string> = {
  eenvoudig: "Eenvoudig",
  gemiddeld: "Gemiddeld",
  lastig: "Lastig",
};
const H_KLEUR: Record<Haalbaarheid, string> = {
  eenvoudig: "bg-seg-hoog text-seg-foreground",
  gemiddeld: "bg-orange text-orange-foreground",
  lastig: "bg-seg-laag text-seg-foreground",
};

/** Titel van een samengevoegde stap (stapTitel() in wws-site.html) */
const GROEP_TITEL: Partial<Record<MaatregelKey, string>> = {
  keukenExtra: "Extra keukenvoorzieningen",
  sanExtra: "Extra sanitaire voorzieningen",
  verwOverig: "Verwarming in overige ruimten",
  verwVertrek: "Verwarming in vertrekken",
  koeling: "Verkoeling in vertrekken",
  toiletHang: "Hangende toiletten",
};

const vinkCls = "size-4 shrink-0 accent-primary";

function Badge({ h, titel }: { h: Haalbaarheid; titel?: string | undefined }) {
  return (
    <span
      className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-medium ${H_KLEUR[h]}`}
      title={titel}
    >
      {H_LABEL[h]}
    </span>
  );
}

function Chip({ children, eigen = false }: { children: ReactNode; eigen?: boolean }) {
  return (
    <span
      className={`mr-1 mt-1 inline-block rounded-lg border px-2 py-0.5 text-xs ${
        eigen ? "border-primary text-primary" : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

function StapTitel({ s }: { s: AdviesStap }) {
  const uitAdvies = s.bron === "advies";
  if (s.key === "label" || s.key === "indexKlasse" || s.delen.length <= 1)
    return (
      <>
        <div className="font-medium">
          {s.o} {uitAdvies && <Chip eigen>uit geüpload advies</Chip>}
        </div>
        {uitAdvies && s.omschrijving.length > 0 && (
          <div>
            {s.omschrijving.map((d) => (
              <Chip key={d}>{d}</Chip>
            ))}
          </div>
        )}
        {uitAdvies && (s.besparingMin > 0 || s.besparingMax > 0) && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            Besparing volgens advies: {eur(s.besparingMin)}
            {s.besparingMax > s.besparingMin && <> – {eur(s.besparingMax)}</>} per jaar
          </div>
        )}
      </>
    );
  return (
    <>
      <div className="font-medium">{GROEP_TITEL[s.key] ?? s.delen[0]}</div>
      <div>
        {s.delen.map((d) => (
          <Chip key={d}>{d.replace(/ \(keuken\)$/, "")}</Chip>
        ))}
      </div>
    </>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** De werkversie van de telling */
  input: WwsInput;
  /** Woninggegevens voor de PDF's; zonder meta geen PDF-knoppen */
  meta?: TellingMeta | undefined;
  /** De plattegrond voor de PDF's (JPEG-data-URL), pas opgehaald bij het downloaden */
  plattegrond?: (() => Promise<string | null>) | undefined;
  /** De plattegronden alleen voor het rapport, pas opgehaald bij het downloaden */
  rapportPlattegronden?: (() => Promise<PdfRapportPlattegrond[]>) | undefined;
  /** Verduurzamingsadvies uploaden/verwijderen in de werkversie (zonder: alleen tonen) */
  onEnergieAdvies?: ((advies: EnergieAdvies | null) => void) | undefined;
  /** "Toepassen op telling": de nieuwe invoer, het aantal maatregelen en de punten daarna */
  onToepassen: (input: WwsInput, n: number, punten: number) => void | Promise<void>;
  /** Admins kunnen de kosten als standaard voor iedereen opslaan */
  isAdmin?: boolean;
  /** Uit bij alleen-lezen (kijkrol, gedeelde telling) */
  magToepassen?: boolean;
  /** Naam van de gebruiker, voor de bevestiging van het beginlabel uit het energieadvies */
  bewerker?: string;
}

/** Advies vrije sector: route naar de vrije sector, zoals het adviesvenster in wws-site.html. */
export default function AdviesDialoog({
  open,
  onOpenChange,
  input,
  meta,
  plattegrond,
  rapportPlattegronden,
  onEnergieAdvies,
  onToepassen,
  isAdmin = false,
  magToepassen = true,
  bewerker = "",
}: Props) {
  const NORMEN = useNormen();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Advies: route naar de vrije sector</DialogTitle>
          {/* de bron heeft geen ondertitel; alleen voor schermlezers */}
          <DialogDescription className="sr-only">
            De goedkoopste route naar de vrije sector (vanaf {NORMEN.grensMidden + 1} punten), met
            een eventuele marge.
          </DialogDescription>
        </DialogHeader>
        {/* alleen gemonteerd zolang het venster open is: elke keer openen begint opnieuw */}
        {open && (
          <AdviesInhoud
            input={input}
            meta={meta}
            plattegrond={plattegrond}
            rapportPlattegronden={rapportPlattegronden}
            onEnergieAdvies={onEnergieAdvies}
            onToepassen={onToepassen}
            bewerker={bewerker}
            isAdmin={isAdmin}
            magToepassen={magToepassen}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdviesInhoud({
  input,
  meta,
  plattegrond,
  rapportPlattegronden,
  onEnergieAdvies,
  onToepassen,
  isAdmin,
  magToepassen,
  bewerker,
}: Pick<
  Props,
  "input" | "meta" | "plattegrond" | "rapportPlattegronden" | "onEnergieAdvies" | "onToepassen"
> & {
  isAdmin: boolean;
  magToepassen: boolean;
  bewerker: string;
}) {
  const NORMEN = useNormen();
  const download = useDownload();
  const [inst, setInst] = useState<AdviesInstellingen>(() => standaardInstellingen(NORMEN));
  // Instellingen-tab: concept, wordt verwerkt bij elke herberekening (readAdviesInputs())
  const [conceptKosten, setConceptKosten] = useState<Record<KostenKey, string>>(() =>
    kostenTekst(inst.kosten),
  );
  const [conceptUit, setConceptUit] = useState(inst.uit);
  const [margeTekst, setMargeTekst] = useState(String(inst.marge));
  const [skip, setSkip] = useState<Record<number, boolean>>({});
  const [toepassenBezig, setToepassenBezig] = useState(false);
  const [tab, setTab] = useState("route");
  const ea = input.energieAdvies;
  const beginVraag = useMemo(() => {
    const v = vergelijkBeginlabel(input.energie, ea);
    return v?.verschil && ea?.uitgangspunt?.label !== v.advies.label ? v : null;
  }, [input.energie, ea]);

  const A = useMemo(() => berekenAdvies(input, NORMEN, inst), [input, inst, NORMEN]);
  // de opties van het adviesrapport: middenhuur optimaal, kleine en ruime marge
  const opties = useMemo(() => adviesOpties(input, NORMEN, inst), [input, inst, NORMEN]);
  const terugval = useMemo(
    () => terugvalBijAfmelden(input, NORMEN, new Date().toISOString().slice(0, 10)),
    [input, NORMEN],
  );
  const S = useMemo(() => selectieResultaat(input, NORMEN, A, skip), [input, A, skip, NORMEN]);

  // Kosten als standaard voor iedereen (alleen admins; de database staat het ook alleen hen toe)
  const qc = useQueryClient();
  const kostenOpslaan = useMutation({
    mutationFn: () => {
      const kosten = Object.fromEntries(
        Object.entries(conceptKosten).map(([k, v]) => [k, num(v)]),
      ) as Kosten;
      return instellingenStore.slaNormenOp({
        ...structuredClone(NORMEN),
        kosten: { ...NORMEN.kosten, ...kosten },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["normen"] });
      toast.success("Kostenramingen opgeslagen als standaard");
    },
    onError: (e: Error) => toast.error("Opslaan lukte niet: " + e.message),
  });

  /** Herberekenen met een wijziging; neemt ook het concept van de instellingen mee */
  const herbereken = (wijziging: Partial<AdviesInstellingen> = {}) => {
    const kosten = Object.fromEntries(
      Object.entries(conceptKosten).map(([k, v]) => [k, num(v)]),
    ) as Kosten;
    setInst((i) => ({ ...i, kosten, uit: { ...conceptUit }, ...wijziging }));
    setSkip({});
  };

  const grens = NORMEN.grensMidden + 1;
  const gehaald = S.R.totaal >= A.doel;
  const vrij = S.R.totaal >= grens;
  const lo = Math.min(A.start.totaal, S.R.totaal);
  const hi = Math.max(A.doel, S.R.totaal, A.start.totaal) + 5;
  const pc = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const forcedSet = new Set(inst.forced);

  const zetMarge = () => {
    const m = Math.max(0, Math.min(60, Math.round(num(margeTekst))));
    setMargeTekst(String(m));
    if (m !== inst.marge) herbereken({ marge: m });
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi titel="Nu" waarde={A.start.totaal} sub="punten" />
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Doel</div>
          <div className="text-2xl font-semibold tabular-nums">{A.doel}</div>
          <label className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            marge
            <Input
              aria-label="Marge in punten"
              inputMode="numeric"
              className="h-7 w-14 px-2 text-xs"
              value={margeTekst}
              onChange={(e) => setMargeTekst(e.target.value)}
              onBlur={zetMarge}
              onKeyDown={(e) => e.key === "Enter" && zetMarge()}
            />
            punten
          </label>
        </div>
        <Kpi
          titel="Met selectie"
          waarde={S.R.totaal}
          sub="punten"
          kleur={gehaald ? "text-emerald-600" : vrij ? "text-orange-ink" : ""}
        />
        <Kpi titel="Kosten selectie" waarde={eur(S.kosten)} sub="indicatie" klein />
      </div>

      <div
        className="relative mb-5 h-3 rounded-full bg-muted"
        role="img"
        aria-label={`${S.R.totaal} van ${A.doel} punten`}
      >
        <div className="h-3 rounded-full bg-primary" style={{ width: pc(S.R.totaal) + "%" }} />
        <div
          className="absolute -top-1 h-5 w-0.5 bg-foreground"
          style={{ left: pc(A.doel) + "%" }}
          title={"Doel " + A.doel}
        />
        <div
          className="absolute -top-1 h-5 w-0.5 bg-emerald-600"
          style={{ left: pc(grens) + "%" }}
          title={"Vrije sector vanaf " + grens}
        />
        <span className="absolute left-0 top-4 text-xs text-muted-foreground">{lo}</span>
        <span
          className="absolute top-4 -translate-x-1/2 text-xs text-muted-foreground"
          style={{ left: pc(A.doel) + "%" }}
        >
          doel {A.doel}
        </span>
      </div>

      <p className="text-sm" role="status" aria-label="Status advies">
        {gehaald ? (
          <>
            <b className="text-emerald-600">Doel gehaald</b> met {S.n} maatregel
            {S.n === 1 ? "" : "en"}.
          </>
        ) : vrij ? (
          <>
            <b className="text-orange-ink">Vrije sector</b>, maar nog {A.doel - S.R.totaal} punten
            onder het doel.
          </>
        ) : (
          <>
            <b>Nog {grens - S.R.totaal} punten</b> tot de vrije sector.
          </>
        )}
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className={vinkCls}
          checked={inst.labelsprong}
          onChange={(e) => herbereken({ labelsprong: e.target.checked })}
        />
        Altijd 1 labelsprong verwerken in het advies (ook in de downloadbare adviesrapporten)
      </label>

      {terugval && (
        <p role="note" className="rounded-lg bg-warn px-3 py-2 text-sm">
          {terugvalTekst(terugval)}
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="route">Route ({A.stappen.length})</TabsTrigger>
          <TabsTrigger value="opties">Opties ({opties.length})</TabsTrigger>
          <TabsTrigger value="alle">Alle maatregelen ({A.los.length})</TabsTrigger>
          {ea && <TabsTrigger value="energie">Energieadvies</TabsTrigger>}
          <TabsTrigger value="inst">Instellingen en kosten</TabsTrigger>
        </TabsList>

        <TabsContent value="route" className="space-y-3">
          {beginVraag && (
            <div
              role="note"
              className="flex flex-wrap items-center gap-3 rounded-lg bg-warn px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                Het energieadvies gaat uit van label {beginVraag.advies.label}, EP-Online van{" "}
                {beginVraag.registratie.label
                  ? "label " + beginVraag.registratie.label
                  : beginVraag.registratie.omschrijving}
                . Tot je dat bevestigt, rekent deze route met het geregistreerde label.
              </span>
              <Button size="sm" variant="outline" onClick={() => setTab("energie")}>
                Naar Energieadvies
              </Button>
            </div>
          )}
          {A.start.totaal >= A.doel ? (
            <Melding ok>
              De woning heeft al {A.start.totaal} punten en haalt het doel zonder maatregelen.
            </Melding>
          ) : (
            !A.gehaald && <NietGehaald eind={A.eind.totaal} max={A.maxHaalbaar} doel={A.doel} />
          )}
          {A.stappen.length > 0 && (
            <>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {A.stappen.map((s, k) => (
                  <li key={k}>
                    <label
                      className={`flex items-start gap-3 px-3 py-2.5 text-sm ${skip[k] ? "opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className={vinkCls + " mt-1"}
                        aria-label={"Stap " + (k + 1) + " toepassen"}
                        checked={!skip[k]}
                        onChange={(e) => setSkip((sk) => ({ ...sk, [k]: !e.target.checked }))}
                      />
                      <span className="w-5 tabular-nums text-muted-foreground">{k + 1}</span>
                      <span className="min-w-0 flex-1">
                        <StapTitel s={s} />
                        {s.forced && <Chip eigen>zelf gekozen</Chip>}
                      </span>
                      <Badge h={s.h ?? "gemiddeld"} titel={s.hr} />
                      <span className="w-20 text-right tabular-nums">
                        +{fmt(s.g)}
                        <span className="block text-xs text-muted-foreground">punten</span>
                      </span>
                      <span className="w-24 text-right tabular-nums">
                        {eur(s.c)}
                        <span className="block text-xs text-muted-foreground">tot {s.tot}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Vink uit wat je niet wilt toepassen; de cijfers bovenaan rekenen direct mee. De
                kosten zijn ramingen, geen offertes. De telling moet de werkelijke toestand
                weergeven en een renovatie kan ook de WOZ-waarde verhogen; dat is niet meegerekend.
              </p>
            </>
          )}
        </TabsContent>

        <TabsContent value="opties" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            De opties van het adviesrapport: middenhuur optimaal, een kleine en een ruime marge in
            de vrije sector. Elke optie bouwt voort op de vorige.
          </p>
          {opties.length ? (
            <ul className="grid gap-3 lg:grid-cols-3" aria-label="Adviesopties">
              {opties.map((o) => (
                <li
                  key={o.soort}
                  className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  <div className="font-semibold">{o.titel}</div>
                  <p>{o.doelzin}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-semibold tabular-nums">
                        {o.route.eind.totaal}
                      </div>
                      <div className="text-xs text-muted-foreground">punten</div>
                    </div>
                    <div>
                      <div className="font-semibold tabular-nums">
                        {o.route.eind.maxHuur != null ? eur(o.route.eind.maxHuur) : "vrij"}
                      </div>
                      <div className="text-xs text-muted-foreground">max. huur</div>
                    </div>
                    <div>
                      <div className="font-semibold tabular-nums">{eur(o.route.kosten)}</div>
                      <div className="text-xs text-muted-foreground">kosten</div>
                    </div>
                  </div>
                  <ul className="space-y-1 border-t border-border pt-2 text-xs">
                    {o.route.stappen.map((st, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="min-w-0 flex-1">{st.o}</span>
                        <span className="tabular-nums text-muted-foreground">+{fmt(st.g)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <Melding ok>
              De woning heeft al {A.start.totaal} punten en zit ruim in de vrije sector; er zijn
              geen opties nodig.
            </Melding>
          )}
        </TabsContent>

        <TabsContent value="alle" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Vink aan wat je in elk geval in de route wilt, ook als het niet de goedkoopste punten
            zijn. Het advies vult de route daarna aan tot het doel. Bij het energielabel kies je één
            sprong.
          </p>
          {(["eenvoudig", "gemiddeld", "lastig"] as const).map((hv) => {
            const lijst = A.los.filter((s) => s.h === hv);
            if (!lijst.length) return null;
            return (
              <div key={hv}>
                <div className="mb-1 flex items-center gap-2">
                  <Badge h={hv} />
                  <span className="text-xs text-muted-foreground">
                    {lijst.length} maatregel{lijst.length === 1 ? "" : "en"}
                  </span>
                </div>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {lijst.map((s) => {
                    const id = s.key + "|" + s.o;
                    return (
                      <li key={id}>
                        <label className="flex items-start gap-3 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            className={vinkCls + " mt-1"}
                            aria-label={"In route opnemen: " + s.o}
                            checked={forcedSet.has(id)}
                            onChange={(e) => {
                              let f = inst.forced;
                              if (e.target.checked) {
                                // bij het energielabel één sprong tegelijk
                                if (s.key === "label" || s.key === "indexKlasse")
                                  f = f.filter((z) => !z.startsWith(s.key + "|"));
                                f = [...f, id];
                              } else f = f.filter((z) => z !== id);
                              herbereken({ forced: f });
                            }}
                          />
                          <span className="min-w-0 flex-1">
                            <div className="font-medium">{s.o}</div>
                            <div className="text-xs text-muted-foreground">{s.hr}</div>
                          </span>
                          <span className="w-20 text-right tabular-nums">
                            +{fmt(s.nominal ?? s.g)}
                            <span className="block text-xs text-muted-foreground">punten</span>
                          </span>
                          <span className="w-28 text-right tabular-nums">
                            {eur(s.c)}
                            <span className="block text-xs text-muted-foreground">
                              {eur(s.ratio)} p/pt
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </TabsContent>

        {ea && (
          <TabsContent value="energie">
            <EnergieAdviesKeuze
              input={input}
              normen={NORMEN}
              magBewerken={magToepassen && !!onEnergieAdvies}
              bewerker={bewerker}
              onZet={(a) => {
                setSkip({});
                onEnergieAdvies?.(a);
              }}
            />
          </TabsContent>
        )}

        <TabsContent value="inst" className="space-y-4">
          {meta && onEnergieAdvies ? (
            <EnergieAdviesBlok
              advies={input.energieAdvies}
              meta={meta}
              magBewerken={magToepassen}
              onZet={(a) => {
                // zoals de bron: na een nieuw of verwijderd advies opnieuw rekenen, alles aangevinkt
                setSkip({});
                onEnergieAdvies(a);
              }}
            />
          ) : (
            input.energieAdvies && <GeuploadAdvies ea={input.energieAdvies} />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={vinkCls}
              checked={inst.lastig}
              onChange={(e) => herbereken({ lastig: e.target.checked })}
            />
            Lastig haalbare maatregelen automatisch meenemen (extra toiletruimte, balkon, bad erbij,
            grote labelsprongen)
          </label>
          <div>
            <h3 className="text-sm font-semibold">Maatregelen en kostenramingen</h3>
            <p className="text-xs text-muted-foreground">
              Vink uit wat bouwkundig niet kan of niet gewenst is en vul je eigen kosten in.
            </p>
            <div className="mt-2 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Meenemen</th>
                    <th className="px-3 py-2 font-medium">Maatregel</th>
                    <th className="px-3 py-2 font-medium">Haalbaarheid</th>
                    <th className="px-3 py-2 font-medium">Kosten (€)</th>
                  </tr>
                </thead>
                <tbody>
                  {MAATREGELEN.filter((m) => m.key !== "indexKlasse").map((m) => (
                    <tr key={m.key} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className={vinkCls}
                          aria-label={"Meenemen: " + m.naam}
                          checked={!conceptUit[m.key]}
                          onChange={(e) =>
                            setConceptUit((u) => ({ ...u, [m.key]: !e.target.checked }))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        {m.naam}
                        <div className="text-xs text-muted-foreground">{m.hr}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge h={m.h} titel={m.hr} />
                      </td>
                      <td className="px-3 py-2">
                        <KostenVeld
                          label={"Kosten: " + m.naam}
                          waarde={conceptKosten[m.kost]}
                          zet={(v) => setConceptKosten((k) => ({ ...k, [m.kost]: v }))}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className={vinkCls}
                        aria-label="Meenemen: Energielabel afmelden"
                        checked={!conceptUit.afmelden}
                        onChange={(e) =>
                          setConceptUit((u) => ({ ...u, afmelden: !e.target.checked }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      Energielabel afmelden (zonder werkzaamheden)
                      <div className="text-xs text-muted-foreground">
                        Alleen met een bevestigd label uit het energieadvies dat punten oplevert
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge h="eenvoudig" />
                    </td>
                    <td className="px-3 py-2">
                      <KostenVeld
                        label="Kosten: Energielabel afmelden"
                        waarde={conceptKosten.afmelden}
                        zet={(v) => setConceptKosten((k) => ({ ...k, afmelden: v }))}
                      />
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td />
                    <td className="px-3 py-2">Oppervlakte nieuw balkon (m²)</td>
                    <td />
                    <td className="px-3 py-2">
                      <KostenVeld
                        label="Oppervlakte nieuw balkon"
                        waarde={conceptKosten.balkonM2}
                        zet={(v) => setConceptKosten((k) => ({ ...k, balkonM2: v }))}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => herbereken()}>Opnieuw berekenen</Button>
            {isAdmin && (
              <Button
                variant="outline"
                disabled={kostenOpslaan.isPending}
                onClick={() => kostenOpslaan.mutate()}
              >
                Kosten als standaard opslaan
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {(magToepassen || meta) && (
        <DialogFooter className="flex-wrap gap-2">
          {meta && (
            <>
              <Button
                variant="outline"
                disabled={!!download.bezig}
                onClick={() =>
                  download.pdf("route", async (lib) =>
                    maakRoutePdf(lib, {
                      meta,
                      input,
                      normen: NORMEN,
                      advies: A,
                      overslaan: skip,
                      plattegrond: (await plattegrond?.()) ?? null,
                    }),
                  )
                }
              >
                {download.bezig === "route" ? "PDF maken…" : "Route als PDF"}
              </Button>
              <Button
                variant="outline"
                disabled={!!download.bezig}
                onClick={() =>
                  download.pdf("advies", async (lib) =>
                    maakAdviesPdf(lib, {
                      meta,
                      input,
                      normen: NORMEN,
                      inst,
                      plattegrond: (await plattegrond?.()) ?? null,
                      rapportPlattegronden: (await rapportPlattegronden?.()) ?? [],
                    }),
                  )
                }
              >
                {download.bezig === "advies" ? "PDF maken…" : "Huidig + adviesopties als PDF"}
              </Button>
            </>
          )}
          {magToepassen && (
            <Button
              disabled={!S.n || toepassenBezig}
              onClick={() => {
                setToepassenBezig(true);
                void Promise.resolve(onToepassen(S.input, S.n, S.R.totaal)).finally(() =>
                  setToepassenBezig(false),
                );
              }}
            >
              {toepassenBezig
                ? "Uitgangssituatie bewaren…"
                : S.n
                  ? `Toepassen op telling (${S.n})`
                  : "Toepassen op telling"}
            </Button>
          )}
        </DialogFooter>
      )}
    </div>
  );
}

function kostenTekst(k: Kosten): Record<KostenKey, string> {
  return Object.fromEntries(Object.entries(k).map(([key, v]) => [key, String(v)])) as Record<
    KostenKey,
    string
  >;
}

function Kpi({
  titel,
  waarde,
  sub,
  kleur = "",
  klein = false,
}: {
  titel: string;
  waarde: number | string;
  sub: string;
  kleur?: string;
  klein?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{titel}</div>
      <div className={`${klein ? "text-lg" : "text-2xl"} font-semibold tabular-nums ${kleur}`}>
        {waarde}
      </div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function KostenVeld({
  label,
  waarde,
  zet,
}: {
  label: string;
  waarde: string;
  zet: (v: string) => void;
}) {
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      className="h-8 w-28 tabular-nums"
      value={waarde}
      onChange={(e) => zet(e.target.value)}
    />
  );
}

function Melding({ ok = false, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        ok ? "border-emerald-600/40 bg-emerald-600/10" : "border-border bg-muted"
      }`}
    >
      {children}
    </div>
  );
}

/** De drie situaties als het doel niet wordt gehaald (zie renderAdvies() in wws-site.html) */
function NietGehaald({ eind, max, doel }: { eind: number; max: number; doel: number }) {
  const grens = useNormen().grensMidden + 1;
  if (eind >= grens)
    return (
      <Melding ok>
        Met de beschikbare maatregelen komt de woning op <b>{eind} punten</b> — dat is al genoeg
        voor de vrije sector (vanaf {grens} punten), al wordt het ingestelde doel van {doel} punten
        (incl. marge) niet gehaald.
      </Melding>
    );
  if (max >= grens)
    return (
      <Melding ok>
        Met de nu geselecteerde maatregelen komt de woning op <b>{eind} punten</b>, nog niet genoeg
        voor de vrije sector. De vrije sector is wel haalbaar: met ook de lastiger maatregelen
        meegerekend komt de woning tot <b>{max} punten</b>. Zet bij Instellingen ‘lastig haalbare
        maatregelen’ aan, of kies ze zelf bij Alle maatregelen, om daar te komen.
      </Melding>
    );
  return (
    <Melding>
      Met de beschikbare maatregelen komt de woning maximaal op <b>{max} punten</b> (ook met
      lastiger maatregelen meegerekend). Dat is nog niet genoeg voor de vrije sector (minimaal{" "}
      {grens} punten). Kijk ook naar het woonoppervlak of de WOZ-waarde na renovatie.
    </Melding>
  );
}

function GeuploadAdvies({ ea }: { ea: NonNullable<WwsInput["energieAdvies"]> }) {
  const mr = ea.maatregelen || [];
  return (
    <Melding ok>
      <b>Geüpload verduurzamingsadvies: {ea.bestand || "advies"}</b>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {ea.geuploadOp &&
          "Verwerkt op " +
            new Date(ea.geuploadOp).toLocaleString("nl-NL", {
              dateStyle: "long",
              timeStyle: "short",
            }) +
            ". "}
        De route gebruikt deze maatregelen voor het energielabel in plaats van de algemene
        kostenraming.
      </div>
      <table className="mt-2 w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-2 font-medium">Van</th>
            <th className="py-1 pr-2 font-medium">Naar</th>
            <th className="py-1 pr-2 font-medium">Omschrijving</th>
            <th className="py-1 pr-2 font-medium">Kosten</th>
            <th className="py-1 font-medium">Besparing/jaar</th>
          </tr>
        </thead>
        <tbody>
          {mr.map((m, i) => (
            <tr key={i} className="border-t border-border align-top">
              <td className="py-1 pr-2">{m.vanLabel}</td>
              <td className="py-1 pr-2">{m.naarLabel}</td>
              <td className="py-1 pr-2">{(m.omschrijving || []).join(", ")}</td>
              <td className="py-1 pr-2 tabular-nums">
                {eur(num(m.kostenMin))}
                {num(m.kostenMax) > num(m.kostenMin) && <> – {eur(num(m.kostenMax))}</>}
              </td>
              <td className="py-1 tabular-nums">
                {eur(num(m.besparingMin))}
                {num(m.besparingMax) > num(m.besparingMin) && <> – {eur(num(m.besparingMax))}</>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Melding>
  );
}
