import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eur, LABELS, SEGMENT_NAMEN } from "@/lib/wws";
import {
  berekenMarkthuur,
  huurAdvies,
  huurNormen,
  HUUR_WONINGTYPEN,
  isInschatting,
  NIVEAU_NAMEN,
  standaardAntwoorden,
  WONINGTYPE_NAMEN,
  wwsCheck,
  type HuurAntwoorden,
  type HuurWoning,
  type Markthuur,
} from "@/lib/wws/huur";
import { zoekWoningVoorHuur } from "@/lib/wws/huur/huur.functions";
import { huurFoutMelding, type HuurOpzoeking } from "@/lib/wws/huur/opzoeken";
import { startTelling } from "@/lib/wws/huur/telling";
import { maakTellingDoc, type Bewerker } from "@/lib/wws/opslag";
import { useNormen } from "./NormenContext";
import { tellingStore } from "./tellingStore";

const selectCls =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export const DISCLAIMER =
  "Dit is een indicatie, geen taxatie. De bedragen zijn kale huur per maand en gebaseerd op gemiddelde huurprijzen per regio en vaste correctiefactoren. De wettelijke maximale huur volgt pas zeker uit een volledige puntentelling.";

/** De vragen met waarom ze invloed hebben */
const WAAROM = {
  woningtype:
    "Appartementen hebben gemiddeld een hogere prijs per m² dan woonhuizen (landelijk € 20,72 tegen € 15,10; NVM/VGM NL Q2 2026).",
  oppervlakte:
    "De oppervlakte bepaalt het grootste deel van de huur. De BAG kan afwijken, bijvoorbeeld door een zolder of uitbouw.",
  slaapkamers: "Telt mee in de WWS-check (aantal vertrekken) en voor de verhuurbaarheid.",
  afwerking: "Dezelfde woning kan zo’n 10% verschillen in huur door afwerking en onderhoud.",
  keukenBad:
    "Het meest zichtbaar bij een bezichtiging; de voorzieningen tellen ook mee in de WWS-punten.",
  buiten:
    "Een eigen buitenruimte verhoogt de huur. In het WWS kost geen buitenruimte 5 punten; een buitenruimte geeft punten per m².",
  parkeren:
    "Een eigen plek of garage komt als vast bedrag per maand bij de huur. Een garage telt ook mee in het WWS.",
  oplevering:
    "Kaal opgeleverd is lager. Bij gemeubileerd hoort de vergoeding voor meubels wettelijk bij de servicekosten, niet bij de kale huur.",
  lift: "Een appartement vanaf de 3e verdieping zonder lift is minder gewild.",
  woz: "Alleen voor de WWS-check. De WOZ-waarde bepaalt vaak of een woning boven 186 punten komt (vrije sector).",
} as const;

function Vraag({
  nr,
  titel,
  waarom,
  children,
}: {
  nr: number;
  titel: string;
  waarom: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">
        <span className="mr-1.5 tabular-nums text-muted-foreground">{nr}.</span>
        {titel}
      </div>
      {children}
      <p className="text-xs text-muted-foreground">{waarom}</p>
    </div>
  );
}

function Keuze<T extends string>({
  label,
  waarde,
  opties,
  onChange,
}: {
  label: string;
  waarde: T;
  opties: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      className={selectCls}
      aria-label={label}
      value={waarde}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {opties.map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </select>
  );
}

const vandaag = () => new Date().toISOString().slice(0, 10);
const datumTekst = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const euroHeel = (x: number) =>
  "€ " + Math.round(x).toLocaleString("nl-NL", { maximumFractionDigits: 0 });
const effectTekst = (x: number) =>
  Math.abs(x) < 0.5 ? "± € 0" : (x > 0 ? "+ " : "− ") + euroHeel(Math.abs(x));

export interface HuurprijsIndicatorProps {
  magSchrijven: boolean;
  bewerker: Bewerker;
}

/** Huurprijsindicator: adres opzoeken, vragen, markthuur als bandbreedte en de WWS-check */
export default function HuurprijsIndicator({ magSchrijven, bewerker }: HuurprijsIndicatorProps) {
  const N = useNormen();
  const H = useMemo(() => huurNormen(N.huurindicator), [N]);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [adres, setAdres] = useState({
    postcode: "",
    huisnummer: "",
    huisletter: "",
    toevoeging: "",
  });
  const [woning, setWoning] = useState<HuurWoning | null>(null);
  const [meldingen, setMeldingen] = useState<string[]>([]);
  const [keuzes, setKeuzes] = useState<string[]>([]);
  const [a, setA] = useState<HuurAntwoorden | null>(null);

  const zoeken = useMutation({
    mutationFn: (v: typeof adres) => zoekWoningVoorHuur({ data: v }) as Promise<HuurOpzoeking>,
    onSuccess: (r) => {
      if (!r.ok) {
        setKeuzes(r.keuzes ?? []);
        toast.error(huurFoutMelding(r.fout));
        return;
      }
      setKeuzes([]);
      setWoning(r.woning);
      setMeldingen(r.meldingen);
      setA(standaardAntwoorden(r.woning));
    },
    onError: () => toast.error(huurFoutMelding("geen_verbinding")),
  });

  const telling = useMutation({
    mutationFn: async () => {
      if (!woning || !a) throw new Error("geen woning");
      const id = crypto.randomUUID();
      const s = startTelling(woning, a, H, N, bewerker.naam);
      await tellingStore.maakAan(id, maakTellingDoc(s, N, bewerker));
      return id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["tellingen"] });
      toast.success("Telling aangemaakt met de bekende gegevens. Meet de ruimten in.");
      void navigate({ to: "/wws", search: { id } });
    },
    onError: () => toast.error("De telling kon niet worden aangemaakt. Probeer het opnieuw."),
  });

  const zet = <K extends keyof HuurAntwoorden>(k: K, v: HuurAntwoorden[K]) =>
    setA((x) => (x ? { ...x, [k]: v } : x));

  const uitkomst = useMemo(() => {
    if (!woning || !a) return null;
    const m = berekenMarkthuur(woning, a, H, vandaag());
    const c = wwsCheck(woning, a, H, N);
    return { m, c, advies: huurAdvies(m.verwacht, c, N) };
  }, [woning, a, H, N]);

  const app = a && (a.woningtype === "appartement" || a.woningtype === "studio");

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Huurprijsindicator</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Een indicatieve markthuur (laag – verwacht – hoog) voor één adres, met een check op de
          wettelijke maximale huur volgens het WWS. Geen taxatie.
        </p>
      </header>

      {!magSchrijven ? (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm" role="note">
          Met de kijkrol kun je opgeslagen indicaties bekijken, maar geen nieuwe maken.
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            zoeken.mutate(adres);
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Postcode</span>
            <Input
              className="w-32"
              placeholder="1234 AB"
              value={adres.postcode}
              onChange={(e) => setAdres({ ...adres, postcode: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Huisnummer</span>
            <Input
              className="w-24"
              inputMode="numeric"
              value={adres.huisnummer}
              onChange={(e) =>
                setAdres({ ...adres, huisnummer: e.target.value.replace(/\D/g, "") })
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Letter</span>
            <Input
              className="w-16"
              maxLength={1}
              value={adres.huisletter}
              onChange={(e) => setAdres({ ...adres, huisletter: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Toevoeging</span>
            <Input
              className="w-24"
              maxLength={10}
              value={adres.toevoeging}
              onChange={(e) => setAdres({ ...adres, toevoeging: e.target.value })}
            />
          </label>
          <Button type="submit" disabled={zoeken.isPending}>
            {zoeken.isPending ? "Opzoeken…" : "Opzoeken"}
          </Button>
          {keuzes.length > 0 && (
            <div className="w-full text-sm" role="group" aria-label="Kies de woning">
              <span className="mr-2 text-muted-foreground">Kies:</span>
              {keuzes.map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mr-1 mb-1"
                  onClick={() => {
                    const [l, ...t] = k.split(" ");
                    const letter = /^[A-Za-z]$/.test(l!) ? l! : "";
                    const v = {
                      ...adres,
                      huisletter: letter,
                      toevoeging: letter ? t.join(" ") : k,
                    };
                    setAdres(v);
                    zoeken.mutate(v);
                  }}
                >
                  {adres.huisnummer} {k}
                </Button>
              ))}
            </div>
          )}
        </form>
      )}

      {woning && a && uitkomst && (
        <>
          <section
            aria-label="Woning"
            className="rounded-xl border-2 border-ruimte-rand bg-card p-4 text-sm"
          >
            <div className="font-medium">
              {woning.straat} {woning.huisnummer}, {woning.postcode.replace(/^(\d{4})/, "$1 ")}{" "}
              {woning.plaats}
            </div>
            <div className="text-muted-foreground">
              Gemeente {woning.gemeente || "onbekend"} · {woning.provincie || "provincie onbekend"}
            </div>
            <div className="mt-1 text-muted-foreground">
              BAG: {woning.bagOppervlakte ? woning.bagOppervlakte + " m²" : "geen oppervlakte"} ·
              bouwjaar {woning.bouwjaar ?? "onbekend"} ·{" "}
              {woning.gebruiksdoel ?? "gebruiksdoel onbekend"}
              {" · "}EP-Online:{" "}
              {woning.label
                ? `label ${woning.label}${woning.labelDatum ? " (" + datumTekst(woning.labelDatum) + ")" : ""}${woning.gebouwtype ? ", " + woning.gebouwtype.toLowerCase() : ""}`
                : "geen label"}
            </div>
            {meldingen.map((m) => (
              <p key={m} className="mt-1 text-xs text-amber-700 dark:text-amber-300" role="note">
                {m}
              </p>
            ))}
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section
              aria-label="Vragen"
              className="space-y-4 rounded-xl border border-border bg-card p-4"
            >
              <h2 className="font-semibold">Vragen</h2>
              <Vraag nr={1} titel="Woningtype" waarom={WAAROM.woningtype}>
                <Keuze
                  label="Woningtype"
                  waarde={a.woningtype}
                  opties={HUUR_WONINGTYPEN.map((t) => [t, WONINGTYPE_NAMEN[t]] as const)}
                  onChange={(v) => zet("woningtype", v)}
                />
              </Vraag>
              <Vraag nr={2} titel="Gebruiksoppervlakte (m²)" waarom={WAAROM.oppervlakte}>
                <Input
                  aria-label="Gebruiksoppervlakte"
                  type="number"
                  min={10}
                  max={1000}
                  value={a.oppervlakte || ""}
                  onChange={(e) => zet("oppervlakte", Number(e.target.value))}
                />
                {woning.bagOppervlakte != null && a.oppervlakte !== woning.bagOppervlakte && (
                  <p className="text-xs">BAG: {woning.bagOppervlakte} m²</p>
                )}
              </Vraag>
              <Vraag nr={3} titel="Aantal slaapkamers" waarom={WAAROM.slaapkamers}>
                <Input
                  aria-label="Aantal slaapkamers"
                  type="number"
                  min={0}
                  max={10}
                  value={a.slaapkamers}
                  onChange={(e) => zet("slaapkamers", Number(e.target.value))}
                />
              </Vraag>
              <Vraag nr={4} titel="Afwerking en onderhoud" waarom={WAAROM.afwerking}>
                <div className="grid grid-cols-2 gap-2">
                  <Keuze
                    label="Afwerkingsniveau"
                    waarde={a.afwerking}
                    opties={[
                      ["basis", "Afwerking basis"],
                      ["goed", "Afwerking goed"],
                      ["luxe", "Afwerking luxe"],
                    ]}
                    onChange={(v) => zet("afwerking", v)}
                  />
                  <Keuze
                    label="Staat van onderhoud"
                    waarde={a.onderhoud}
                    opties={[
                      ["goed", "Onderhoud goed"],
                      ["matig", "Onderhoud matig"],
                    ]}
                    onChange={(v) => zet("onderhoud", v)}
                  />
                </div>
              </Vraag>
              <Vraag nr={5} titel="Keuken en badkamer" waarom={WAAROM.keukenBad}>
                <div className="grid grid-cols-2 gap-2">
                  {(["keuken", "badkamer"] as const).map((k) => (
                    <Keuze
                      key={k}
                      label={k === "keuken" ? "Keuken" : "Badkamer"}
                      waarde={a[k]}
                      opties={(["gedateerd", "modern", "nieuw"] as const).map(
                        (s) => [s, (k === "keuken" ? "Keuken " : "Badkamer ") + s] as const,
                      )}
                      onChange={(v) => zet(k, v)}
                    />
                  ))}
                </div>
              </Vraag>
              <Vraag nr={6} titel="Buitenruimte" waarom={WAAROM.buiten}>
                <div className="grid grid-cols-2 gap-2">
                  <Keuze
                    label="Buitenruimte"
                    waarde={a.buiten}
                    opties={[
                      ["geen", "Geen"],
                      ["balkon", "Balkon"],
                      ["tuin", "Tuin"],
                      ["dakterras", "Dakterras"],
                    ]}
                    onChange={(v) => zet("buiten", v)}
                  />
                  {a.buiten !== "geen" && (
                    <Input
                      aria-label="Oppervlakte buitenruimte (m²)"
                      type="number"
                      min={0}
                      placeholder="m²"
                      value={a.buitenM2 || ""}
                      onChange={(e) => zet("buitenM2", Number(e.target.value))}
                    />
                  )}
                </div>
              </Vraag>
              <Vraag nr={7} titel="Parkeren" waarom={WAAROM.parkeren}>
                <Keuze
                  label="Parkeren"
                  waarde={a.parkeren}
                  opties={[
                    ["geen", "Geen"],
                    ["plek", "Eigen parkeerplek"],
                    ["garage", "Garage"],
                  ]}
                  onChange={(v) => zet("parkeren", v)}
                />
              </Vraag>
              <Vraag nr={8} titel="Oplevering" waarom={WAAROM.oplevering}>
                <Keuze
                  label="Oplevering"
                  waarde={a.oplevering}
                  opties={[
                    ["kaal", "Kaal"],
                    ["gestoffeerd", "Gestoffeerd"],
                    ["gemeubileerd", "Gemeubileerd"],
                  ]}
                  onChange={(v) => zet("oplevering", v)}
                />
              </Vraag>
              {app && (
                <Vraag nr={9} titel="Verdieping en lift" waarom={WAAROM.lift}>
                  <div className="grid grid-cols-2 items-center gap-2">
                    <Input
                      aria-label="Verdieping"
                      type="number"
                      min={0}
                      max={60}
                      value={a.verdieping}
                      onChange={(e) => zet("verdieping", Number(e.target.value))}
                    />
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={a.lift}
                        onChange={(e) => zet("lift", e.target.checked)}
                      />
                      Lift aanwezig
                    </label>
                  </div>
                </Vraag>
              )}
              <Vraag nr={app ? 10 : 9} titel="WOZ-waarde (optioneel)" waarom={WAAROM.woz}>
                <Input
                  aria-label="WOZ-waarde"
                  type="number"
                  min={0}
                  placeholder="onbekend"
                  value={a.woz ?? ""}
                  onChange={(e) => zet("woz", e.target.value ? Number(e.target.value) : null)}
                />
              </Vraag>
              <div className="space-y-1.5 border-t border-border pt-3">
                <div className="text-sm font-medium">Energielabel</div>
                <Keuze
                  label="Energielabel"
                  waarde={a.label}
                  opties={[["", "Onbekend"], ...LABELS.map((l) => [l, "Label " + l] as const)]}
                  onChange={(v) => zet("label", v)}
                />
                <p className="text-xs text-muted-foreground">
                  {woning.label
                    ? "Uit EP-Online; pas aan als dat niet klopt."
                    : "Niet gevonden in EP-Online."}
                </p>
              </div>
            </section>

            <div className="space-y-4">
              <MarkthuurKaart m={uitkomst.m} />
              <WwsKaart
                c={uitkomst.c}
                advies={uitkomst.advies}
                grens={N.grensMidden + 1}
                kanTellen={magSchrijven}
                bezig={telling.isPending}
                onTelling={() => telling.mutate()}
              />
            </div>
          </div>

          <FactorTabel m={uitkomst.m} />
          <Bronnen m={uitkomst.m} />
          <p className="text-xs text-muted-foreground" role="note">
            {DISCLAIMER}
          </p>
        </>
      )}
    </main>
  );
}

const KLEUR_BETROUWBAARHEID = {
  hoog: "bg-seg-hoog text-seg-foreground",
  middel: "bg-orange text-orange-foreground",
  laag: "bg-seg-laag text-seg-foreground",
} as const;

export function MarkthuurKaart({ m }: { m: Markthuur }) {
  return (
    <section
      aria-label="Indicatie markthuur"
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="font-semibold">Indicatie markthuur (kale huur per maand)</h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["Laag", m.laag],
            ["Verwacht", m.verwacht],
            ["Hoog", m.hoog],
          ] as const
        ).map(([l, v]) => (
          <div
            key={l}
            className={
              "rounded-lg border p-2 " +
              (l === "Verwacht" ? "border-primary bg-primary/5" : "border-border")
            }
          >
            <div className="text-xs text-muted-foreground">{l}</div>
            <div
              className={"tabular-nums " + (l === "Verwacht" ? "text-xl font-semibold" : "text-lg")}
            >
              {euroHeel(v)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="tabular-nums">{eur(m.prijsM2)} per m²</span>
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs font-medium " +
            KLEUR_BETROUWBAARHEID[m.betrouwbaarheid.niveau]
          }
        >
          Betrouwbaarheid: {m.betrouwbaarheid.niveau}
        </span>
      </div>
      <ul className="list-disc pl-5 text-xs text-muted-foreground">
        {m.betrouwbaarheid.redenen.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {m.meubelNotitie && (
        <p
          className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs"
          role="note"
        >
          {m.meubelNotitie}
        </p>
      )}
    </section>
  );
}

export function WwsKaart({
  c,
  advies,
  grens,
  kanTellen,
  bezig,
  onTelling,
}: {
  c: ReturnType<typeof wwsCheck>;
  advies: ReturnType<typeof huurAdvies>;
  grens: number;
  kanTellen: boolean;
  bezig: boolean;
  onTelling: () => void;
}) {
  const vrij = c.segLaag === "hoog";
  return (
    <section
      aria-label="WWS-check"
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="font-semibold">WWS-check (globaal)</h2>
      <p className="text-sm">
        Naar verwachting{" "}
        <b className="tabular-nums">
          {c.puntenLaag}–{c.puntenHoog} punten
        </b>
        :{" "}
        {c.grensgeval
          ? `${SEGMENT_NAMEN[c.segLaag]} of ${SEGMENT_NAMEN[c.segHoog].toLowerCase()}`
          : SEGMENT_NAMEN[c.segLaag]}
        .
        {!vrij && (
          <>
            {" "}
            Wettelijke maximale huur{" "}
            <span className="tabular-nums">
              {euroHeel(Math.floor(c.maxHuurLaag))}–{euroHeel(Math.floor(c.maxHuurHoog))}
            </span>
            .
          </>
        )}
      </p>
      {c.grensgeval ? (
        <p
          className="rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm font-medium"
          role="alert"
        >
          Grensgeval: volledige telling nodig.
        </p>
      ) : (
        !vrij && (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm" role="note">
            Onder {grens} punten geldt de wettelijke maximale huur.
          </p>
        )
      )}
      {c.wozVrijeSector && (
        <p className="text-xs text-muted-foreground">
          Zonder WOZ-waarde gerekend met de minimum-WOZ.{" "}
          {c.wozVrijeSector.laag != null
            ? `Vanaf een WOZ-waarde van ca. ${euroHeel(c.wozVrijeSector.laag)}${c.wozVrijeSector.hoog != null && c.wozVrijeSector.hoog !== c.wozVrijeSector.laag ? "–" + euroHeel(c.wozVrijeSector.hoog) : ""} komt de woning naar verwachting op ${grens} punten of meer.`
            : `Ook met een hoge WOZ-waarde komt de woning naar verwachting niet op ${grens} punten.`}
        </p>
      )}
      <div className="rounded-lg border-2 border-primary bg-primary/5 p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-primary">
          Advies huurprijs
        </div>
        <div className="text-2xl font-semibold tabular-nums">{euroHeel(advies.bedrag)}</div>
        <div className="text-xs font-medium">
          Laagste van markthuur en wettelijke maximale huur:{" "}
          {advies.grond === "markthuur" ? "de markthuur" : "de wettelijke maximale huur"}.
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{advies.reden}</p>
      </div>
      {kanTellen && (
        <Button variant={c.grensgeval ? "default" : "outline"} disabled={bezig} onClick={onTelling}>
          {bezig ? "Telling maken…" : "Maak een volledige puntentelling"}
        </Button>
      )}
    </section>
  );
}

export function FactorTabel({ m }: { m: Markthuur }) {
  return (
    <section
      aria-label="Invloed per factor"
      className="rounded-xl border border-border bg-card p-4"
    >
      <h2 className="mb-2 font-semibold">Invloed per factor</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">Factor</th>
              <th className="py-1 pr-3 font-medium">Keuze</th>
              <th className="py-1 pr-3 text-right font-medium">Factor</th>
              <th className="py-1 pr-3 text-right font-medium">Effect per maand</th>
              <th className="py-1 font-medium">Herkomst</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="py-1 pr-3">Basis: prijs per m² × oppervlakte</td>
              <td className="py-1 pr-3">{eur(m.bronPrijsM2)} per m²</td>
              <td />
              <td className="py-1 pr-3 text-right tabular-nums">{euroHeel(m.basis)}</td>
              <td className="py-1 text-xs text-muted-foreground">zie bronnen</td>
            </tr>
            {m.factoren.map((f) => (
              <tr key={f.sleutel} className="border-t border-border">
                <td className="py-1 pr-3">{f.naam}</td>
                <td className="py-1 pr-3">{f.keuze}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {f.factor == null
                    ? "vast"
                    : f.factor.toLocaleString("nl-NL", { maximumFractionDigits: 3 })}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{effectTekst(f.effect)}</td>
                <td className="py-1 text-xs">
                  {isInschatting(f.bron) ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800 dark:text-amber-300">
                      GoHome-inschatting
                    </span>
                  ) : (
                    f.bron
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border font-medium">
              <td className="py-1 pr-3">Verwacht</td>
              <td />
              <td />
              <td className="py-1 pr-3 text-right tabular-nums">{euroHeel(m.verwacht)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        De factoren worden in deze volgorde toegepast; de effecten tellen op tot het verwachte
        bedrag (afgerond op € 5). “GoHome-inschatting”: een startwaarde, nog niet geijkt met gemeten
        huren.
      </p>
    </section>
  );
}

export function Bronnen({ m }: { m: Markthuur }) {
  const r = m.regel;
  return (
    <section aria-label="Bronnen" className="rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="mb-1 font-semibold">Bronnen</h2>
      {r ? (
        <p>
          Prijs per m² ({NIVEAU_NAMEN[r.niveau]} {r.naam ?? r.regio},{" "}
          {r.woningsoort === "alle" ? "alle woningtypen" : r.woningsoort + "en"}): {eur(r.prijsM2)}.
          Bron: {r.bron}, peildatum {datumTekst(r.peildatum)}
          {r.url && (
            <>
              {" "}
              (
              <a className="text-primary underline" href={r.url} target="_blank" rel="noreferrer">
                rapport
              </a>
              )
            </>
          )}
          .{r.opmerking ? " " + r.opmerking : ""}
        </p>
      ) : (
        <p>Geen bronregel voor deze regio.</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Woninggegevens: PDOK Locatieserver en BAG (Kadaster), energielabel: EP-Online (RVO).
        Maximale huur: woningwaarderingsstelsel en huurprijstabel uit de normen van deze app.
      </p>
    </section>
  );
}
