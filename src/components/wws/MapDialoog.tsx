import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WwsInput } from "@/lib/wws";
import { sorteerFotos } from "@/lib/wws/ai/ai.functions";
import { aiMelding, gebruikTekst } from "@/lib/wws/ai/meldingen";
import type { Gebruik } from "@/lib/wws/ai/vragen";
import { fotoKlaarmaken, SORTEER_MAX_ZIJDE } from "@/lib/wws/foto/beeld";
import type { FotoSortering } from "@/lib/wws/foto/sorteren";
import { driveInstellingen } from "@/lib/wws/map/drive";
import { downloadUitDrive, kiesUitDrive } from "@/lib/wws/map/googleDrive";
import { entriesVan, invoerVan, leesGesleept, type MapInvoer } from "@/lib/wws/map/slepen";
import {
  kiesPlattegrond,
  labelOpties,
  mapStappen,
  metSortering,
  teSorteren,
  verdeelMap,
  type MapItem,
  type MapLabel,
  type Overgeslagen,
} from "@/lib/wws/map/verdelen";
import type { TellingMeta } from "@/lib/wws/opslag";
import { FotosBeoordelen } from "./FotoDialoog";
import { PlattegrondInlezen } from "./PlattegrondDialoog";
import type { NieuwBeeld } from "./plattegrondBeeld";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: WwsInput;
  meta: TellingMeta;
  /** De nagekeken plattegrond: de nieuwe invoer en de afbeelding (zoals PlattegrondDialoog) */
  onPlattegrond: (input: WwsInput, beeld: NieuwBeeld) => void;
  /** De beoordeelde foto's: de telling met de ingevulde voorzieningen (zoals FotoDialoog) */
  onFotos: (input: WwsInput) => void;
}

const LABEL_NAAM: Record<MapLabel, string> = {
  plattegrond: "Plattegrond",
  foto: "Foto",
  niet: "Niet gebruiken",
};
const BRON_NAAM = { pdf: "PDF", naam: "bestandsnaam", ai: "Gemini" } as const;
const veldCls =
  "w-full rounded-lg border border-transparent bg-muted px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Fase = "kiezen" | "nakijken" | "plattegrond" | "fotos";

/**
 * Een hele map inlezen (van de computer of uit Google Drive): de app herkent de plattegrond en de
 * foto's, de gebruiker kijkt dat na, leest de plattegrond in (met de controletabel) en laat daarna
 * de foto's beoordelen. Elke stap komt pas na het nakijken in de telling.
 */
export default function MapDialoog(p: Props) {
  // de Google Picker staat buiten het venster; zolang hij open is mag het venster niet sluiten
  const [picker, setPicker] = useState(false);
  return (
    <Dialog open={p.open} onOpenChange={(o) => !picker && p.onOpenChange(o)}>
      <DialogContent
        className="max-h-[90vh] max-w-4xl overflow-y-auto"
        onInteractOutside={(e) => picker && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Map inlezen</DialogTitle>
          <DialogDescription>
            Kies de map met de plattegrond en de foto's van de woning, van je computer of uit Google
            Drive. De app herkent wat de plattegrond is en wat foto's zijn. Je kijkt elke stap na
            voordat er iets in de telling komt.
          </DialogDescription>
        </DialogHeader>
        {p.open && <MapInlezen {...p} onPicker={setPicker} />}
      </DialogContent>
    </Dialog>
  );
}

function MapInlezen({
  input,
  meta,
  onOpenChange,
  onPlattegrond,
  onFotos,
  onPicker,
}: Props & { onPicker: (open: boolean) => void }) {
  const drive = useMemo(() => driveInstellingen(import.meta.env), []);
  const [fase, setFase] = useState<Fase>("kiezen");
  const [invoer, setInvoer] = useState<MapInvoer[]>([]);
  const [items, setItems] = useState<MapItem[]>([]);
  const [overgeslagen, setOvergeslagen] = useState<Overgeslagen[]>([]);
  const [plattegrond, setPlattegrond] = useState<number | null>(null);
  const [stap, setStap] = useState<ReturnType<typeof mapStappen> | null>(null);
  const [bezig, setBezig] = useState(false);
  const [status, setStatus] = useState("");
  const [gebruik, setGebruik] = useState<Gebruik | undefined>();
  const [sleept, setSleept] = useState(false);
  const ctl = useRef<AbortController | null>(null);

  // voorbeelden van de afbeeldingen
  const urls = useMemo(() => {
    const m = new Map<number, string>();
    for (const x of items)
      if (x.soort === "afbeelding") m.set(x.i, URL.createObjectURL(invoer[x.i]!.bestand));
    return m;
  }, [items, invoer]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  /** De gekozen bestanden verdelen; extra = al overgeslagen bij het kiezen in Drive */
  function binnen(lijst: MapInvoer[], extra: Overgeslagen[] = []) {
    const r = verdeelMap(
      lijst.map((x) => ({ pad: x.pad, type: x.bestand.type, grootte: x.bestand.size })),
    );
    // een PDF of afbeelding zonder type (bijv. na slepen) krijgt het type, voor het inlezen
    const metType = lijst.map((x, i) => {
      const it = r.items.find((y) => y.i === i);
      if (!it || x.bestand.type) return x;
      const type =
        it.soort === "pdf"
          ? "application/pdf"
          : /\.png$/i.test(x.pad)
            ? "image/png"
            : /\.webp$/i.test(x.pad)
              ? "image/webp"
              : "image/jpeg";
      return { ...x, bestand: new File([x.bestand], x.bestand.name, { type }) };
    });
    setInvoer(metType);
    setItems(r.items);
    setOvergeslagen([...extra, ...r.overgeslagen]);
    const nP = r.items.filter((x) => x.label === "plattegrond").length;
    const nF = r.items.length - nP;
    setStatus(
      r.items.length
        ? `${nF === 1 ? "1 foto" : nF + " foto's"}${nP ? ` en ${nP === 1 ? "1 plattegrond" : nP + " plattegronden"}` : ""} gevonden.`
        : "Geen foto's of plattegrond gevonden in deze map.",
    );
  }

  async function gesleept(e: React.DragEvent) {
    e.preventDefault();
    setSleept(false);
    if (bezig) return;
    const entries = entriesVan(e.dataTransfer);
    setBezig(true);
    try {
      setStatus("Map lezen…");
      binnen(await leesGesleept(entries));
    } finally {
      setBezig(false);
    }
  }

  async function uitDrive() {
    if (!drive) return;
    setBezig(true);
    onPicker(true);
    // het venster blokkeert klikken buiten zich (pointer-events op body); de Picker staat daarbuiten
    const vorige = document.body.style.pointerEvents;
    document.body.style.pointerEvents = "auto";
    let keuze;
    try {
      keuze = await kiesUitDrive(drive);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Google Drive is niet gelukt.");
      setBezig(false);
      return;
    } finally {
      document.body.style.pointerEvents = vorige;
      onPicker(false);
    }
    try {
      if (!keuze) return setStatus("");
      if (!keuze.bestanden.length) return setStatus("Er zijn geen bestanden gekozen.");
      // eerst op naam, type en grootte verdelen; alleen wat bruikbaar is ophalen
      const vooraf = verdeelMap(keuze.bestanden);
      ctl.current = new AbortController();
      const lijst: MapInvoer[] = [];
      for (const [n, it] of vooraf.items.entries()) {
        setStatus(`Uit Google Drive ophalen: ${n + 1} van ${vooraf.items.length}…`);
        const b = keuze.bestanden[it.i]!;
        try {
          lijst.push({
            pad: b.pad,
            bestand: await downloadUitDrive(b, keuze.token, ctl.current.signal),
          });
        } catch (e) {
          if (ctl.current.signal.aborted) return setStatus("Gestopt.");
          vooraf.overgeslagen.push({
            pad: b.pad,
            reden: e instanceof Error ? e.message : "Ophalen mislukt.",
          });
        }
      }
      binnen(lijst, vooraf.overgeslagen);
    } finally {
      setBezig(false);
    }
  }

  /** De foto's laten sorteren (met de soort plattegrond) en naar het nakijken */
  async function herkennen() {
    const fotos = teSorteren(items);
    const verder = (lijst: MapItem[], melding: string) => {
      setItems(lijst);
      setPlattegrond(kiesPlattegrond(lijst));
      setFase("nakijken");
      setStatus(melding);
    };
    const NAKIJKEN = "Kijk na wat de plattegrond is en welke foto's meegaan. Daarna: Verder.";
    if (!fotos.length) return verder(items, NAKIJKEN);
    setBezig(true);
    try {
      setStatus("Foto's verkleinen…");
      let klein;
      try {
        klein = await Promise.all(
          fotos.map((x) => fotoKlaarmaken(invoer[x.i]!.bestand, SORTEER_MAX_ZIJDE)),
        );
      } catch (e) {
        return setStatus(
          e instanceof Error && e.message ? e.message : "Een foto kon niet worden gelezen.",
        );
      }
      setStatus("Gemini herkent de foto's en de plattegrond…");
      ctl.current = new AbortController();
      let r;
      try {
        r = await sorteerFotos({
          signal: ctl.current.signal,
          data: { fotos: klein, metPlattegrond: true },
        });
      } catch {
        if (ctl.current?.signal.aborted) return setStatus("Gestopt.");
        return verder(
          items,
          aiMelding("geen_verbinding", "foto") + " Kijk zelf na wat de plattegrond is.",
        );
      }
      setGebruik(r.gebruik);
      if (!r.ok)
        return verder(
          items,
          aiMelding(r.fout, "foto", r.gebruik) + " Kijk zelf na wat de plattegrond is.",
        );
      verder(metSortering(items, r.data), NAKIJKEN);
    } finally {
      setBezig(false);
    }
  }

  function zetLabel(i: number, label: MapLabel) {
    const lijst = items.map((x) => (x.i === i ? { ...x, label } : x));
    setItems(lijst);
    if (label === "plattegrond" && plattegrond === null) setPlattegrond(i);
    if (label !== "plattegrond" && plattegrond === i) setPlattegrond(kiesPlattegrond(lijst));
  }

  function naarVolgende() {
    const s = mapStappen(items, plattegrond);
    if (s.fout) return setStatus(s.fout);
    setStap(s);
    setStatus("");
    setFase(s.plattegrond !== null ? "plattegrond" : "fotos");
  }

  /** Na de plattegrond: door naar de foto's, of klaar */
  function naPlattegrond() {
    if (stap?.fotos.length) setFase("fotos");
    else onOpenChange(false);
  }

  if (fase === "plattegrond" && stap?.plattegrond != null)
    return (
      <div className="min-w-0 space-y-3">
        <StapKop nr={1} van={stap.fotos.length ? 2 : 1} tekst="Plattegrond inlezen en nakijken" />
        <PlattegrondInlezen
          input={input}
          meta={meta}
          beginBestand={invoer[stap.plattegrond]!.bestand}
          knopTekst={stap.fotos.length ? "Overnemen en verder naar de foto's" : "Overnemen"}
          onOvernemen={(inp, beeld) => {
            onPlattegrond(inp, beeld);
            naPlattegrond();
          }}
        />
        <Button variant="outline" onClick={naPlattegrond}>
          {stap.fotos.length ? "Plattegrond overslaan" : "Sluiten zonder plattegrond"}
        </Button>
      </div>
    );

  if (fase === "fotos" && stap)
    return (
      <div className="min-w-0 space-y-3">
        <StapKop
          nr={stap.plattegrond !== null ? 2 : 1}
          van={stap.plattegrond !== null ? 2 : 1}
          tekst="Foto's indelen en beoordelen"
        />
        <FotosBeoordelen
          input={input}
          onToepassen={onFotos}
          beginFotos={stap.fotos.map((i) => invoer[i]!.bestand)}
          beginSortering={stap.sortering as FotoSortering[]}
        />
      </div>
    );

  const plattegronden = items.filter((x) => x.label === "plattegrond");

  return (
    <div className="min-w-0 space-y-4 text-sm">
      {fase === "kiezen" && (
        <>
          <div
            role="group"
            aria-label="Map hierheen slepen"
            onDragOver={(e) => {
              e.preventDefault();
              setSleept(true);
            }}
            onDragLeave={() => setSleept(false)}
            onDrop={gesleept}
            className={
              "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-6 text-center " +
              (sleept ? "border-primary bg-muted" : "border-border")
            }
          >
            <span className="text-muted-foreground">Sleep de map hierheen, of:</span>
            <div className="flex flex-wrap justify-center gap-2">
              <BestandKnop
                label="Map kiezen"
                map
                uit={bezig}
                onKies={(l) => binnen(invoerVan(l))}
              />
              <BestandKnop
                label="Bestanden kiezen"
                uit={bezig}
                onKies={(l) => binnen(invoerVan(l))}
              />
              {drive && (
                <Button type="button" variant="outline" disabled={bezig} onClick={uitDrive}>
                  Uit Google Drive
                </Button>
              )}
            </div>
            {drive && (
              <span className="text-xs text-muted-foreground">
                Google Drive: open in het keuzevenster de map en selecteer alles (Cmd/Ctrl-A).
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Zet geen personen, namen of post op de foto's, en snijd een naam of adres van de
            tekening. Foto's worden in je browser verkleind en zonder locatie naar Gemini gestuurd;
            de plattegrond gaat naar Claude. Herkennen telt als één AI-aanroep.
          </p>
        </>
      )}

      {fase === "nakijken" && plattegronden.length > 1 && (
        <p className="rounded-md bg-muted px-3 py-2">
          Er zijn {plattegronden.length} plattegronden. De app leest er één in; kies welke bij "Deze
          inlezen".
        </p>
      )}

      {items.length > 0 && (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((x) => {
            const naam = x.pad.split("/").pop() ?? x.pad;
            const url = urls.get(x.i);
            return (
              <li key={x.i} className="min-w-0 space-y-1">
                {url ? (
                  <img
                    src={url}
                    alt={naam}
                    className={
                      "aspect-square w-full rounded-md border border-border object-cover" +
                      (x.label === "niet" ? " opacity-40" : "")
                    }
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md border border-border bg-muted font-semibold text-muted-foreground">
                    PDF
                  </div>
                )}
                <p className="truncate text-xs" title={x.pad}>
                  {naam}
                </p>
                {fase === "nakijken" && (
                  <>
                    {(x.sortering || x.bron) && (
                      <p className="text-xs text-muted-foreground">
                        {x.label === "plattegrond" && x.bron
                          ? "Plattegrond (" + BRON_NAAM[x.bron] + ")"
                          : x.sortering?.reden}
                      </p>
                    )}
                    <select
                      aria-label={"Wat is " + naam}
                      disabled={bezig}
                      className={veldCls}
                      value={x.label}
                      onChange={(e) => zetLabel(x.i, e.target.value as MapLabel)}
                    >
                      {labelOpties(x).map((l) => (
                        <option key={l} value={l}>
                          {LABEL_NAAM[l]}
                        </option>
                      ))}
                    </select>
                    {x.label === "plattegrond" && plattegronden.length > 1 && (
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="radio"
                          name="plattegrond"
                          checked={plattegrond === x.i}
                          onChange={() => setPlattegrond(x.i)}
                        />
                        Deze inlezen
                      </label>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {overgeslagen.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {overgeslagen.length === 1
              ? "1 bestand overgeslagen"
              : overgeslagen.length + " bestanden overgeslagen"}
          </summary>
          <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
            {overgeslagen.map((o, j) => (
              <li key={j}>
                {o.pad}: {o.reden}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3">
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
      <DialogFooter>
        {fase === "kiezen" && (
          <Button onClick={herkennen} disabled={bezig || !items.length}>
            Herkennen en nakijken
          </Button>
        )}
        {fase === "nakijken" && (
          <>
            <Button variant="outline" disabled={bezig} onClick={() => setFase("kiezen")}>
              Andere map
            </Button>
            <Button onClick={naarVolgende} disabled={bezig}>
              Verder
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}

function StapKop({ nr, van, tekst }: { nr: number; van: number; tekst: string }) {
  return (
    <h3 className="font-semibold">
      {van > 1 ? `Stap ${nr} van ${van}: ` : ""}
      {tekst}
    </h3>
  );
}

function BestandKnop({
  label,
  uit,
  onKies,
  map = false,
}: {
  label: string;
  uit: boolean;
  onKies: (f: FileList) => void;
  map?: boolean;
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
        multiple
        accept={map ? undefined : "image/*,application/pdf"}
        // een hele map (met submappen) kiezen; React kent het attribuut niet
        ref={(el) => {
          if (el && map) el.setAttribute("webkitdirectory", "");
        }}
        className="sr-only"
        disabled={uit}
        onChange={(e) => {
          if (e.target.files?.length) onKies(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
