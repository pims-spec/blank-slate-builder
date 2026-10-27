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
import { OVERIG_TYPES, VERTREK_TYPES, fmt, type VoorzDef } from "@/lib/wws";
import { autoVerwarmd } from "@/lib/wws/indeling";
import { pveVoorFormulier, type Pve, type PveWerk } from "@/lib/wws/pve";
import type { FacBadkamer, FacKeuken, FacToilet } from "@/lib/wws/types";
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
  "h-9 rounded-lg border border-transparent bg-muted px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
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
        <KeukenVelden waarde={k.keuken} wijzig={(f) => zet((w) => f(w.keuken!.keuken))} />
      </Onderdeel>

      <Onderdeel
        label="Standaard badkamer/sanitair instellen"
        actief={b.actief}
        zetActief={(a) => zet((w) => void (w.badkamer!.actief = a))}
      >
        <BadkamerVelden waarde={b.san} wijzig={(f) => zet((w) => f(w.badkamer!.san))} />
      </Onderdeel>

      <Onderdeel
        label="Standaard toiletruimte instellen"
        actief={t.actief}
        zetActief={(a) => zet((w) => void (w.toilet!.actief = a))}
      >
        <ToiletVelden waarde={t.toilet} wijzig={(f) => zet((w) => f(w.toilet!.toilet))} />
      </Onderdeel>

      <IndelingWensen
        waarde={werk.indeling}
        zet={(f) =>
          zet((w) => {
            const ind = (w.indeling && typeof w.indeling === "object" ? w.indeling : {}) as Wensen;
            f(ind);
            w.indeling = ind;
          })
        }
      />

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

/** Wijzigt (een kopie van) de waarde; de aanroeper zorgt voor het kopiëren */
type Wijzig<T> = (f: (w: T) => void) => void;

/** Aanrecht en keukenvoorzieningen; ook voor "wat komt er in de woning" in het indelingsadvies */
export function KeukenVelden({
  waarde,
  wijzig,
}: {
  waarde: FacKeuken["keuken"];
  wijzig: Wijzig<FacKeuken["keuken"]>;
}) {
  const N = useNormen();
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Lengte aanrecht</span>
        <select
          className={selCls + " max-w-xs"}
          value={waarde.lengte}
          onChange={(e) =>
            wijzig((k) => void (k.lengte = e.target.value as FacKeuken["keuken"]["lengte"]))
          }
        >
          <option value="<1">Korter dan 1 m (0 p)</option>
          <option value="1-2">1 tot 2 m (4 p)</option>
          <option value=">=2">Langer dan 2 m (7 p)</option>
        </select>
      </label>
      <Voorzieningen
        lijst={N.voorzKeuken}
        waarden={waarde.voorz as Record<string, unknown>}
        zet={(key, v) =>
          wijzig((k) => {
            const vz = k.voorz as Record<string, unknown>;
            if (v === undefined) delete vz[key];
            else vz[key] = v;
          })
        }
      />
    </>
  );
}

/** Sanitair en voorzieningen van een badkamer */
export function BadkamerVelden({
  waarde,
  wijzig,
}: {
  waarde: FacBadkamer["san"];
  wijzig: Wijzig<FacBadkamer["san"]>;
}) {
  const N = useNormen();
  return (
    <>
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
        ).map(([label, key, max]) => (
          <label key={key} className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <select
              className={selCls}
              value={Number(waarde[key]) || 0}
              onChange={(e) => wijzig((b) => void (b[key] = +e.target.value))}
            >
              {Array.from({ length: max + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className={vinkCls}
          checked={waarde.eisenOk}
          onChange={(e) => wijzig((b) => void (b.eisenOk = e.target.checked))}
        />
        Voldoet aan de eisen (waterdichte vloer/wand, mengkraan, spiegel)
      </label>
      <Voorzieningen
        lijst={N.voorzSan}
        waarden={waarde.voorz as Record<string, unknown>}
        zet={(key, v) =>
          wijzig((b) => {
            const vz = b.voorz as Record<string, unknown>;
            if (v === undefined) delete vz[key];
            else vz[key] = v;
          })
        }
      />
    </>
  );
}

/** Toilet en fontein van een toiletruimte */
export function ToiletVelden({
  waarde,
  wijzig,
}: {
  waarde: FacToilet["toilet"];
  wijzig: Wijzig<FacToilet["toilet"]>;
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Toilet</span>
        <select
          className={selCls + " max-w-xs"}
          value={waarde.toilet}
          onChange={(e) =>
            wijzig((t) => void (t.toilet = e.target.value as FacToilet["toilet"]["toilet"]))
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
          checked={waarde.fontein}
          onChange={(e) => wijzig((t) => void (t.fontein = e.target.checked))}
        />
        Fontein of wastafel in de toiletruimte (1 p)
      </label>
    </>
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
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
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

interface Wensen {
  apartToilet?: string;
  wasruimte?: string;
  keuken?: string;
  slaapkamers?: string;
  verwarmd?: Record<string, boolean>;
  [extra: string]: unknown;
}

/**
 * Indelingswensen voor het indelingsadvies: welke ruimten worden voorgesteld, niet hun
 * uitrusting — het indeling-deel van renderKlantPve() in wws-site.html.
 */
function IndelingWensen({
  waarde,
  zet,
}: {
  waarde: unknown;
  zet: (f: (w: Wensen) => void) => void;
}) {
  const w = (waarde && typeof waarde === "object" ? waarde : {}) as Wensen;
  const keuze = (
    label: string,
    veld: "apartToilet" | "wasruimte" | "keuken",
    opties: [string, string][],
  ) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        className={selCls}
        value={w[veld] || "auto"}
        onChange={(e) => zet((x) => void (x[veld] = e.target.value))}
      >
        {opties.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const verwarmd = (key: "vertrekken" | "overig", t: { k: string; l: string }) => {
    const k = key + ":" + t.k;
    const aan =
      w.verwarmd && Object.prototype.hasOwnProperty.call(w.verwarmd, k)
        ? !!w.verwarmd[k]
        : autoVerwarmd(key, t.k);
    return (
      <label key={k} className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className={vinkCls}
          checked={aan}
          onChange={(e) =>
            zet((x) => {
              x.verwarmd = { ...(x.verwarmd || {}), [k]: e.target.checked };
            })
          }
        />
        {t.l}
      </label>
    );
  };
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">
        Indelingswensen (voor het indelingsadvies)
      </legend>
      <p className="text-xs text-muted-foreground">
        Dit gaat niet over de uitrusting hierboven, maar over welke ruimten het indelingsadvies
        voorstelt wanneer je dit PvE daar kiest.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {keuze("Aparte toiletruimte", "apartToilet", [
          ["auto", "Standaard (aparte toiletruimte)"],
          ["ja", "Altijd een aparte toiletruimte"],
          ["nee", "Geen aparte toiletruimte — toilet in de badkamer"],
        ])}
        {keuze("Aparte wasruimte", "wasruimte", [
          ["auto", "Standaard (alleen als die er al was)"],
          ["ja", "Altijd een aparte wasruimte toevoegen"],
          ["nee", "Nooit een aparte wasruimte"],
        ])}
        {keuze("Keuken", "keuken", [
          ["auto", "Standaard (aparte keuken)"],
          ["apart", "Altijd een aparte keuken"],
          ["open", "Woonkamer met open keuken (geen losse keukenruimte)"],
        ])}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Gewenst aantal slaapkamers (optioneel)</span>
          <Input
            inputMode="numeric"
            placeholder="bijv. 3"
            value={w.slaapkamers ?? ""}
            onChange={(e) => zet((x) => void (x.slaapkamers = e.target.value))}
          />
        </label>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          Standaard verwarmd bij het indelingsadvies
        </p>
        <p className="mb-1 text-xs text-muted-foreground">
          Bepaalt of een voorgestelde ruimte van dit type als verwarmd wordt meegeteld. Vink uit wat
          normaal niet wordt verwarmd.
        </p>
        <div className="grid gap-1 sm:grid-cols-2">
          {VERTREK_TYPES.map((t) => verwarmd("vertrekken", t))}
          {OVERIG_TYPES.map((t) => verwarmd("overig", t))}
        </div>
      </div>
    </fieldset>
  );
}
