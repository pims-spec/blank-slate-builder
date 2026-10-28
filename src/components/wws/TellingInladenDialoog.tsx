import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { calc } from "@/lib/wws/calc";
import { BUITEN_SOORTEN, eur, fmt, overigType, vertrekType } from "@/lib/wws/basis";
import {
  leesHuurprijscheck,
  vergelijkHuurprijscheck,
  zoekHuurprijscheck,
  type HpcUitkomst,
} from "@/lib/wws/inladen/huurprijscheck";
import { aanvullenUitBronnen, type Aanvulling, type Bronnen } from "@/lib/wws/inladen/aanvullen";
import { epFoutMelding, EpVraagSchema } from "@/lib/wws/opzoeken/dienst";
import { epAdresVelden } from "@/lib/wws/opzoeken/eponline";
import { monumentFoutMelding } from "@/lib/wws/opzoeken/monument";
import { zoekCorop, zoekEnergielabel, zoekMonument } from "@/lib/wws/opzoeken/opzoeken.functions";
import { pdfRegels } from "@/lib/wws/plattegrond/beeld";
import { samenvattingVoorz } from "@/lib/wws/voorzSamenvatting";
import { useNormen } from "./NormenContext";

type Ingeladen = Extract<HpcUitkomst, { ok: true }>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Maakt de telling aan en opent hem; een fout laat het venster open */
  onOvernemen: (u: Ingeladen) => Promise<void>;
}

/** Een bestaande puntentelling inladen: de Huurprijscheck van de Huurcommissie (PDF) */
export default function TellingInladenDialoog({ open, onOpenChange, onOvernemen }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {open && <Inhoud onOvernemen={onOvernemen} onSluit={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Inhoud({
  onOvernemen,
  onSluit,
}: {
  onOvernemen: Props["onOvernemen"];
  onSluit: () => void;
}) {
  const N = useNormen();
  const [u, setU] = useState<Ingeladen | null>(null);
  const [status, setStatus] = useState("");
  const [bezig, setBezig] = useState(false);
  /** Opgehaalde gegevens (null = niets) en waarom iets niet lukte; undefined = nog bezig */
  const [bronnen, setBronnen] = useState<Bronnen | undefined>(undefined);
  const [fouten, setFouten] = useState<string[]>([]);
  const [epGebruiken, setEpGebruiken] = useState(false);
  const poging = useRef(0);

  const a = useMemo(
    () => (u && bronnen ? aanvullenUitBronnen(u, bronnen, N, epGebruiken) : null),
    [u, bronnen, N, epGebruiken],
  );

  async function lees(file: File) {
    const nr = ++poging.current;
    setU(null);
    setBronnen(undefined);
    setFouten([]);
    setEpGebruiken(false);
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setStatus("Kies een PDF-bestand.");
      return;
    }
    setBezig(true);
    setStatus("Bezig met lezen…");
    let r: HpcUitkomst;
    try {
      const regels = zoekHuurprijscheck(await pdfRegels(file));
      if (!regels) {
        setStatus(
          "Geen ‘Resultaat Huurprijscheck’ gevonden in deze PDF. Alleen de Huurprijscheck van de Huurcommissie (los of als bijlage) kan worden ingeladen.",
        );
        return;
      }
      r = leesHuurprijscheck(regels);
      if (!r.ok) {
        setStatus(r.fout);
        return;
      }
    } catch {
      setStatus("De PDF kon niet worden gelezen. Is het bestand beschadigd of beveiligd?");
      return;
    } finally {
      setBezig(false);
    }
    setU(r);
    setStatus("Bezig met ophalen van energielabel, monumentstatus en bouwjaar…");
    const b = await haalBronnen(r);
    if (poging.current !== nr) return;
    setBronnen(b.bronnen);
    setFouten(b.fouten);
    setStatus("");
  }

  async function overnemen() {
    if (!u || !a) return;
    setBezig(true);
    try {
      await onOvernemen({ ...u, meta: a.meta, input: a.input, meldingen: a.meldingen });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4 text-sm">
      <DialogHeader>
        <DialogTitle>Telling inladen</DialogTitle>
        <DialogDescription>
          Kies de PDF van de Huurprijscheck van de Huurcommissie, of een rapport met die
          Huurprijscheck als bijlage. Na het nakijken wordt het een gewone telling die je verder
          kunt bewerken.
        </DialogDescription>
      </DialogHeader>
      <label className="flex flex-col gap-1">
        <span className="font-medium">PDF</span>
        <input
          type="file"
          accept="application/pdf"
          disabled={bezig}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void lees(f);
            e.target.value = "";
          }}
        />
      </label>
      <p className="min-h-5 text-muted-foreground" role="status">
        {status}
      </p>
      {u && a && (
        <Nakijken
          u={u}
          a={a}
          fouten={fouten}
          epGebruiken={epGebruiken}
          onEpGebruiken={setEpGebruiken}
        />
      )}
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onSluit} disabled={bezig}>
          Annuleren
        </Button>
        <Button type="button" disabled={!a || bezig} onClick={() => void overnemen()}>
          {bezig && a ? "Bezig…" : "Overnemen als telling"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * Energielabel (EP-Online), monumentstatus (Kadaster/RCE) en gemeente + bouwjaar (PDOK/BAG) bij
 * het adres uit de Huurprijscheck, tegelijk. Wat niet lukt, wordt een regel in `fouten`.
 */
async function haalBronnen(u: Ingeladen): Promise<{ bronnen: Bronnen; fouten: string[] }> {
  const bronnen: Bronnen = { label: null, monument: null, corop: null };
  const v = EpVraagSchema.safeParse(epAdresVelden(u.meta));
  if (!v.success)
    return { bronnen, fouten: ["Zonder postcode en huisnummer kon er niets worden opgehaald."] };
  const fouten: string[] = [];
  const probeer = async <T,>(
    f: () => Promise<
      { ok: true; data: T } | { ok: false; fout: Parameters<typeof epFoutMelding>[0] }
    >,
    melding: (fout: Parameters<typeof epFoutMelding>[0]) => string,
  ): Promise<T | null> => {
    try {
      const r = await f();
      if (r.ok) return r.data;
      fouten.push(melding(r.fout));
    } catch {
      fouten.push(melding("geen_verbinding"));
    }
    return null;
  };
  const [label, monument, corop] = await Promise.all([
    probeer(
      () => zoekEnergielabel({ data: v.data }),
      (f) =>
        "Energielabel: " +
        (f === "niet_gevonden"
          ? "geen geregistreerd label gevonden bij EP-Online."
          : epFoutMelding(f)),
    ),
    probeer(
      () => zoekMonument({ data: v.data }),
      (f) => "Monumentstatus: " + monumentFoutMelding(f),
    ),
    probeer(
      () => zoekCorop({ data: v.data }),
      (f) => "Gemeente en bouwjaar: " + monumentFoutMelding(f),
    ),
  ]);
  return { bronnen: { label, monument, corop }, fouten };
}

const punten = (n: number | null) => (n == null ? "–" : fmt(n));

/** De nakijkstap: wat er is ingelezen, de punten naast elkaar en wat de gebruiker moet nakijken */
export function Nakijken({
  u,
  a,
  fouten,
  epGebruiken,
  onEpGebruiken,
}: {
  u: Ingeladen;
  a: Aanvulling;
  fouten: string[];
  epGebruiken: boolean;
  onEpGebruiken: (aan: boolean) => void;
}) {
  const N = useNormen();
  const R = useMemo(() => calc(a.input, N), [a.input, N]);
  const vergelijk = vergelijkHuurprijscheck(u.verwacht, R);
  const gelijk = vergelijk.every((x) => x.gelijk);
  const m = a.meta;
  const ruimten = [
    ...a.input.vertrekken.map((r) => ({ r, soort: vertrekType(r.type).l })),
    ...a.input.overig.map((r) => ({ r, soort: overigType(r.type).l })),
  ];
  const buiten = a.input.buiten.ruimten
    .map(
      (b) =>
        (BUITEN_SOORTEN.find(([k]) => k === b.soort)?.[1] ?? b.soort) +
        " " +
        fmt(Number(b.m2)) +
        " m²",
    )
    .join(", ");

  return (
    <div className="space-y-4">
      <div className="grid gap-x-6 gap-y-1 rounded-md bg-muted px-3 py-2 sm:grid-cols-2">
        <span>
          <b>Adres:</b> {[m.adres, m.huisnummer].filter(Boolean).join(" ") || "onbekend"}
          {m.postcode || m.plaats ? ", " + [m.postcode, m.plaats].filter(Boolean).join(" ") : ""}
        </span>
        <span>
          <b>Ingevuld op:</b>{" "}
          {u.verwacht.datum ? u.verwacht.datum.split("-").reverse().join("-") : "onbekend"}
        </span>
        <span>
          <b>Tijdvak:</b> {u.verwacht.tijdvak || "onbekend"}
        </span>
        <span>
          <b>Maximale huurprijs (Huurcommissie):</b>{" "}
          {u.verwacht.maxHuur == null ? "–" : eur(u.verwacht.maxHuur)}
        </span>
      </div>

      {a.aangevuld.length > 0 && (
        <section
          aria-label="Opgehaald"
          className="space-y-1 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2"
        >
          <p className="font-medium text-emerald-800 dark:text-emerald-300">
            ✓ Succesvol opgehaald
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {a.aangevuld.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </section>
      )}
      {fouten.length > 0 && (
        <ul
          className="rounded-lg border border-border bg-muted px-3 py-2"
          aria-label="Niet opgehaald"
        >
          {fouten.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
      {a.labelVerschil && (
        <section
          aria-label="Ander energielabel"
          className="space-y-1 rounded-md bg-orange px-3 py-2 text-orange-foreground"
        >
          <p>
            <b>Ander energielabel.</b> Huurprijscheck: {a.labelVerschil.huurprijscheck}. EP-Online
            nu: {a.labelVerschil.epOnline}.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={epGebruiken}
              onChange={(e) => onEpGebruiken(e.target.checked)}
            />
            Label uit EP-Online gebruiken
          </label>
        </section>
      )}

      <section aria-label="Punten">
        <h3 className="mb-1 font-semibold">Punten</h3>
        <table className="w-full max-w-md text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="p-1">Onderdeel</th>
              <th className="p-1 text-right">Huurcommissie</th>
              <th className="p-1 text-right">App</th>
              <th className="p-1" />
            </tr>
          </thead>
          <tbody>
            {vergelijk.map((x) => (
              <tr key={x.naam} className="border-t border-border">
                <td className={"p-1" + (x.naam === "Totaal" ? " font-semibold" : "")}>{x.naam}</td>
                <td className="p-1 text-right tabular-nums">{punten(x.huurcommissie)}</td>
                <td className="p-1 text-right tabular-nums">{punten(x.app)}</td>
                <td className="p-1">
                  {x.gelijk ? "✓" : <span className="font-semibold text-destructive">≠</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p
          className={"mt-1 " + (gelijk ? "text-muted-foreground" : "font-medium text-destructive")}
        >
          {gelijk
            ? "De app komt op dezelfde punten uit als de Huurcommissie."
            : "De app komt op andere punten uit. Kijk de ruimten en voorzieningen na; je kunt de telling na het overnemen aanpassen."}
        </p>
      </section>

      <section aria-label="Ruimten">
        <h3 className="mb-1 font-semibold">Ruimten ({ruimten.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="p-1">Naam</th>
                <th className="p-1">Soort</th>
                <th className="p-1 text-right">m²</th>
                <th className="p-1">Verwarmd</th>
                <th className="p-1">Voorzieningen</th>
              </tr>
            </thead>
            <tbody>
              {ruimten.map(({ r, soort }, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-1">{r.naam}</td>
                  <td className="p-1">{soort}</td>
                  <td className="p-1 text-right tabular-nums">
                    {Number(r.m2) ? fmt(Number(r.m2)) : "–"}
                  </td>
                  <td className="p-1">{r.verwarmd ? "ja" : "nee"}</td>
                  <td className="p-1 text-muted-foreground">
                    {r.fac ? samenvattingVoorz(r.fac) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1">
          <b>Buitenruimten:</b> {buiten || "geen"}
        </p>
      </section>

      {a.meldingen.length > 0 && (
        <section
          aria-label="Nakijken"
          className="rounded-md bg-orange px-3 py-2 text-orange-foreground"
        >
          <h3 className="font-semibold">Nakijken</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {a.meldingen.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
