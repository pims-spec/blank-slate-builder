import { useState, type ReactNode } from "react";
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
import { fmt, type VoorzDef } from "@/lib/wws";
import { pveVoorFormulier, type Pve, type PveWerk } from "@/lib/wws/pve";
import { useNormen } from "./NormenContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bestaand PvE, of null voor een nieuw PvE */
  pve: Pve | null;
  eigenaarNaam: string;
  bezig: boolean;
  onOpslaan: (werk: PveWerk, naam: string) => void;
}

const selCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const vinkCls = "size-4 accent-primary";

/**
 * Eén PvE bewerken: standaard keuken, badkamer en toiletruimte — renderKlantPve() in
 * wws-site.html. De indelingswensen staan (nog) niet in het formulier maar blijven bewaard.
 */
export default function PveDialoog(p: Props) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {p.pve ? "PvE bewerken" : "Nieuw PvE"} — {p.eigenaarNaam}
          </DialogTitle>
          <DialogDescription>
            Standaarduitrusting die bij het koppelen van deze eigenaar wordt voorgesteld. Alleen
            ruimten die nog niet met de hand zijn ingevuld worden aangevuld.
          </DialogDescription>
        </DialogHeader>
        {p.open && <PveFormulier {...p} />}
      </DialogContent>
    </Dialog>
  );
}

function PveFormulier({ pve, bezig, onOpslaan, onOpenChange }: Props) {
  const N = useNormen();
  const [werk, setWerk] = useState<PveWerk>(() => pveVoorFormulier(pve));
  const [naam, setNaam] = useState(pve?.naam ?? "");
  const k = werk.keuken!;
  const b = werk.badkamer!;
  const t = werk.toilet!;

  /** Wijzig het werkexemplaar (op een kopie) */
  const zet = (f: (w: PveWerk) => void) =>
    setWerk((w) => {
      const n = structuredClone(w);
      f(n);
      return n;
    });

  const teller = (label: string, max: number, waarde: unknown, zetW: (n: number) => void) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className={selCls}
        value={Number(waarde) || 0}
        onChange={(e) => zetW(+e.target.value)}
      >
        {Array.from({ length: max + 1 }, (_, n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onOpslaan(werk, naam);
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Naam van dit PvE</span>
        <Input
          autoFocus
          value={naam}
          maxLength={120}
          placeholder="Bijv. Standaard, Renovatie 2024"
          onChange={(e) => setNaam(e.target.value)}
        />
      </label>

      <Onderdeel
        label="Standaard keukenuitrusting instellen"
        actief={k.actief}
        zetActief={(a) => zet((w) => void (w.keuken!.actief = a))}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Lengte aanrecht</span>
          <select
            className={selCls + " max-w-xs"}
            value={k.keuken.lengte}
            onChange={(e) =>
              zet((w) => void (w.keuken!.keuken.lengte = e.target.value as typeof k.keuken.lengte))
            }
          >
            <option value="<1">Korter dan 1 m (0 p)</option>
            <option value="1-2">1 tot 2 m (4 p)</option>
            <option value=">=2">Langer dan 2 m (7 p)</option>
          </select>
        </label>
        <Voorzieningen
          lijst={N.voorzKeuken}
          waarden={k.keuken.voorz as Record<string, unknown>}
          zet={(key, v) =>
            zet((w) => {
              const vz = w.keuken!.keuken.voorz as Record<string, unknown>;
              if (v === undefined) delete vz[key];
              else vz[key] = v;
            })
          }
        />
      </Onderdeel>

      <Onderdeel
        label="Standaard badkamer/sanitair instellen"
        actief={b.actief}
        zetActief={(a) => zet((w) => void (w.badkamer!.actief = a))}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Staand toilet", "toiletStaand", 2],
              ["Hangend toilet", "toiletHang", 2],
              ["Wastafel", "wastafel", 4],
              ["Meerpersoonswastafel", "meerpers", 2],
              ["Douche", "douche", 3],
              ["Bad", "bad", 2],
              ["Bad met douche", "badDouche", 2],
            ] as const
          ).map(([label, key, max]) =>
            teller(label, max, b.san[key], (n) => zet((w) => void (w.badkamer!.san[key] = n))),
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={vinkCls}
            checked={b.san.eisenOk}
            onChange={(e) => zet((w) => void (w.badkamer!.san.eisenOk = e.target.checked))}
          />
          Voldoet aan de eisen (waterdichte vloer/wand, mengkraan, spiegel)
        </label>
        <Voorzieningen
          lijst={N.voorzSan}
          waarden={b.san.voorz as Record<string, unknown>}
          zet={(key, v) =>
            zet((w) => {
              const vz = w.badkamer!.san.voorz as Record<string, unknown>;
              if (v === undefined) delete vz[key];
              else vz[key] = v;
            })
          }
        />
      </Onderdeel>

      <Onderdeel
        label="Standaard toiletruimte instellen"
        actief={t.actief}
        zetActief={(a) => zet((w) => void (w.toilet!.actief = a))}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Toilet</span>
          <select
            className={selCls + " max-w-xs"}
            value={t.toilet.toilet}
            onChange={(e) =>
              zet((w) => void (w.toilet!.toilet.toilet = e.target.value as typeof t.toilet.toilet))
            }
          >
            <option value="geen">Geen toilet</option>
            <option value="staand">Staand toilet (3 p)</option>
            <option value="hangend">Hangend toilet (3,75 p)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={vinkCls}
            checked={t.toilet.fontein}
            onChange={(e) => zet((w) => void (w.toilet!.toilet.fontein = e.target.checked))}
          />
          Fontein of wastafel in de toiletruimte (1 p)
        </label>
      </Onderdeel>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Annuleren
        </Button>
        <Button type="submit" disabled={bezig}>
          Opslaan
        </Button>
      </DialogFooter>
    </form>
  );
}

function Onderdeel({
  label,
  actief,
  zetActief,
  children,
}: {
  label: string;
  actief: boolean;
  zetActief: (a: boolean) => void;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className={vinkCls}
          checked={actief}
          onChange={(e) => zetActief(e.target.checked)}
        />
        {label}
      </label>
      {actief && children}
    </fieldset>
  );
}

/** Standaard voorzieningen: vinkje, of een aantal bij voorzieningen per stuk — pveVoorzBlock() */
function Voorzieningen({
  lijst,
  waarden,
  zet,
}: {
  lijst: readonly VoorzDef[];
  waarden: Record<string, unknown>;
  zet: (key: string, v: unknown) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">Standaard voorzieningen</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {lijst.map((it) => (
          <label key={it.k} className="flex items-center gap-2 text-sm">
            {it.n ? (
              <Input
                aria-label={"Aantal " + it.l}
                inputMode="numeric"
                placeholder="0"
                className="h-7 w-14 px-2"
                value={String(waarden[it.k] ?? "")}
                onChange={(e) => zet(it.k, e.target.value === "" ? undefined : e.target.value)}
              />
            ) : (
              <input
                type="checkbox"
                className={vinkCls}
                checked={!!waarden[it.k]}
                onChange={(e) => zet(it.k, e.target.checked ? true : undefined)}
              />
            )}
            <span className="flex-1">{it.l}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {fmt(it.p)}
              {it.n ? " p/st" : " p"}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
