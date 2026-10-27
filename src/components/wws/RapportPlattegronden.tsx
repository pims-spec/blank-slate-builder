// Plattegronden alleen voor het rapport (2D, 3D, situatie/meetrapport, …): de maten worden niet
// overgenomen. Uploaden gebeurt direct bij "Toevoegen" (de telling moet daarvoor al bestaan); de
// telling krijgt de verwijzingen pas bij Opslaan. In de PDF's krijgt elke plattegrond een eigen
// pagina "Plattegrond 1 - 2D", zoals de CBRE-rapporten.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  bestandNaarCanvas,
  blobNaarBytes,
  canvasNaarJpeg,
  pdfAantalPaginas,
  pdfPaginasNaarCanvassen,
} from "@/lib/wws/plattegrond/beeld";
import {
  MAX_RAPPORT_PLATTEGRONDEN,
  MAX_TITEL,
  opVolgorde,
  paginaTitel,
  SOORT_NAAM,
  SOORTEN,
  type RapportPlattegrond,
  type RapportPlattegrondSoort,
} from "@/lib/wws/plattegrond/rapport";
import { plattegrondOpslag } from "./plattegrondBeeld";

const veldCls =
  "rounded-lg border border-transparent bg-muted px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Hoogstens zoveel afbeeldingen en PDF-pagina's tegelijk in het venster */
const MAX_KANDIDATEN = 30;

/** Standaardsoort op volgorde, zoals de CBRE-rapporten: 2D, 3D, situatie, berging */
const standaardSoort = (i: number): RapportPlattegrondSoort =>
  (["2d", "3d", "situatie", "berging"] as const)[i] ?? "eigen";

interface Props {
  tellingId: string;
  /** Nog niet opgeslagen: uploaden kan nog niet (de opslag hoort bij een bestaande telling) */
  isNieuw: boolean;
  alleenLezen: boolean;
  lijst: RapportPlattegrond[];
  onWijzig: (lijst: RapportPlattegrond[]) => void;
  /** Een plattegrond uit de lijst gehaald; de editor ruimt hem op als niets hem nog gebruikt */
  onVerwijderd: (pad: string) => void;
}

/** De kaart "Plattegronden in het rapport" met de lijst en de knop om toe te voegen */
export default function RapportPlattegronden(p: Props) {
  const [open, setOpen] = useState(false);
  const vol = p.lijst.length >= MAX_RAPPORT_PLATTEGRONDEN;
  if (p.alleenLezen && !p.lijst.length) return null;
  // altijd op de vaste volgorde van de CBRE-rapporten: 2D, 3D, situatie, berging, indeling, eigen
  const wijzig = (l: RapportPlattegrond[]) => p.onWijzig(opVolgorde(l));
  const zet = (i: number, w: Partial<RapportPlattegrond>) =>
    wijzig(p.lijst.map((x, j) => (j === i ? { ...x, ...w } : x)));
  return (
    <section aria-label="Plattegronden in het rapport" className="gh-card mt-3 space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Plattegronden in het rapport</h3>
        {!p.alleenLezen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={p.isNieuw || vol}
            onClick={() => setOpen(true)}
          >
            Plattegrond toevoegen aan rapport
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {p.isNieuw
          ? "Sla de telling eerst op; daarna kun je plattegronden toevoegen."
          : "Alleen voor het rapport: de maten worden niet overgenomen. Elke plattegrond krijgt in de PDF een eigen pagina, op volgorde: 2D, 3D, situatie, berging, indelingsadvies, eigen titel."}
        {vol && " Het maximum van " + MAX_RAPPORT_PLATTEGRONDEN + " plattegronden is bereikt."}
      </p>
      {p.lijst.length > 0 && (
        <ol className="space-y-2" aria-label="Plattegronden">
          {p.lijst.map((x, i) => (
            <li
              key={x.pad}
              className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/60 p-2"
            >
              <Duimnagel pad={x.pad} alt={paginaTitel(i + 1, x)} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-medium">{paginaTitel(i + 1, x)}</span>
                {!p.alleenLezen && (
                  <SoortKeuze
                    soort={x.soort}
                    titel={x.titel}
                    label={"plattegrond " + (i + 1)}
                    onSoort={(soort) => {
                      const { titel, ...rest } = x;
                      const l = [...p.lijst];
                      l[i] =
                        soort === "eigen"
                          ? { ...rest, soort, titel: titel ?? "" }
                          : { ...rest, soort };
                      wijzig(l);
                    }}
                    onTitel={(titel) => zet(i, { titel })}
                  />
                )}
              </div>
              {!p.alleenLezen && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    wijzig(p.lijst.filter((_, j) => j !== i));
                    p.onVerwijderd(x.pad);
                  }}
                >
                  Verwijderen
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      <ToevoegenDialoog
        open={open}
        onOpenChange={setOpen}
        tellingId={p.tellingId}
        ruimte={MAX_RAPPORT_PLATTEGRONDEN - p.lijst.length}
        onToegevoegd={(nieuw) => {
          wijzig([...p.lijst, ...nieuw]);
          setOpen(false);
        }}
      />
    </section>
  );
}

function SoortKeuze(p: {
  soort: RapportPlattegrondSoort;
  titel?: string | undefined;
  label: string;
  onSoort: (s: RapportPlattegrondSoort) => void;
  onTitel: (t: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={veldCls}
        aria-label={"Soort " + p.label}
        value={p.soort}
        onChange={(e) => p.onSoort(e.target.value as RapportPlattegrondSoort)}
      >
        {SOORTEN.map((s) => (
          <option key={s} value={s}>
            {SOORT_NAAM[s]}
          </option>
        ))}
      </select>
      {p.soort === "eigen" && (
        <input
          className={veldCls}
          aria-label={"Titel " + p.label}
          placeholder="Bijv. Zolder"
          maxLength={MAX_TITEL}
          value={p.titel ?? ""}
          onChange={(e) => p.onTitel(e.target.value)}
        />
      )}
    </div>
  );
}

/** Kleine weergave van een opgeslagen plattegrond */
function Duimnagel({ pad, alt }: { pad: string; alt: string }) {
  const q = useQuery({
    queryKey: ["plattegrond", pad],
    queryFn: () => plattegrondOpslag.haal(pad),
    staleTime: Infinity,
    retry: 1,
  });
  const url = useObjectUrl(q.data ?? null);
  return url ? (
    <img
      src={url}
      alt={alt}
      className="h-16 w-16 rounded border border-border bg-white object-contain"
    />
  ) : (
    <div className="flex h-16 w-16 items-center justify-center rounded border border-border text-[10px] text-muted-foreground">
      {q.isError ? "Niet te laden" : "Laden…"}
    </div>
  );
}

function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

interface Kandidaat {
  canvas: HTMLCanvasElement;
  voorbeeld: string;
  /** Naam van het bestand (alleen getoond als er meer bestanden zijn gekozen) */
  bestand: string;
  /** Paginanummer in de PDF; null bij een afbeelding */
  pagina: number | null;
  mee: boolean;
  soort: RapportPlattegrondSoort;
  titel: string;
}

/** Venster: bestand kiezen (afbeelding of PDF), pagina's en soort kiezen, uploaden */
function ToevoegenDialoog(p: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tellingId: string;
  ruimte: number;
  onToegevoegd: (lijst: RapportPlattegrond[]) => void;
}) {
  const [kandidaten, setKandidaten] = useState<Kandidaat[]>([]);
  const [bezig, setBezig] = useState<"" | "lezen" | "uploaden">("");
  const [fout, setFout] = useState("");
  useEffect(() => {
    if (!p.open) {
      setKandidaten([]);
      setFout("");
      setBezig("");
    }
  }, [p.open]);

  async function kies(lijstBestanden: FileList | null) {
    const bestanden = [...(lijstBestanden ?? [])];
    if (!bestanden.length) return;
    setFout("");
    setKandidaten([]);
    setBezig("lezen");
    const gelezen: { canvas: HTMLCanvasElement; pagina: number | null; bestand: string }[] = [];
    const mislukt: string[] = [];
    try {
      for (const file of bestanden) {
        const ruimte = MAX_KANDIDATEN - gelezen.length;
        if (ruimte <= 0) break;
        try {
          if (file.type === "application/pdf") {
            const n = Math.min(await pdfAantalPaginas(file), 20, ruimte);
            const nrs = Array.from({ length: n }, (_, i) => i + 1);
            (await pdfPaginasNaarCanvassen(file, nrs)).forEach((canvas, i) =>
              gelezen.push({ canvas, pagina: i + 1, bestand: file.name }),
            );
          } else {
            gelezen.push({
              canvas: await bestandNaarCanvas(file),
              pagina: null,
              bestand: file.name,
            });
          }
        } catch {
          mislukt.push(file.name);
        }
      }
      setKandidaten(
        gelezen.map((k, i) => ({
          ...k,
          voorbeeld: k.canvas.toDataURL("image/jpeg", 0.5),
          mee: i < p.ruimte,
          soort: standaardSoort(i),
          titel: "",
        })),
      );
      if (mislukt.length)
        setFout(
          (mislukt.length === 1 ? "Dit bestand kon" : "Deze bestanden konden") +
            " niet worden gelezen: " +
            mislukt.join(", ") +
            ". Kies een PNG, JPG of PDF.",
        );
    } finally {
      setBezig("");
    }
  }

  const gekozen = kandidaten.filter((k) => k.mee);
  const teVeel = gekozen.length > p.ruimte;

  async function toevoegen() {
    if (!gekozen.length || teVeel) return;
    setBezig("uploaden");
    setFout("");
    try {
      const uit: RapportPlattegrond[] = [];
      for (const k of gekozen) {
        const bytes = await blobNaarBytes(await canvasNaarJpeg(k.canvas));
        const ref = await plattegrondOpslag.bewaar(p.tellingId, bytes, {
          breedte: k.canvas.width,
          hoogte: k.canvas.height,
        });
        uit.push({
          ...ref,
          soort: k.soort,
          ...(k.soort === "eigen" ? { titel: k.titel.trim().slice(0, MAX_TITEL) } : {}),
        });
      }
      p.onToegevoegd(uit);
    } catch {
      // geen details doorgeven
      setFout("Uploaden lukte niet. Probeer het opnieuw.");
    } finally {
      setBezig("");
    }
  }

  const zet = (i: number, w: Partial<Kandidaat>) =>
    setKandidaten((ks) => ks.map((k, j) => (j === i ? { ...k, ...w } : k)));
  // bij meer bestanden staat de bestandsnaam erbij
  const meerBestanden = new Set(kandidaten.map((k) => k.bestand)).size > 1;
  const naamVan = (k: Kandidaat) =>
    meerBestanden
      ? k.bestand + (k.pagina ? " – pagina " + k.pagina : "")
      : k.pagina
        ? "Pagina " + k.pagina
        : "Afbeelding";

  return (
    <Dialog open={p.open} onOpenChange={(o) => !bezig && p.onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plattegrond toevoegen aan rapport</DialogTitle>
          <DialogDescription>
            Kies een of meer afbeeldingen (PNG of JPG) of PDF&apos;s, bijvoorbeeld een meetrapport.
            De maten worden niet overgenomen; de plattegronden komen alleen in het rapport. Daarna
            kies je welke afbeeldingen en pagina&apos;s mee moeten.
          </DialogDescription>
        </DialogHeader>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          multiple
          aria-label="Bestanden met plattegronden"
          disabled={!!bezig}
          onChange={(e) => void kies(e.target.files)}
          className="text-sm"
        />
        {bezig === "lezen" && <p className="text-sm text-muted-foreground">Bestand lezen…</p>}
        {fout && (
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm" role="alert">
            {fout}
          </p>
        )}
        {kandidaten.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2" aria-label="Te kiezen pagina's">
            {kandidaten.map((k, i) => (
              <li key={i} className="space-y-2 rounded-lg border border-border p-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={k.mee}
                    onChange={(e) => zet(i, { mee: e.target.checked })}
                  />
                  <span className="min-w-0 break-all">{naamVan(k)}</span>
                </label>
                <img
                  src={k.voorbeeld}
                  alt={naamVan(k)}
                  className="max-h-48 w-full rounded bg-white object-contain"
                />
                {k.mee && (
                  <SoortKeuze
                    soort={k.soort}
                    titel={k.titel}
                    label={naamVan(k)}
                    onSoort={(soort) => zet(i, { soort })}
                    onTitel={(titel) => zet(i, { titel })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {teVeel && (
          <p className="text-sm text-destructive" role="alert">
            Er kunnen nog {p.ruimte} plattegrond{p.ruimte === 1 ? "" : "en"} bij; zet er een paar
            uit.
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!!bezig}
            onClick={() => p.onOpenChange(false)}
          >
            Annuleren
          </Button>
          <Button type="button" disabled={!gekozen.length || teVeel || !!bezig} onClick={toevoegen}>
            {bezig === "uploaden"
              ? "Toevoegen…"
              : "Toevoegen" + (gekozen.length > 1 ? " (" + gekozen.length + ")" : "")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
