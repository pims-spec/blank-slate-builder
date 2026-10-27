import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WwsInput } from "@/lib/wws";
import { beoordeelFotos, sorteerFotos } from "@/lib/wws/ai/ai.functions";
import { aiMelding, gebruikTekst } from "@/lib/wws/ai/meldingen";
import type { Gebruik } from "@/lib/wws/ai/vragen";
import type { Beoordeling, ElementOordeel } from "@/lib/wws/foto/beoordeling";
import { fotoKlaarmaken, SORTEER_MAX_ZIJDE, type KlareFoto } from "@/lib/wws/foto/beeld";
import { ELEMENTEN, type FotoRuimte } from "@/lib/wws/foto/elementen";
import {
  beginIndeling,
  doelOpties,
  GEEN,
  groepeer,
  KIEZEN,
  pasWoningToe,
  type Doel,
  type Groep,
} from "@/lib/wws/foto/indeling";
import { MAX_WONING_FOTOS, type FotoSortering } from "@/lib/wws/foto/sorteren";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: WwsInput;
  /** De telling met de ingevulde ruimtes */
  onToepassen: (input: WwsInput) => void;
}

const STATUS: Record<ElementOordeel["status"], string> = {
  aanwezig: "Aanwezig",
  waarschijnlijk_aanwezig: "Waarschijnlijk",
  niet_vast_te_stellen: "Niet vast te stellen",
};
const SOORT_NAAM: Record<FotoSortering["soort"], string> = {
  keuken: "Keuken",
  badkamer: "Badkamer",
  toilet: "Toilet",
  anders: "Andere ruimte",
  plattegrond: "Plattegrond",
};
/** Hoogstens zoveel ruimtes tegelijk bij Gemini */
const TEGELIJK = 3;

interface Gekozen {
  url: string;
  bestand: File;
}
type Fase = "kiezen" | "indelen" | "klaar";
interface RuimteUitslag {
  groep: Groep;
  b?: Beoordeling;
  /** Naam in de telling na het invullen (bij een nieuwe ruimte: "Toiletruimte (nieuw)") */
  naam?: string;
  onzeker?: number;
  fout?: string;
}

/**
 * Foto's van de hele woning laten beoordelen: Gemini sorteert ze per ruimte, de gebruiker kijkt
 * de indeling na, daarna wordt elke keuken, badkamer en toiletruimte beoordeeld en direct in de
 * telling ingevuld.
 */
export default function FotoDialoog(p: Props) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Foto's beoordelen</DialogTitle>
          <DialogDescription>
            Lever foto's van de keuken, badkamer en toiletruimte in één keer aan. Gemini sorteert ze
            per ruimte en vult daarna de voorzieningen in de telling in. Waar het niet zeker is,
            komt een uitroepteken (!). Wat al is ingevuld, wordt nooit gewist of verlaagd.
          </DialogDescription>
        </DialogHeader>
        {p.open && <FotosBeoordelen {...p} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Het beoordelen zelf. Ook gebruikt door "Map inlezen" (MapDialoog): dan zijn de foto's al gekozen
 * en gesorteerd (beginFotos en beginSortering) en begint het bij het nakijken van de indeling.
 */
export function FotosBeoordelen({
  input,
  onToepassen,
  beginFotos,
  beginSortering,
}: Omit<Props, "open" | "onOpenChange"> & {
  beginFotos?: readonly File[];
  beginSortering?: readonly FotoSortering[];
}) {
  const urls = useRef<string[]>([]);
  const [fotos, setFotos] = useState<Gekozen[]>(() =>
    (beginFotos ?? []).map((bestand) => {
      const url = URL.createObjectURL(bestand);
      urls.current.push(url);
      return { url, bestand };
    }),
  );
  const gesorteerd = !!beginSortering && beginSortering.length === (beginFotos?.length ?? 0);
  const [fase, setFase] = useState<Fase>(gesorteerd ? "indelen" : "kiezen");
  const [bezig, setBezig] = useState(false);
  const [status, setStatus] = useState(
    gesorteerd ? "Kijk de indeling na en kies waar nodig de ruimte. Daarna: Beoordelen." : "",
  );
  const [sortering, setSortering] = useState<FotoSortering[]>(
    gesorteerd ? [...beginSortering] : [],
  );
  const [doelen, setDoelen] = useState<Doel[]>(() =>
    gesorteerd ? beginIndeling(input, beginSortering) : [],
  );
  const [uitslag, setUitslag] = useState<RuimteUitslag[]>([]);
  const [gebruik, setGebruik] = useState<Gebruik | undefined>();
  const ctl = useRef<AbortController | null>(null);

  // object-URL's van de voorbeelden opruimen bij sluiten
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const opties = doelOpties(input);
  const { groepen, fout: indelingFout } = groepeer(input, doelen);

  function voegToe(lijst: FileList | null) {
    if (!lijst) return;
    const nieuw = [...lijst].filter((f) => f.type.startsWith("image/"));
    const plek = MAX_WONING_FOTOS - fotos.length;
    setStatus(
      nieuw.length > plek
        ? `Hoogstens ${MAX_WONING_FOTOS} foto's; de rest is niet toegevoegd.`
        : "",
    );
    const erbij = nieuw.slice(0, Math.max(0, plek)).map((bestand) => {
      const url = URL.createObjectURL(bestand);
      urls.current.push(url);
      return { url, bestand };
    });
    setFotos((f) => [...f, ...erbij]);
  }

  function verwijder(i: number) {
    setFotos((f) => {
      URL.revokeObjectURL(f[i]!.url);
      return f.filter((_, j) => j !== i);
    });
  }

  /** Voorbereiden (verkleinen); een foutmelding als dat niet lukt */
  async function klaarmaken(bestanden: File[], max?: number): Promise<KlareFoto[] | string> {
    try {
      return await Promise.all(bestanden.map((b) => fotoKlaarmaken(b, max)));
    } catch (e) {
      return e instanceof Error && e.message ? e.message : "Een foto kon niet worden gelezen.";
    }
  }

  async function sorteren() {
    if (!fotos.length) return setStatus("Kies eerst een of meer foto's.");
    setBezig(true);
    try {
      setStatus("Foto's verkleinen…");
      const klein = await klaarmaken(
        fotos.map((f) => f.bestand),
        SORTEER_MAX_ZIJDE,
      );
      if (typeof klein === "string") return setStatus(klein);
      setStatus("Gemini sorteert de foto's per ruimte…");
      ctl.current = new AbortController();
      let r;
      try {
        r = await sorteerFotos({ signal: ctl.current.signal, data: { fotos: klein } });
      } catch {
        return setStatus(
          ctl.current?.signal.aborted ? "Gestopt." : aiMelding("geen_verbinding", "foto"),
        );
      }
      setGebruik(r.gebruik);
      if (!r.ok) return setStatus(aiMelding(r.fout, "foto", r.gebruik));
      setSortering(r.data);
      setDoelen(beginIndeling(input, r.data));
      setFase("indelen");
      setStatus("Kijk de indeling na en kies waar nodig de ruimte. Daarna: Beoordelen.");
    } finally {
      setBezig(false);
    }
  }

  async function beoordelen() {
    if (indelingFout) return setStatus(indelingFout);
    setBezig(true);
    ctl.current = new AbortController();
    const signal = ctl.current.signal;
    try {
      setStatus(
        `Gemini beoordeelt ${groepen.length === 1 ? "1 ruimte" : groepen.length + " ruimtes"}… dit duurt meestal 15 tot 40 seconden.`,
      );
      const uit: RuimteUitslag[] = groepen.map((groep) => ({ groep }));
      let volgende = 0;
      const werker = async () => {
        while (volgende < groepen.length && !signal.aborted) {
          const j = volgende++;
          const groep = groepen[j]!;
          const klaar = await klaarmaken(groep.fotos.map((i) => fotos[i]!.bestand));
          if (typeof klaar === "string") {
            uit[j] = { groep, fout: klaar };
            continue;
          }
          try {
            const r = await beoordeelFotos({
              signal,
              data: { ruimte: groep.ruimte, fotos: klaar },
            });
            if (r.gebruik) setGebruik(r.gebruik);
            uit[j] = r.ok
              ? { groep, b: r.data }
              : { groep, fout: aiMelding(r.fout, "foto", r.gebruik) };
          } catch {
            uit[j] = {
              groep,
              fout: signal.aborted ? "Gestopt." : aiMelding("geen_verbinding", "foto"),
            };
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(TEGELIJK, groepen.length) }, werker));
      if (signal.aborted) {
        setStatus("Gestopt. Er is niets in de telling gezet.");
        return;
      }
      const goed = uit.filter((u) => u.b);
      if (goed.length) {
        const r = pasWoningToe(
          input,
          goed.map((u) => ({ doel: u.groep.doel, beoordeling: u.b! })),
        );
        onToepassen(r.input);
        for (const res of r.resultaten) {
          const u = uit.find((x) => x.groep.doel === res.doel);
          if (u) Object.assign(u, { onzeker: res.onzeker, naam: res.naam });
        }
      }
      setUitslag(uit);
      setFase("klaar");
      const fouten = uit.length - goed.length;
      setStatus(
        goed.length === 0
          ? "Er kon geen ruimte worden beoordeeld; er is niets in de telling gezet."
          : "Ingevuld in de telling. Controleer de velden met een uitroepteken (!)." +
              (fouten
                ? ` Bij ${fouten === 1 ? "1 ruimte" : fouten + " ruimtes"} ging het mis.`
                : ""),
      );
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4 text-sm">
      {fase === "kiezen" && (
        <>
          <p className="rounded-md bg-muted px-3 py-2">
            <b>Tip:</b> maak per ruimte een overzichtsfoto en losse foto's van de apparaten en het
            sanitair. Zet in de keuken ook de kast naast de spoelbak en de hoge kast op de foto, met
            de deur open: daar zitten vaak een inbouwvaatwasser, koelkast of vriezer achter.
          </p>
          <p className="text-xs text-muted-foreground">
            Zet geen personen, namen, post of andere persoonlijke gegevens op de foto's. De foto's
            worden in je browser verkleind en de locatie en andere gegevens worden eruit gehaald. Ze
            gaan alleen naar Gemini en worden niet bewaard, niet door de app en niet door Google.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <FotoInvoer
              label="Foto's kiezen"
              meer
              uit={bezig || fotos.length >= MAX_WONING_FOTOS}
              onKies={voegToe}
            />
            <FotoInvoer
              label="Foto maken"
              camera
              uit={bezig || fotos.length >= MAX_WONING_FOTOS}
              onKies={voegToe}
            />
            <span className="text-xs text-muted-foreground">
              {fotos.length} van {MAX_WONING_FOTOS} foto's
            </span>
          </div>
        </>
      )}

      {fotos.length > 0 && fase !== "klaar" && (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {fotos.map((f, i) => {
            const s = sortering[i];
            const d = doelen[i];
            return (
              <li key={f.url} className="min-w-0 space-y-1">
                <div className="relative">
                  <img
                    src={f.url}
                    alt={`Foto ${i + 1}`}
                    className="aspect-square w-full rounded-md border border-border object-cover"
                  />
                  <span className="absolute left-1 top-1 rounded bg-background/90 px-1 text-xs font-medium">
                    {i + 1}
                  </span>
                  {fase === "kiezen" && !bezig && (
                    <button
                      type="button"
                      aria-label={`Foto ${i + 1} weghalen`}
                      className="absolute right-1 top-1 rounded bg-background/90 px-1.5 text-xs hover:text-destructive"
                      onClick={() => verwijder(i)}
                    >
                      ✕
                    </button>
                  )}
                </div>
                {fase === "indelen" && s && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {SOORT_NAAM[s.soort]}: {s.reden}
                    </p>
                    <select
                      aria-label={`Ruimte voor foto ${i + 1}`}
                      aria-invalid={d === KIEZEN || undefined}
                      disabled={bezig}
                      className={
                        "w-full rounded-lg border bg-muted px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                        (d === KIEZEN ? "border-dashed border-destructive" : "border-transparent")
                      }
                      value={d}
                      onChange={(e) =>
                        setDoelen((ds) => ds.map((x, j) => (j === i ? e.target.value : x)))
                      }
                    >
                      {d === KIEZEN && (
                        <option value={KIEZEN} disabled>
                          Kies de ruimte…
                        </option>
                      )}
                      {opties.map((o) => (
                        <option key={o.doel} value={o.doel}>
                          {o.naam}
                        </option>
                      ))}
                      <option value={GEEN}>Niet gebruiken</option>
                    </select>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {fase === "kiezen" && (
          <Button onClick={sorteren} disabled={bezig || !fotos.length}>
            Foto's sorteren
          </Button>
        )}
        {fase === "indelen" && (
          <Button onClick={beoordelen} disabled={bezig || !!indelingFout}>
            Beoordelen
          </Button>
        )}
        {bezig && (
          <Button variant="outline" onClick={() => ctl.current?.abort()}>
            Stoppen
          </Button>
        )}
        <span className="text-muted-foreground" role="status">
          {fase === "indelen" && !bezig && indelingFout ? indelingFout : status}
        </span>
        {gebruik && <span className="text-xs text-muted-foreground">{gebruikTekst(gebruik)}</span>}
      </div>

      {fase === "klaar" &&
        uitslag.map((u) => (
          <section key={u.groep.doel} className="space-y-1">
            <h3 className="font-semibold">
              {u.naam ?? u.groep.naam}{" "}
              <span className="font-normal text-muted-foreground">
                (foto {u.groep.fotos.map((i) => i + 1).join(", ")})
              </span>
            </h3>
            {u.fout ? (
              <p className="text-destructive">{u.fout}</p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Ingevuld
                  {u.onzeker
                    ? `, ${u.onzeker === 1 ? "1 veld" : u.onzeker + " velden"} met een uitroepteken.`
                    : "."}
                </p>
                <Uitslag ruimte={u.groep.ruimte} b={u.b!} fotos={u.groep.fotos} />
              </>
            )}
          </section>
        ))}
    </div>
  );
}

function FotoInvoer({
  label,
  uit,
  onKies,
  meer = false,
  camera = false,
}: {
  label: string;
  uit: boolean;
  onKies: (f: FileList | null) => void;
  meer?: boolean;
  camera?: boolean;
}) {
  return (
    <label
      className={
        "inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted focus-within:ring-2 focus-within:ring-ring" +
        (uit ? " pointer-events-none opacity-50" : "")
      }
    >
      {label}
      <input
        type="file"
        accept="image/*"
        multiple={meer}
        {...(camera ? { capture: "environment" as const } : {})}
        className="sr-only"
        disabled={uit}
        onChange={(e) => {
          onKies(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** Per element wat Gemini zag, met het bewijs en de fotonummers van de woning */
function Uitslag({ ruimte, b, fotos }: { ruimte: FotoRuimte; b: Beoordeling; fotos: number[] }) {
  // de AI nummert de foto's per ruimte vanaf 1; terugvertalen naar de nummers in het venster
  const nr = (n: number) => (fotos[n - 1] ?? n - 1) + 1;
  return (
    <details>
      <summary className="cursor-pointer text-sm">Wat Gemini zag</summary>
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
        {ELEMENTEN[ruimte].map((e) => {
          const o = b[e.sleutel];
          if (!o) return null;
          const extra = [
            o.soort,
            o.aantal !== null && o.status !== "niet_vast_te_stellen"
              ? e.inCm
                ? "ca. " + o.aantal + " cm"
                : o.aantal + "×"
              : null,
          ].filter(Boolean);
          return (
            <li key={e.sleutel} className="grid gap-1 px-3 py-2 sm:grid-cols-[14rem_9rem_1fr]">
              <span className="font-medium">{e.naam}</span>
              <span
                className={
                  o.vrijstaand
                    ? "text-muted-foreground"
                    : o.status === "aanwezig"
                      ? "font-medium text-foreground"
                      : o.status === "waarschijnlijk_aanwezig"
                        ? "text-orange-ink"
                        : "text-muted-foreground"
                }
              >
                {o.vrijstaand ? "Vrijstaand, telt niet" : STATUS[o.status]}
                {extra.length > 0 && !o.vrijstaand ? " (" + extra.join(", ") + ")" : ""}
              </span>
              <span className="text-muted-foreground">
                {o.bewijs}
                {o.fotos.length > 0 && (
                  <span className="whitespace-nowrap"> (foto {o.fotos.map(nr).join(", ")})</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
