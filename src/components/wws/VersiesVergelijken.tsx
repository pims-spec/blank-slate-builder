import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { eur, fmt, SEGMENT_NAMEN, type Normen, type WwsInput } from "@/lib/wws";
import type { Versie } from "@/lib/wws/opslag";
import {
  diffInvoer,
  rubriekVerschillen,
  uitVersie,
  uitWerkversie,
  type Vergelijkbaar,
} from "@/lib/wws/versieDiff";

const selCls =
  "h-9 w-full rounded-lg border border-transparent bg-muted px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versies: readonly Versie[];
  /** De werkversie (ook te kiezen), live berekend met de huidige normen */
  werkInput: WwsInput;
  normen: Normen;
}

/** Versies vergelijken — #dlgVersieDiff in wws-site.html; alleen lezen, ook voor de kijkrol */
export default function VersiesVergelijken(p: Props) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Versies vergelijken</DialogTitle>
          <DialogDescription>
            Kies twee versies (of de werkversie) om punten, huur en invoer te vergelijken.
          </DialogDescription>
        </DialogHeader>
        {p.open && <Inhoud {...p} />}
      </DialogContent>
    </Dialog>
  );
}

function Inhoud({ versies, werkInput, normen }: Props) {
  const keuzes = useMemo<Vergelijkbaar[]>(
    () => [
      ...versies
        .slice()
        .sort((a, b) => a.nr - b.nr)
        .map(uitVersie),
      uitWerkversie(werkInput, normen),
    ],
    [versies, werkInput, normen],
  );
  // zoals de bron: A = oudste versie, B = nieuwste versie (of de werkversie als er maar één is)
  const [a, setA] = useState(keuzes[0]!.sleutel);
  const [b, setB] = useState(
    keuzes.length > 2 ? keuzes[keuzes.length - 2]!.sleutel : keuzes[keuzes.length - 1]!.sleutel,
  );
  const vA = keuzes.find((k) => k.sleutel === a) ?? keuzes[0]!;
  const vB = keuzes.find((k) => k.sleutel === b) ?? keuzes[keuzes.length - 1]!;
  const kort = (v: Vergelijkbaar) => (v.sleutel === "werk" ? "werkversie" : v.sleutel);

  const dPunten = vA.totaal != null && vB.totaal != null ? vB.totaal - vA.totaal : null;
  const dHuur = vA.maxHuur != null && vB.maxHuur != null ? vB.maxHuur - vA.maxHuur : null;
  const kleur = (d: number | null) =>
    d == null || d === 0 ? "" : d > 0 ? "text-emerald-700" : "text-destructive";
  const teken = (d: number | null) => (d == null ? "–" : (d > 0 ? "+" : "") + fmt(d, 0));
  const rubrieken = rubriekVerschillen(vA.rows, vB.rows).filter((x) => x.a !== 0 || x.b !== 0);
  const velden = diffInvoer(vA.input, vB.input);

  const kies = (waarde: string, zet: (s: string) => void, label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select className={selCls} value={waarde} onChange={(e) => zet(e.target.value)}>
        {keuzes.map((k) => (
          <option key={k.sleutel} value={k.sleutel}>
            {k.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="min-w-0 space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        {kies(a, setA, "Versie A")}
        {kies(b, setB, "Versie B")}
      </div>
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Samenvatting">
        <Stat label={"Punten: " + kort(vA) + " → " + kort(vB)} cls={kleur(dPunten)}>
          {vA.totaal ?? "–"} → {vB.totaal ?? "–"} ({teken(dPunten)})
        </Stat>
        <Stat label="Max. huur" cls={kleur(dHuur)}>
          {vA.maxHuur != null ? eur(vA.maxHuur) : "–"} →{" "}
          {vB.maxHuur != null ? eur(vB.maxHuur) : "–"}
          {dHuur != null ? " (" + (dHuur > 0 ? "+" : "") + eur(dHuur) + ")" : ""}
        </Stat>
        <Stat label="Segment">
          {vA.seg ? SEGMENT_NAMEN[vA.seg] : "–"} → {vB.seg ? SEGMENT_NAMEN[vB.seg] : "–"}
        </Stat>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" aria-label="Punten per rubriek">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="p-1">Rubriek</th>
              <th className="p-1 text-right">{kort(vA)}</th>
              <th className="p-1 text-right">{kort(vB)}</th>
              <th className="p-1 text-right">Verschil</th>
            </tr>
          </thead>
          <tbody>
            {rubrieken.map((r) => (
              <tr key={r.nr} className="border-t border-border">
                <td className="p-1">{r.naam}</td>
                <td className="p-1 text-right tabular-nums">{fmt(r.a)}</td>
                <td className="p-1 text-right tabular-nums">{fmt(r.b)}</td>
                <td className={"p-1 text-right tabular-nums " + kleur(r.verschil)}>
                  {r.verschil === 0 ? "" : (r.verschil > 0 ? "+" : "") + fmt(r.verschil)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {velden.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="Gewijzigde invoer">
            <thead className="text-muted-foreground">
              <tr>
                <th className="p-1">Veld</th>
                <th className="p-1">{kort(vA)}</th>
                <th className="p-1">{kort(vB)}</th>
              </tr>
            </thead>
            <tbody>
              {velden.map((d) => (
                <tr key={d.pad} className="border-t border-border align-top">
                  <td className="break-all p-1 font-mono">{d.pad}</td>
                  <td className="p-1 text-muted-foreground line-through">{d.van}</td>
                  <td className="p-1">{d.naar}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground">
          Geen verschillen in de invoer tussen deze twee versies.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  cls = "",
  children,
}: {
  label: string;
  cls?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"font-medium " + cls}>{children}</div>
    </div>
  );
}
