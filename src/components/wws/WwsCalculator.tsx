import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  BUITEN_SOORTEN,
  INDEX_KLASSEN,
  LABELS,
  MONUMENT_KEUZES,
  OVERIG_TYPES,
  SEGMENT_NAMEN,
  VERTREK_TYPES,
  calc,
  ensureFac,
  eur,
  fmt,
  legeInput,
  num,
  r2,
  type Fac,
  type NumLike,
  type OverigeRuimte,
  type Segment,
  type Vertrek,
  type Normen,
  type VoorzDef,
  type WwsInput,
} from "@/lib/wws";
import {
  m2Berekend,
  ruimteOpmerking,
  verwijderMaat,
  voegMaatToe,
  zetM2,
  zetMaat,
} from "@/lib/wws/ruimteInvoer";
import type { Maat } from "@/lib/wws/types";
import { RUBRIEK_UITLEG, VINK_UITLEG } from "@/lib/wws/uitleg";
import {
  MINDER_DAN_40,
  exactTekst,
  huurLabel,
  opslagTekst,
  segmentSchaal,
} from "@/lib/wws/samenvatting";
import { useNormen } from "./NormenContext";
import Uitleg from "./Uitleg";

// ---------- bouwstenen ----------
const inputCls =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const knopCls =
  "rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const weg = "self-end px-2 py-1.5 text-sm text-muted-foreground hover:text-destructive";

function Veld({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-sm ${className}`}>
      <span className="truncate text-muted-foreground" title={label}>
        {label}
      </span>
      {children}
    </label>
  );
}
/** Tekstveld voor getallen; bewaart de invoer zoals getypt ("12,5"), net als wws-site.html */
function Getal({
  value,
  onChange,
  placeholder = "0",
  title,
}: {
  value: NumLike | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  title?: string | undefined;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      className={inputCls}
      title={title}
      value={value === 0 ? "" : (value ?? "")}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
/**
 * Lengte × breedte (m), meerdere maten; een minteken trekt een deel af — matenCell() in
 * wws-site.html. Het oppervlak volgt (zetMaat in ruimteInvoer.ts).
 */
function MatenVeld({
  maten,
  label,
  onZet,
  onToevoegen,
  onVerwijder,
}: {
  maten: Maat[] | undefined;
  label: string;
  onZet: (j: number, veld: "l" | "b", waarde: string) => void;
  onToevoegen: () => void;
  onVerwijder: (j: number) => void;
}) {
  const lijst = maten || [];
  const veld = (j: number, k: "l" | "b", v: NumLike, al: string) => (
    <input
      type="text"
      inputMode="decimal"
      className={inputCls + " w-20" + (num(v) < 0 ? " text-destructive" : "")}
      value={v ?? ""}
      placeholder="0,00"
      aria-label={al + " (" + label + ", maat " + (j + 1) + ")"}
      title="Gebruik een minteken om een deel af te trekken, bijv. -0,30 × 0,60 voor een meterkast"
      onChange={(e) => onZet(j, k, e.target.value)}
    />
  );
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">Lengte × breedte (m)</span>
      {lijst.map((m, j) => (
        <div key={j} className="flex items-center gap-1.5">
          {veld(j, "l", m.l, "Lengte in meter")}
          <span aria-hidden="true">×</span>
          {veld(j, "b", m.b, "Breedte in meter")}
          {lijst.length > 1 && (
            <button
              type="button"
              className="px-1.5 text-muted-foreground hover:text-destructive"
              aria-label={"Maat " + (j + 1) + " verwijderen (" + label + ")"}
              title="Maat verwijderen"
              onClick={() => onVerwijder(j)}
            >
              −
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="self-start text-sm text-primary hover:underline"
        onClick={onToevoegen}
      >
        + lengte × breedte
      </button>
    </div>
  );
}

function Vink({
  label,
  checked,
  onChange,
  uitleg,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  uitleg?: string;
}) {
  const vink = (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
  if (!uitleg) return vink;
  return (
    <div className="flex items-center gap-2">
      {vink}
      <Uitleg tekst={uitleg} over={label} />
    </div>
  );
}
function Keuze({
  value,
  onChange,
  opties,
}: {
  value: string;
  onChange: (v: string) => void;
  opties: [string, string][];
}) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {opties.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
function Teller({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: NumLike;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <Veld label={label}>
      <select
        className={inputCls}
        value={num(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {Array.from({ length: max + 1 }, (_, n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </Veld>
  );
}
function Sectie({
  titel,
  rubriek,
  children,
}: {
  titel: string;
  rubriek?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border py-6">
      <h2 className="mb-4 flex items-baseline gap-3 text-base font-semibold">
        <span className="w-8 text-right text-sm font-normal tabular-nums text-muted-foreground">
          {rubriek}
        </span>
        {titel}
        {rubriek && RUBRIEK_UITLEG[rubriek] && (
          <span className="self-center">
            <Uitleg tekst={RUBRIEK_UITLEG[rubriek]} over={titel} />
          </span>
        )}
      </h2>
      <div className="space-y-3 sm:pl-11">{children}</div>
    </section>
  );
}

/** Voorzieningenlijst zoals voorzBlock(): vinkje of aantal per voorziening. Keuze-groepen (kookplaat, oven, kraan) als één keuzelijst. */
function Voorzieningen({
  lijst,
  waarden,
  zet,
}: {
  lijst: readonly VoorzDef[];
  waarden: Record<string, unknown>;
  zet: (k: string, v: boolean | string | undefined) => void;
}) {
  const groepen = [...new Set(lijst.filter((it) => it.g).map((it) => it.g!))];
  const groepNaam: Record<string, string> = { kook: "Kookplaat", oven: "Oven", kraan: "Kraan" };
  return (
    <div className="space-y-3">
      {groepen.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {groepen.map((g) => {
            const items = lijst.filter((it) => it.g === g);
            const gekozen = items.find((it) => num(waarden[it.k]) > 0)?.k ?? "";
            return (
              <Veld key={g} label={groepNaam[g] ?? g}>
                <Keuze
                  value={gekozen}
                  onChange={(v) => {
                    items.forEach((it) => zet(it.k, undefined));
                    if (v) zet(v, true);
                  }}
                  opties={[
                    ["", "Geen"],
                    ...items.map(
                      (it) =>
                        [
                          it.k,
                          `${it.l.replace(/^Inbouw (kookplaat |oven )?/, "")} (${fmt(it.p)} p)`,
                        ] as [string, string],
                    ),
                  ]}
                />
              </Veld>
            );
          })}
        </div>
      )}
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {lijst
          .filter((it) => !it.g)
          .map((it) =>
            it.n ? (
              <div key={it.k} className="flex items-center gap-2 text-sm">
                <input
                  type="text"
                  inputMode="numeric"
                  className={`${inputCls} w-14`}
                  placeholder="0"
                  aria-label={`Aantal: ${it.l}`}
                  value={String(waarden[it.k] ?? "")}
                  onChange={(e) => zet(it.k, e.target.value)}
                />
                <span className="flex-1">{it.l}</span>
                <span className="tabular-nums text-muted-foreground">{fmt(it.p)} p/st</span>
              </div>
            ) : (
              <label key={it.k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={num(waarden[it.k]) > 0}
                  onChange={(e) => zet(it.k, e.target.checked || undefined)}
                />
                <span className="flex-1">{it.l}</span>
                <span className="tabular-nums text-muted-foreground">{fmt(it.p)} p</span>
              </label>
            ),
          )}
      </div>
    </div>
  );
}

// ---------- hoofdcomponent ----------
export interface WwsCalculatorProps {
  /** Gecontroleerd gebruik: de invoer komt van buiten (bv. een opgeslagen telling) */
  input?: WwsInput;
  setInput?: Dispatch<SetStateAction<WwsInput>>;
  /** Komt boven het formulier, onder de titel (bv. opslaan en versies) */
  boven?: ReactNode;
  /** Alleen bekijken: alle velden uitgeschakeld */
  alleenLezen?: boolean;
  /**
   * Na een gebruikersactie op een ruimte (soort gewijzigd, ruimte toegevoegd): de ruimte
   * aanvullen, bv. uit het PvE van de eigenaar. Muteert de ruimte. Alleen vanuit het formulier,
   * nooit bij het laden of bij "Toepassen op telling".
   */
  pasRuimteAan?: (groep: "vertrekken" | "overig", ruimte: Vertrek | OverigeRuimte) => void;
  /** Onder de energievelden (bv. het energielabel ophalen bij EP-Online) */
  energieExtra?: ReactNode;
  /** Onder de WOZ-velden (bv. de link naar het WOZ-waardeloket) */
  wozExtra?: ReactNode;
  /** Woningtype automatisch overgenomen (EP-Online): alleen-lezen met "wijzigen" */
  woningtypeVergrendeld?: { onOntgrendel: () => void } | undefined;
}

export default function WwsCalculator({
  input,
  setInput,
  boven,
  alleenLezen = false,
  pasRuimteAan,
  energieExtra,
  wozExtra,
  woningtypeVergrendeld,
}: WwsCalculatorProps = {}) {
  const N = useNormen();
  const [eigenInp, setEigenInp] = useState<WwsInput>(legeInput);
  const inp = input ?? eigenInp;
  const setInp = setInput ?? setEigenInp;
  const wijzig = (f: (d: WwsInput) => void) =>
    setInp((prev) => {
      const d = structuredClone(prev);
      f(d);
      return d;
    });
  const res = useMemo(() => calc(inp, N), [inp, N]);

  /** Paneel met voorzieningen van een ruimte (keuken, badkamer, toilet, …) */
  const facPaneel = (fac: Fac, zetFac: (f: (x: Fac) => void) => void) => {
    if (fac.kind === "keuken") {
      const k = fac.keuken;
      return (
        <>
          <Veld label="Lengte aanrecht" className="max-w-xs">
            <Keuze
              value={k.lengte}
              onChange={(v) =>
                zetFac((f) => {
                  if (f.kind === "keuken") f.keuken.lengte = v as typeof k.lengte;
                })
              }
              opties={[
                ["<1", "Korter dan 1 m (0 p)"],
                ["1-2", "1 tot 2 m (4 p)"],
                [">=2", "Langer dan 2 m (7 p)"],
              ]}
            />
          </Veld>
          <p className="text-xs text-muted-foreground">
            Extra voorzieningen tellen samen maximaal de punten van het aanrecht.
          </p>
          <Voorzieningen
            lijst={N.voorzKeuken}
            waarden={k.voorz}
            zet={(key, v) =>
              zetFac((f) => {
                if (f.kind !== "keuken") return;
                const vz = f.keuken.voorz as Record<string, unknown>;
                if (v === undefined || v === "") delete vz[key];
                else vz[key] = v;
              })
            }
          />
        </>
      );
    }
    if (fac.kind === "badkamer") {
      const s = fac.san;
      const zet = (key: keyof typeof s, v: unknown) =>
        zetFac((f) => {
          if (f.kind === "badkamer") (f.san as Record<string, unknown>)[key] = v;
        });
      return (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Teller
              label="Staand toilet"
              value={s.toiletStaand}
              max={2}
              onChange={(n) => zet("toiletStaand", n)}
            />
            <Teller
              label="Hangend toilet"
              value={s.toiletHang}
              max={2}
              onChange={(n) => zet("toiletHang", n)}
            />
            <Teller
              label="Wastafel"
              value={s.wastafel}
              max={4}
              onChange={(n) => zet("wastafel", n)}
            />
            <Teller
              label="Meerpersoonswastafel"
              value={s.meerpers}
              max={2}
              onChange={(n) => zet("meerpers", n)}
            />
            <Teller label="Douche" value={s.douche} max={3} onChange={(n) => zet("douche", n)} />
            <Teller label="Bad" value={s.bad} max={2} onChange={(n) => zet("bad", n)} />
            <Teller
              label="Bad met douche"
              value={s.badDouche}
              max={2}
              onChange={(n) => zet("badDouche", n)}
            />
          </div>
          <Vink
            label="Voldoet aan de eisen: waterdichte vloer en wand, wastafel met mengkraan en spiegel, douche of bad met mengkraan"
            checked={s.eisenOk}
            onChange={(b) => zet("eisenOk", b)}
          />
          <p className="text-xs text-muted-foreground">
            Extra voorzieningen tellen samen maximaal de punten van douche en bad in deze ruimte.
          </p>
          <Voorzieningen
            lijst={N.voorzSan}
            waarden={s.voorz}
            zet={(key, v) =>
              zetFac((f) => {
                if (f.kind !== "badkamer") return;
                const vz = f.san.voorz as Record<string, unknown>;
                if (v === undefined || v === "") delete vz[key];
                else vz[key] = v;
              })
            }
          />
        </>
      );
    }
    if (fac.kind === "slaap_san") {
      const s = fac.san;
      const zet = (key: keyof typeof s, v: number) =>
        zetFac((f) => {
          if (f.kind === "slaap_san") f.san[key] = v;
        });
      return (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Teller
              label="Wastafel"
              value={s.wastafel}
              max={1}
              onChange={(n) => zet("wastafel", n)}
            />
            <Teller
              label="Meerpersoonswastafel"
              value={s.meerpers}
              max={1}
              onChange={(n) => zet("meerpers", n)}
            />
            <Teller label="Douche" value={s.douche} max={2} onChange={(n) => zet("douche", n)} />
            <Teller label="Bad" value={s.bad} max={1} onChange={(n) => zet("bad", n)} />
            <Teller
              label="Bad met douche"
              value={s.badDouche}
              max={1}
              onChange={(n) => zet("badDouche", n)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Buiten de badkamer telt maximaal 1 wastafel per ruimte.
          </p>
        </>
      );
    }
    if (fac.kind === "toilet") {
      return (
        <div className="flex flex-wrap items-end gap-4">
          <Veld label="Toilet" className="w-56">
            <Keuze
              value={fac.toilet.toilet}
              onChange={(v) =>
                zetFac((f) => {
                  if (f.kind === "toilet") f.toilet.toilet = v as "geen";
                })
              }
              opties={[
                ["geen", "Geen toilet"],
                ["staand", "Staand toilet (3 p)"],
                ["hangend", "Hangend toilet (3,75 p)"],
              ]}
            />
          </Veld>
          <Vink
            label="Fontein of wastafel (1 p)"
            checked={fac.toilet.fontein}
            onChange={(b) =>
              zetFac((f) => {
                if (f.kind === "toilet") f.toilet.fontein = b;
              })
            }
          />
        </div>
      );
    }
    return (
      <Vink
        label="Wastafel of uitstortgootsteen op waterleiding en riool (1 p)"
        checked={fac.was.wastafel}
        onChange={(b) =>
          zetFac((f) => {
            if (f.kind === "was") f.was.wastafel = b;
          })
        }
      />
    );
  };

  const ruimteLijst = (groep: "vertrekken" | "overig") => {
    const lijst = inp[groep];
    const types = groep === "vertrekken" ? VERTREK_TYPES : OVERIG_TYPES;
    return (
      <>
        {lijst.map((r, i) => (
          <div key={i} className="rounded-md border border-border p-3">
            <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_88px_auto_auto_auto]">
              <Veld label="Soort ruimte">
                <Keuze
                  value={r.type}
                  opties={types.map((t) => [t.k, t.l])}
                  onChange={(v) =>
                    wijzig((d) => {
                      const x = d[groep][i]!;
                      x.type = v as never;
                      ensureFac(groep, x, false);
                      pasRuimteAan?.(groep, x);
                    })
                  }
                />
              </Veld>
              <Veld label="Naam (optioneel)">
                <input
                  className={inputCls}
                  value={r.naam ?? ""}
                  onChange={(e) =>
                    wijzig((d) => {
                      d[groep][i]!.naam = e.target.value;
                    })
                  }
                />
              </Veld>
              <Veld label="m²">
                <Getal
                  value={r.m2}
                  placeholder="0,00"
                  title={m2Berekend(r) ? "Berekend uit lengte × breedte" : undefined}
                  onChange={(v) =>
                    wijzig((d) => {
                      d[groep][i] = zetM2(d[groep][i]!, v) as never;
                    })
                  }
                />
              </Veld>
              <Vink
                label="Verwarmd"
                checked={r.verwarmd}
                onChange={(b) =>
                  wijzig((d) => {
                    d[groep][i]!.verwarmd = b;
                  })
                }
              />
              {groep === "vertrekken" ? (
                <Vink
                  label="Verkoeld"
                  checked={!!inp.vertrekken[i]!.verkoeld}
                  onChange={(b) =>
                    wijzig((d) => {
                      d.vertrekken[i]!.verkoeld = b;
                    })
                  }
                />
              ) : (
                <span />
              )}
              <button
                type="button"
                className={weg}
                onClick={() =>
                  wijzig((d) => {
                    d[groep].splice(i, 1);
                  })
                }
              >
                Verwijderen
              </button>
            </div>
            <div className="mt-2">
              <MatenVeld
                maten={r.maten}
                label={r.naam || types.find((t) => t.k === r.type)?.l || "ruimte"}
                onZet={(j, veld, v) =>
                  wijzig((d) => {
                    d[groep][i] = zetMaat(d[groep][i]!, j, veld, v) as never;
                  })
                }
                onToevoegen={() =>
                  wijzig((d) => {
                    d[groep][i] = voegMaatToe(d[groep][i]!) as never;
                  })
                }
                onVerwijder={(j) =>
                  wijzig((d) => {
                    d[groep][i] = verwijderMaat(d[groep][i]!, j) as never;
                  })
                }
              />
            </div>
            <Opmerking o={ruimteOpmerking(groep, r, N)} />
            {r.fac && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                {r.fac.uitPve && (
                  <p
                    className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs"
                    role="note"
                  >
                    Overgenomen uit het standaard PvE van deze eigenaar. Controleer dit ter plekke
                    en pas aan waar nodig.
                  </p>
                )}
                {facPaneel(r.fac, (f) =>
                  wijzig((d) => {
                    const x = d[groep][i]!.fac;
                    if (!x) return;
                    f(x);
                    // met de hand aangepast: geen PvE-markering meer (zoals in wws-site.html)
                    delete x.uitPve;
                  }),
                )}
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          className={knopCls}
          onClick={() =>
            wijzig((d) => {
              if (groep === "vertrekken")
                d.vertrekken.push({
                  type: "slaapkamer",
                  naam: "",
                  m2: "",
                  maten: [{ l: "", b: "" }],
                  verwarmd: true,
                  verkoeld: false,
                });
              else
                d.overig.push({
                  type: "berging_in",
                  naam: "",
                  m2: "",
                  maten: [{ l: "", b: "" }],
                  verwarmd: false,
                });
              const nieuw = d[groep][d[groep].length - 1]!;
              pasRuimteAan?.(groep, nieuw);
            })
          }
        >
          {groep === "vertrekken" ? "Vertrek toevoegen" : "Ruimte toevoegen"}
        </button>
      </>
    );
  };

  const E = inp.energie;

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div>
        <header className="mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Puntentelling zelfstandige woonruimte
          </h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Vul de woning in; punten, segment en maximale huurprijs worden direct bijgewerkt.
            Normen: {N.naam}.
          </p>
        </header>

        {boven}

        <fieldset disabled={alleenLezen} className="m-0 min-w-0 border-0 p-0">
          <Sectie titel="Woning">
            <div className="flex max-w-md items-end gap-2">
              <Veld label="Woningtype" className="max-w-xs flex-1">
                <fieldset disabled={!!woningtypeVergrendeld} className="m-0 min-w-0 border-0 p-0">
                  <Keuze
                    value={inp.woningtype}
                    onChange={(v) =>
                      wijzig((d) => {
                        d.woningtype = v as WwsInput["woningtype"];
                      })
                    }
                    opties={[
                      ["eengezins", "Eengezinswoning"],
                      ["meergezins", "Meergezinswoning"],
                    ]}
                  />
                </fieldset>
              </Veld>
              {woningtypeVergrendeld && !alleenLezen && (
                <Ontgrendel onClick={woningtypeVergrendeld.onOntgrendel} veld="Woningtype" />
              )}
            </div>
          </Sectie>

          <Sectie titel="Vertrekken" rubriek="1">
            {ruimteLijst("vertrekken")}
          </Sectie>
          <Sectie titel="Overige ruimten" rubriek="2">
            {ruimteLijst("overig")}
            <p className="text-xs text-muted-foreground">
              Verwarming en verkoeling (rubriek 3) volgen uit de vinkjes bij de ruimten.
            </p>
          </Sectie>

          <Sectie titel="Energieprestatie" rubriek="4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Veld label="Grondslag">
                <Keuze
                  value={E.soort}
                  onChange={(v) =>
                    wijzig((d) => {
                      d.energie.soort = v as typeof E.soort;
                    })
                  }
                  opties={[
                    ["label", "Energielabel vanaf 2021 (NTA 8800)"],
                    ["labelOud", "Energielabel (vóór 2015)"],
                    ["index", "Energie-index (2015–2021)"],
                    ["bouwjaar", "Bouwjaar (geen geldig label)"],
                  ]}
                />
              </Veld>
              {(E.soort === "label" || E.soort === "labelOud") && (
                <Veld label="Labelklasse">
                  <Keuze
                    value={E.label}
                    onChange={(v) =>
                      wijzig((d) => {
                        d.energie.label = v as typeof E.label;
                      })
                    }
                    opties={[
                      ["", "Kies de labelklasse"],
                      ...LABELS.map((l) => [l, l] as [string, string]),
                      ["EPV", "Energieprestatievergoeding"],
                    ]}
                  />
                </Veld>
              )}
              {E.soort === "index" && (
                <Veld label="Energie-index">
                  <Keuze
                    value={E.indexKlasse}
                    onChange={(v) =>
                      wijzig((d) => {
                        d.energie.indexKlasse = v;
                      })
                    }
                    opties={[
                      ["", "Kies de klasse"],
                      ...INDEX_KLASSEN.map((k, x) => [String(x), k] as [string, string]),
                      ["EPV", "Energieprestatievergoeding"],
                    ]}
                  />
                </Veld>
              )}
              {E.soort !== "bouwjaar" && (
                <Veld label="Registratiedatum">
                  <input
                    type="date"
                    className={inputCls}
                    value={E.datum}
                    onChange={(e) =>
                      wijzig((d) => {
                        d.energie.datum = e.target.value;
                      })
                    }
                  />
                </Veld>
              )}
              <Veld label="Bouwjaar">
                <Getal
                  value={E.bouwjaar}
                  placeholder=""
                  onChange={(v) =>
                    wijzig((d) => {
                      d.energie.bouwjaar = v;
                    })
                  }
                />
              </Veld>
            </div>
            {energieExtra}
          </Sectie>

          <Sectie titel="Keuken en sanitair" rubriek="5–6">
            <p className="max-w-prose text-sm text-muted-foreground">
              Keukens, badkamers en toiletten vul je in bij de ruimte zelf: kies bij de vertrekken
              een Keuken, Woonkamer met open keuken, Badkamer of Slaapkamer met wastafel, en bij de
              overige ruimten een Toiletruimte of Wasruimte.
            </p>
          </Sectie>

          <Sectie titel="Woonvoorzieningen bij een handicap" rubriek="7">
            <Veld label="Netto-investering (€)" className="max-w-xs">
              <Getal
                value={inp.handicap.investering}
                onChange={(v) =>
                  wijzig((d) => {
                    d.handicap.investering = v;
                  })
                }
              />
            </Veld>
          </Sectie>

          <Sectie titel="Buitenruimten" rubriek="8">
            {inp.buiten.ruimten.map((b, i) => (
              <div
                key={i}
                className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_88px_auto]"
              >
                <Veld label="Soort">
                  <Keuze
                    value={b.soort}
                    opties={BUITEN_SOORTEN}
                    onChange={(v) =>
                      wijzig((d) => {
                        d.buiten.ruimten[i]!.soort = v as typeof b.soort;
                      })
                    }
                  />
                </Veld>
                <Veld label="Gebruik">
                  <Keuze
                    value={b.groep}
                    opties={[
                      ["priv", "Privé"],
                      ["gem", "Gemeenschappelijk"],
                    ]}
                    onChange={(v) =>
                      wijzig((d) => {
                        d.buiten.ruimten[i]!.groep = v as "priv";
                      })
                    }
                  />
                </Veld>
                <Veld label="m²">
                  <Getal
                    value={b.m2}
                    placeholder="0,00"
                    title={m2Berekend(b) ? "Berekend uit lengte × breedte" : undefined}
                    onChange={(v) =>
                      wijzig((d) => {
                        d.buiten.ruimten[i]!.m2 = v;
                      })
                    }
                  />
                </Veld>
                <button
                  type="button"
                  className={weg}
                  onClick={() =>
                    wijzig((d) => {
                      d.buiten.ruimten.splice(i, 1);
                    })
                  }
                >
                  Verwijderen
                </button>
                <div className="col-span-2 sm:col-span-4">
                  <MatenVeld
                    maten={b.maten}
                    label={BUITEN_SOORTEN.find(([k]) => k === b.soort)?.[1] ?? "buitenruimte"}
                    onZet={(j, veld, v) =>
                      wijzig((d) => {
                        d.buiten.ruimten[i] = zetMaat(d.buiten.ruimten[i]!, j, veld, v);
                      })
                    }
                    onToevoegen={() =>
                      wijzig((d) => {
                        d.buiten.ruimten[i] = voegMaatToe(d.buiten.ruimten[i]!);
                      })
                    }
                    onVerwijder={(j) =>
                      wijzig((d) => {
                        d.buiten.ruimten[i] = verwijderMaat(d.buiten.ruimten[i]!, j);
                      })
                    }
                  />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-3">
              <button
                type="button"
                className={knopCls}
                onClick={() =>
                  wijzig((d) => {
                    d.buiten.ruimten.push({
                      soort: "balkon",
                      groep: "priv",
                      m2: "",
                      maten: [{ l: "", b: "" }],
                    });
                  })
                }
              >
                Buitenruimte toevoegen
              </button>
              {inp.buiten.ruimten.some((b) => b.groep === "gem") && (
                <Veld label="Adressen met gebruiksrecht (gemeenschappelijk)" className="w-64">
                  <Getal
                    value={inp.buiten.gemAdressen}
                    onChange={(v) =>
                      wijzig((d) => {
                        d.buiten.gemAdressen = v;
                      })
                    }
                  />
                </Veld>
              )}
            </div>
          </Sectie>

          <Sectie titel="Gemeenschappelijke ruimten" rubriek="9">
            {(["vertrekken", "overig"] as const).map((g) =>
              inp.gem[g].map((r, i) => (
                <div
                  key={g + i}
                  className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_88px_auto]"
                >
                  <Veld
                    label={
                      g === "vertrekken"
                        ? "Gemeenschappelijk vertrek"
                        : "Gemeenschappelijke overige ruimte"
                    }
                  >
                    <Keuze
                      value={r.type}
                      opties={(g === "vertrekken" ? VERTREK_TYPES : OVERIG_TYPES).map((t) => [
                        t.k,
                        t.l,
                      ])}
                      onChange={(v) =>
                        wijzig((d) => {
                          d.gem[g][i]!.type = v as never;
                        })
                      }
                    />
                  </Veld>
                  <Veld label="m²">
                    <Getal
                      value={r.m2}
                      placeholder="0,00"
                      title={m2Berekend(r) ? "Berekend uit lengte × breedte" : undefined}
                      onChange={(v) =>
                        wijzig((d) => {
                          d.gem[g][i]!.m2 = v;
                        })
                      }
                    />
                  </Veld>
                  <button
                    type="button"
                    className={weg}
                    onClick={() =>
                      wijzig((d) => {
                        d.gem[g].splice(i, 1);
                      })
                    }
                  >
                    Verwijderen
                  </button>
                  <div className="col-span-2 sm:col-span-3">
                    <MatenVeld
                      maten={r.maten}
                      label={
                        (g === "vertrekken" ? VERTREK_TYPES : OVERIG_TYPES).find(
                          (t) => t.k === r.type,
                        )?.l ?? "ruimte"
                      }
                      onZet={(j, veld, v) =>
                        wijzig((d) => {
                          d.gem[g][i] = zetMaat(d.gem[g][i]!, j, veld, v);
                        })
                      }
                      onToevoegen={() =>
                        wijzig((d) => {
                          d.gem[g][i] = voegMaatToe(d.gem[g][i]!);
                        })
                      }
                      onVerwijder={(j) =>
                        wijzig((d) => {
                          d.gem[g][i] = verwijderMaat(d.gem[g][i]!, j);
                        })
                      }
                    />
                  </div>
                </div>
              )),
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={knopCls}
                onClick={() =>
                  wijzig((d) => {
                    d.gem.vertrekken.push({ type: "overig", m2: "", maten: [{ l: "", b: "" }] });
                  })
                }
              >
                Vertrek toevoegen
              </button>
              <button
                type="button"
                className={knopCls}
                onClick={() =>
                  wijzig((d) => {
                    d.gem.overig.push({ type: "berging_in", m2: "", maten: [{ l: "", b: "" }] });
                  })
                }
              >
                Overige ruimte toevoegen
              </button>
            </div>
            <div className="grid max-w-md grid-cols-2 gap-3">
              <Veld label="Punten voorzieningen">
                <Getal
                  value={inp.gem.voorzPunten}
                  onChange={(v) =>
                    wijzig((d) => {
                      d.gem.voorzPunten = v;
                    })
                  }
                />
              </Veld>
              <Veld label="Adressen met gebruiksrecht">
                <Getal
                  value={inp.gem.adressen}
                  onChange={(v) =>
                    wijzig((d) => {
                      d.gem.adressen = v;
                    })
                  }
                />
              </Veld>
            </div>
          </Sectie>

          <Sectie titel="Gemeenschappelijke parkeerruimten" rubriek="10">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Veld label="Type I (9 p)">
                <Getal
                  value={inp.parkeer.typeI}
                  onChange={(v) =>
                    wijzig((d) => {
                      d.parkeer.typeI = v;
                    })
                  }
                />
              </Veld>
              <Veld label="Type II (6 p)">
                <Getal
                  value={inp.parkeer.typeII}
                  onChange={(v) =>
                    wijzig((d) => {
                      d.parkeer.typeII = v;
                    })
                  }
                />
              </Veld>
              <Veld label="Type III (4 p)">
                <Getal
                  value={inp.parkeer.typeIII}
                  onChange={(v) =>
                    wijzig((d) => {
                      d.parkeer.typeIII = v;
                    })
                  }
                />
              </Veld>
              <Veld label="Laadpalen (2 p)">
                <Getal
                  value={inp.parkeer.laadpalen}
                  onChange={(v) =>
                    wijzig((d) => {
                      d.parkeer.laadpalen = v;
                    })
                  }
                />
              </Veld>
              <Veld label="Adressen">
                <Getal
                  value={inp.parkeer.adressen}
                  onChange={(v) =>
                    wijzig((d) => {
                      d.parkeer.adressen = v;
                    })
                  }
                />
              </Veld>
            </div>
          </Sectie>

          <Sectie titel="WOZ-waarde" rubriek="11">
            <div className="grid gap-3 sm:grid-cols-3">
              <Veld label="Soort">
                <Keuze
                  value={inp.woz.soort}
                  onChange={(v) =>
                    wijzig((d) => {
                      d.woz.soort = v as "woz";
                    })
                  }
                  opties={[
                    ["woz", "WOZ-beschikking"],
                    ["taxatie", `Taxatie (telt ${N.taxatiePct}%)`],
                    ["minimum", "Minimum WOZ-waarde"],
                  ]}
                />
              </Veld>
              {inp.woz.soort !== "minimum" && (
                <Veld label="Waarde (€)">
                  <Getal
                    value={inp.woz.waarde}
                    onChange={(v) =>
                      wijzig((d) => {
                        d.woz.waarde = v;
                      })
                    }
                  />
                </Veld>
              )}
              <Veld label="Kengetallen van jaar">
                <Keuze
                  value={inp.woz.jaar}
                  onChange={(v) =>
                    wijzig((d) => {
                      d.woz.jaar = v;
                    })
                  }
                  opties={Object.keys(N.woz)
                    .sort()
                    .reverse()
                    .map((j) => [j, j])}
                />
              </Veld>
            </div>
            <Vink
              label="Nieuwbouw 2015–2019 (minimaal 40 WOZ-punten vanaf 110 punten)"
              uitleg={VINK_UITLEG.nieuwbouw1519}
              checked={inp.woz.nieuwbouw1519}
              onChange={(b) =>
                wijzig((d) => {
                  d.woz.nieuwbouw1519 = b;
                })
              }
            />
            <Vink
              label="Kengetal kleine nieuwbouw COROP"
              uitleg={VINK_UITLEG.kleinCorop}
              checked={inp.woz.kleinCorop}
              onChange={(b) =>
                wijzig((d) => {
                  d.woz.kleinCorop = b;
                })
              }
            />
            {wozExtra}
          </Sectie>

          <Sectie titel="Bijzondere voorzieningen" rubriek="12">
            <Vink
              label="Aanbelfunctie met video en audio"
              checked={inp.bijz.aanbel}
              onChange={(b) =>
                wijzig((d) => {
                  d.bijz.aanbel = b;
                })
              }
            />
            <Veld label="Eigen laadpalen" className="w-40">
              <Getal
                value={inp.bijz.laadpalen}
                onChange={(v) =>
                  wijzig((d) => {
                    d.bijz.laadpalen = v;
                  })
                }
              />
            </Veld>
            <Vink
              label={`Zorgwoning (+${N.zorgPct}%)`}
              checked={inp.bijz.zorgwoning}
              onChange={(b) =>
                wijzig((d) => {
                  d.bijz.zorgwoning = b;
                })
              }
            />
          </Sectie>

          <Sectie titel="Monument en opslagen" rubriek="13">
            <Veld label="Monument" className="max-w-sm">
              <Keuze
                value={inp.opslag.keuze}
                onChange={(v) =>
                  wijzig((d) => {
                    d.opslag.keuze = v as typeof d.opslag.keuze;
                  })
                }
                opties={MONUMENT_KEUZES}
              />
            </Veld>
            <Vink
              label={`Nieuwbouw in de middensector (+${N.opslag.nieuwbouwPct}%)`}
              checked={inp.opslag.nieuwbouw}
              onChange={(b) =>
                wijzig((d) => {
                  d.opslag.nieuwbouw = b;
                })
              }
            />
          </Sectie>
        </fieldset>
      </div>

      {/* ---------- resultaat ---------- */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-lg border border-border bg-card p-5 text-card-foreground">
          <div className="flex items-baseline justify-between">
            <span className="text-5xl font-semibold tabular-nums tracking-tight">{res.totaal}</span>
            <span className="text-sm text-muted-foreground">punten</span>
          </div>
          <p className="text-xs text-muted-foreground">{exactTekst(res.exact)}</p>
          <SegmentBalk totaal={res.totaal} N={N} />
          <p className="mt-3">
            <span
              className={
                "inline-block rounded-full px-3 py-0.5 text-sm font-medium text-white " +
                SEG_KLEUR[res.seg]
              }
            >
              {SEGMENT_NAMEN[res.seg]}
            </span>
          </p>
          {/* renderSum(): het bedrag zonder opslag, met de opslagen eronder */}
          <div className="mt-3 rounded-lg bg-muted/60 px-4 py-3 text-sm">
            <div className="text-xs text-muted-foreground">{huurLabel(res.seg)}</div>
            <div>
              <b className="text-base tabular-nums">
                {res.maxHuur !== null ? eur(res.maxHuur) : "—"}
              </b>
              <span className="text-xs text-muted-foreground"> per maand</span>
            </div>
            {res.opslagPct > 0 && res.maxHuurOpslag !== null && res.maxHuur !== null && (
              <div className="mt-2 space-y-0.5 border-t border-border pt-2">
                <div className="flex justify-between gap-2">
                  <span>{opslagTekst(res.opslagen)}</span>
                  <span className="tabular-nums">{eur(r2(res.maxHuurOpslag - res.maxHuur))}</span>
                </div>
                <div className="flex justify-between gap-2 font-semibold">
                  <span>Inclusief opslagen</span>
                  <span className="tabular-nums">{eur(res.maxHuurOpslag)}</span>
                </div>
              </div>
            )}
            {res.seg !== "hoog" && res.totaal < 40 && (
              <div className="mt-1.5 text-xs text-muted-foreground">{MINDER_DAN_40}</div>
            )}
          </div>

          {res.warn.length > 0 && (
            <ul
              className="mt-4 list-disc space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 py-3 pl-7 pr-3 text-sm"
              role="status"
            >
              {res.warn.map((w, k) => (
                <li key={k}>{w}</li>
              ))}
            </ul>
          )}

          <table className="mt-4 w-full text-sm">
            <tbody>
              {res.rows.map((r, k) => (
                <tr key={k} className="border-t border-border align-top">
                  <td className="w-7 py-2 pr-2 tabular-nums text-muted-foreground">{r.nr}</td>
                  <td className="py-2 pr-2">
                    <div>{r.naam}</div>
                    <div className="text-xs text-muted-foreground">{r.t}</div>
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">{fmt(r.p)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-foreground/60">
                <td />
                <td className="py-2">
                  Totaal{" "}
                  <span className="text-xs text-muted-foreground">(exact {fmt(res.exact)})</span>
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">{res.totaal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
}

const SEG_KLEUR: Record<Segment, string> = {
  laag: "bg-seg-laag",
  midden: "bg-seg-midden",
  hoog: "bg-seg-hoog",
};

/** Gekleurde segmentbalk met de markering van het totaal — .segwrap in wws-site.html */
function SegmentBalk({ totaal, N }: { totaal: number; N: Normen }) {
  const s = segmentSchaal(totaal, N);
  return (
    <div className="mt-2">
      <div className="relative pt-5">
        <div
          className="absolute top-0 -translate-x-1/2 text-[11px] font-bold tabular-nums"
          style={{ left: s.marker + "%" }}
          aria-hidden="true"
        >
          {totaal}
          <div className="mx-auto mt-0.5 h-[18px] w-0.5 bg-foreground" />
        </div>
        <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
          <span className="bg-seg-laag" style={{ width: s.laag + "%" }} />
          <span className="bg-seg-midden" style={{ width: s.midden + "%" }} />
          <span className="flex-1 bg-seg-hoog" />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>0</span>
        <span>t/m {N.grensLaag}</span>
        <span>t/m {N.grensMidden}</span>
        <span>{s.max}</span>
      </div>
    </div>
  );
}

/** Opmerking onder een ruimte (verkeersruimte, te klein, herkomst van de plattegrond) */
function Opmerking({ o }: { o: ReturnType<typeof ruimteOpmerking> }) {
  if (!o) return null;
  return (
    <p className={"mt-1 text-xs " + (o.ingeschat ? "text-orange-600" : "text-muted-foreground")}>
      {o.tekst}
    </p>
  );
}

/** "wijzigen" bij een automatisch overgenomen veld — data-unlockauto in wws-site.html */
export function Ontgrendel({ onClick, veld }: { onClick: () => void; veld: string }) {
  return (
    <button
      type="button"
      className="mb-1.5 text-xs text-primary hover:underline"
      title="Automatisch overgenomen. Klik om dit veld zelf aan te passen."
      aria-label={veld + " zelf wijzigen (automatisch overgenomen)"}
      onClick={onClick}
    >
      wijzigen
    </button>
  );
}
