import { useMemo, useState } from "react";
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
  const [u, setU] = useState<Ingeladen | null>(null);
  const [status, setStatus] = useState("");
  const [bezig, setBezig] = useState(false);

  async function lees(file: File) {
    setU(null);
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setStatus("Kies een PDF-bestand.");
      return;
    }
    setBezig(true);
    setStatus("Bezig met lezen…");
    try {
      const regels = zoekHuurprijscheck(await pdfRegels(file));
      if (!regels) {
        setStatus(
          "Geen ‘Resultaat Huurprijscheck’ gevonden in deze PDF. Alleen de Huurprijscheck van de Huurcommissie (los of als bijlage) kan worden ingeladen.",
        );
        return;
      }
      const r = leesHuurprijscheck(regels);
      if (!r.ok) {
        setStatus(r.fout);
        return;
      }
      setU(r);
      setStatus("");
    } catch {
      setStatus("De PDF kon niet worden gelezen. Is het bestand beschadigd of beveiligd?");
    } finally {
      setBezig(false);
    }
  }

  async function overnemen() {
    if (!u) return;
    setBezig(true);
    try {
      await onOvernemen(u);
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
      {u && <Nakijken u={u} />}
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onSluit} disabled={bezig}>
          Annuleren
        </Button>
        <Button type="button" disabled={!u || bezig} onClick={() => void overnemen()}>
          {bezig && u ? "Bezig…" : "Overnemen als telling"}
        </Button>
      </DialogFooter>
    </div>
  );
}

const punten = (n: number | null) => (n == null ? "–" : fmt(n));

/** De nakijkstap: wat er is ingelezen, de punten naast elkaar en wat de gebruiker moet nakijken */
export function Nakijken({ u }: { u: Ingeladen }) {
  const N = useNormen();
  const R = useMemo(() => calc(u.input, N), [u.input, N]);
  const vergelijk = vergelijkHuurprijscheck(u.verwacht, R);
  const gelijk = vergelijk.every((x) => x.gelijk);
  const m = u.meta;
  const ruimten = [
    ...u.input.vertrekken.map((r) => ({ r, soort: vertrekType(r.type).l })),
    ...u.input.overig.map((r) => ({ r, soort: overigType(r.type).l })),
  ];
  const buiten = u.input.buiten.ruimten
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

      {u.meldingen.length > 0 && (
        <section
          aria-label="Nakijken"
          className="rounded-md bg-orange px-3 py-2 text-orange-foreground"
        >
          <h3 className="font-semibold">Nakijken</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {u.meldingen.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
