import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { beoordeelFotos } from "@/lib/wws/ai/ai.functions";
import { aiMelding, gebruikTekst } from "@/lib/wws/ai/meldingen";
import type { Gebruik } from "@/lib/wws/ai/vragen";
import { MAX_FOTOS, type Beoordeling, type ElementOordeel } from "@/lib/wws/foto/beoordeling";
import { fotoKlaarmaken } from "@/lib/wws/foto/beeld";
import { ELEMENTEN, RUIMTE_NAAM, type FotoRuimte } from "@/lib/wws/foto/elementen";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruimte: FotoRuimte;
  /** Naam van de ruimte in de telling (alleen voor de titel) */
  naam: string;
  /** Een geldige beoordeling: de telling invullen; geeft het aantal velden met een ! terug */
  onUitslag: (b: Beoordeling) => number;
}

const TIP: Record<FotoRuimte, string> = {
  keuken:
    "Maak een overzichtsfoto van het hele aanrecht en losse foto's van de apparaten. Zet ook de kast naast de spoelbak en de hoge kast open op de foto, met de deur open: daar zitten vaak een inbouwvaatwasser, koelkast of vriezer achter.",
  badkamer:
    "Maak foto's van de hele ruimte uit twee hoeken, en van de wastafel, de douche of het bad en de kasten (met de deur open).",
  toilet: "Een of twee foto's van de hele ruimte, met het toilet en de fontein erop.",
};

const STATUS: Record<ElementOordeel["status"], string> = {
  aanwezig: "Aanwezig",
  waarschijnlijk_aanwezig: "Waarschijnlijk",
  niet_vast_te_stellen: "Niet vast te stellen",
};

interface Gekozen {
  url: string;
  bestand: File;
}

/** Foto's van een keuken, badkamer of toiletruimte laten beoordelen; vult de telling direct in */
export default function FotoDialoog(p: Props) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Foto's beoordelen: {p.naam}</DialogTitle>
          <DialogDescription>
            Gemini bekijkt de foto's en vult de voorzieningen van deze {RUIMTE_NAAM[p.ruimte]} in.
            Waar het niet zeker is, komt een uitroepteken (!) in de telling. Wat al is ingevuld,
            wordt nooit gewist of verlaagd.
          </DialogDescription>
        </DialogHeader>
        {p.open && <FotosBeoordelen {...p} />}
      </DialogContent>
    </Dialog>
  );
}

function FotosBeoordelen({ ruimte, onUitslag }: Props) {
  const [fotos, setFotos] = useState<Gekozen[]>([]);
  const [bezig, setBezig] = useState(false);
  const [status, setStatus] = useState("");
  const [uitslag, setUitslag] = useState<{ b: Beoordeling; onzeker: number } | null>(null);
  const [gebruik, setGebruik] = useState<Gebruik | undefined>();
  const ctl = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);

  // object-URL's van de voorbeelden opruimen bij sluiten
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function voegToe(lijst: FileList | null) {
    if (!lijst) return;
    const nieuw = [...lijst].filter((f) => f.type.startsWith("image/"));
    const ruimteOver = MAX_FOTOS - fotos.length;
    if (nieuw.length > ruimteOver)
      setStatus(`Hoogstens ${MAX_FOTOS} foto's; de rest is niet toegevoegd.`);
    else setStatus("");
    const erbij = nieuw.slice(0, Math.max(0, ruimteOver)).map((bestand) => {
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

  async function beoordelen() {
    if (!fotos.length) {
      setStatus("Kies eerst een of meer foto's.");
      return;
    }
    setBezig(true);
    setUitslag(null);
    try {
      setStatus("Foto's verkleinen…");
      let klaar;
      try {
        klaar = await Promise.all(fotos.map((f) => fotoKlaarmaken(f.bestand)));
      } catch (e) {
        setStatus(
          e instanceof Error && e.message ? e.message : "Een foto kon niet worden gelezen.",
        );
        return;
      }
      setStatus("Gemini bekijkt de foto's… dit duurt meestal 15 tot 40 seconden.");
      ctl.current = new AbortController();
      let r;
      try {
        r = await beoordeelFotos({ signal: ctl.current.signal, data: { ruimte, fotos: klaar } });
      } catch {
        setStatus(ctl.current?.signal.aborted ? "Gestopt." : aiMelding("geen_verbinding", "foto"));
        return;
      }
      setGebruik(r.gebruik);
      if (!r.ok) {
        setStatus(aiMelding(r.fout, "foto", r.gebruik));
        return;
      }
      const onzeker = onUitslag(r.data);
      setUitslag({ b: r.data, onzeker });
      setStatus(
        onzeker
          ? `Ingevuld in de telling. Controleer de ${onzeker === 1 ? "plek" : onzeker + " plekken"} met een uitroepteken.`
          : "Ingevuld in de telling. Controleer het en pas aan waar nodig.",
      );
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4 text-sm">
      <p className="rounded-md bg-muted px-3 py-2">
        <b>Tip:</b> {TIP[ruimte]}
      </p>
      <p className="text-xs text-muted-foreground">
        Zet geen personen, namen, post of andere persoonlijke gegevens op de foto's. De foto's
        worden in je browser verkleind en de locatie en andere gegevens worden eruit gehaald. Ze
        gaan alleen naar Gemini en worden niet bewaard, niet door de app en niet door Google.
      </p>

      {!uitslag && (
        <div className="flex flex-wrap items-center gap-2">
          <label className={knop(bezig || fotos.length >= MAX_FOTOS)}>
            Foto's kiezen
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={bezig || fotos.length >= MAX_FOTOS}
              onChange={(e) => {
                voegToe(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <label className={knop(bezig || fotos.length >= MAX_FOTOS)}>
            Foto maken
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={bezig || fotos.length >= MAX_FOTOS}
              onChange={(e) => {
                voegToe(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <span className="text-xs text-muted-foreground">
            {fotos.length} van {MAX_FOTOS} foto's
          </span>
        </div>
      )}

      {fotos.length > 0 && (
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {fotos.map((f, i) => (
            <li key={f.url} className="relative">
              <img
                src={f.url}
                alt={`Foto ${i + 1}`}
                className="aspect-square w-full rounded-md border border-border object-cover"
              />
              <span className="absolute left-1 top-1 rounded bg-background/90 px-1 text-xs font-medium">
                {i + 1}
              </span>
              {!bezig && !uitslag && (
                <button
                  type="button"
                  aria-label={`Foto ${i + 1} weghalen`}
                  className="absolute right-1 top-1 rounded bg-background/90 px-1.5 text-xs hover:text-destructive"
                  onClick={() => verwijder(i)}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!uitslag && (
          <Button onClick={beoordelen} disabled={bezig || !fotos.length}>
            Foto's beoordelen
          </Button>
        )}
        {bezig && (
          <Button variant="outline" onClick={() => ctl.current?.abort()}>
            Stoppen
          </Button>
        )}
        <span className="text-muted-foreground" role="status">
          {status}
        </span>
        {gebruik && <span className="text-xs text-muted-foreground">{gebruikTekst(gebruik)}</span>}
      </div>

      {uitslag && <Uitslag ruimte={ruimte} b={uitslag.b} />}
    </div>
  );
}

const knop = (uit: boolean) =>
  "inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted focus-within:ring-2 focus-within:ring-ring" +
  (uit ? " pointer-events-none opacity-50" : "");

/** Per element wat Gemini zag, met het bewijs en de fotonummers */
function Uitslag({ ruimte, b }: { ruimte: FotoRuimte; b: Beoordeling }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Wat Gemini zag</h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {ELEMENTEN[ruimte].map((e) => {
          const o = b[e.sleutel];
          if (!o) return null;
          const extra = [
            o.soort,
            o.aantal !== null && o.status !== "niet_vast_te_stellen" ? o.aantal + "×" : null,
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
                  <span className="whitespace-nowrap"> (foto {o.fotos.join(", ")})</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
