import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SEGMENT_NAMEN, eur, fmt, num, overigType, vertrekType, type WwsInput } from "@/lib/wws";
import {
  berekenVarianten,
  blokjes,
  ruimteToevoegen,
  ruimtenUitTelling,
  ruimteWijzigen,
  toepassen,
  vloerplanLayout,
  type IndelingRuimte,
  type IndelingStatus,
  type IndelingVariant,
  type RuimteWijziging,
} from "@/lib/wws/indeling";
import { maakVariantAfbeelding } from "@/lib/wws/ai/ai.functions";
import type { Afbeelding } from "@/lib/wws/ai/dienst";
import { aiMelding, gebruikTekst } from "@/lib/wws/ai/meldingen";
import type { Gebruik } from "@/lib/wws/ai/vragen";
import { base64NaarBytes, naarDataUrl } from "@/lib/wws/plattegrond/beeld";
import { schemaDataUrl, type SchemaCanvas } from "@/lib/wws/schemaTekening";
import { volgendeStatus } from "@/lib/wws/tekenen";
import PlattegrondTekenen from "./PlattegrondTekenen";
import type { NieuwBeeld } from "./plattegrondBeeld";
import type { Klant } from "@/lib/wws/opslag";
import { actievePves } from "@/lib/wws/pve";
import { useNormen } from "./NormenContext";

const FAC_LABEL: Record<string, string> = {
  keuken: "keuken",
  badkamer: "badkamer",
  slaap_san: "wastafel/douche",
  toilet: "toilet",
  was: "wasruimte",
};
const STATUS_LABEL: Record<IndelingStatus, string> = {
  vrij: "Vrij herindelen",
  vast: "Vast houden",
  negeren: "Vervalt",
};
const STAPPEN = [
  ["eigenaar", "Eigenaar"],
  ["kamers", "Ruimten"],
  ["resultaten", "Varianten"],
] as const;
type Stap = (typeof STAPPEN)[number][0];

const selCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Ontbreekt het energielabel (of index/bouwjaar)? Dan kloppen de puntentotalen niet — energieOntbreekt() */
function energieOntbreekt(E: WwsInput["energie"]): boolean {
  if (E.soort === "label" || E.soort === "labelOud") return !E.label;
  if (E.soort === "bouwjaar") return !num(E.bouwjaar);
  if (E.soort === "index") return E.indexKlasse === "";
  return false;
}

export interface IndelingKeuze {
  /** Eigenaar uit stap 1 (wordt bij toepassen aan de telling gekoppeld) */
  klantId: string;
  /** Gebruikt PvE (leeg = geen) — voor later stil invullen met hetzelfde PvE */
  pveId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: WwsInput;
  /** Huidige eigenaar en PvE van de telling (startwaarden van stap 1) */
  klantId: string;
  pveId: string;
  klanten: readonly Klant[];
  /** Uit bij alleen-lezen */
  magToepassen: boolean;
  /** De plattegrond om op te tekenen (object- of data-URL); null = geen */
  plattegrondUrl: string | null;
  /** De plattegrond als afbeelding voor de AI (JPEG, base64); null = geen */
  plattegrondVoorAi: () => Promise<Afbeelding | null>;
  /** Tekenen op de plattegrond wijzigt de telling zelf (werkversie), zoals in de bron */
  onInputWijziging: (input: WwsInput) => void;
  /** Toepassen; beeld = de AI-afbeelding of het blokkenschema als nieuwe plattegrond */
  onToepassen: (
    input: WwsInput,
    keuze: IndelingKeuze,
    v: IndelingVariant,
    beeld: NieuwBeeld | null,
    /** beeld is de AI-afbeelding (anders het blokkenschema) */
    ai: boolean,
  ) => void;
}

/**
 * Indelingsadvies: programma-varianten voor de woning (aantal slaapkamers) met WWS-punten en
 * een schematische plattegrond — de stappen Eigenaar, Ruimten en Varianten uit wws-site.html.
 * Plattegrond inlezen (Claude) en een AI-afbeelding (Gemini) volgen in fase 4.
 */
export default function IndelingDialoog(p: Props) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Indelingsadvies</DialogTitle>
          <DialogDescription>
            Varianten voor de indeling van deze woning, met het WWS-puntentotaal per variant.
          </DialogDescription>
        </DialogHeader>
        {p.open && <IndelingInhoud {...p} />}
      </DialogContent>
    </Dialog>
  );
}

function IndelingInhoud({
  input: startInput,
  klantId: startKlant,
  pveId: startPve,
  klanten,
  magToepassen,
  plattegrondUrl,
  plattegrondVoorAi,
  onInputWijziging,
  onToepassen,
}: Props) {
  const N = useNormen();
  const [stap, setStap] = useState<Stap>("eigenaar");
  const [klantId, setKlantId] = useState(startKlant);
  const standaardPve = (kid: string, voorkeur: string) => {
    const actief = actievePves(klanten.find((k) => k.id === kid)?.pves ?? []);
    return actief.some((x) => x.id === voorkeur)
      ? voorkeur
      : actief.length === 1
        ? actief[0]!.id
        : "";
  };
  const [pveId, setPveId] = useState(() => standaardPve(startKlant, startPve));
  // werkversie in het venster: tekenen wijzigt ruimten én de telling (zoals de bron)
  const [werk, setWerk] = useState(() => ({
    input: startInput,
    rooms: ruimtenUitTelling(startInput),
  }));
  const werkRef = useRef(werk);
  werkRef.current = werk;
  const { input, rooms } = werk;
  const setRooms = (f: (r: IndelingRuimte[]) => IndelingRuimte[]) =>
    setWerk((w) => ({ ...w, rooms: f(w.rooms) }));
  const wijzig = (nieuw: { input: WwsInput; rooms: IndelingRuimte[] }) => {
    werkRef.current = nieuw;
    setWerk(nieuw);
    onInputWijziging(nieuw.input);
  };
  const [ai, setAi] = useState<Record<number, AiStaat>>({});
  const [extraSlaap, setExtraSlaap] = useState("");
  const [varianten, setVarianten] = useState<IndelingVariant[]>([]);

  const klant = klanten.find((k) => k.id === klantId) ?? null;
  const actief = actievePves(klant?.pves ?? []);
  const pve = klant && pveId ? (klant.pves.find((x) => x.id === pveId) ?? null) : null;
  const energieMist = energieOntbreekt(input.energie);

  function genereer() {
    setVarianten(berekenVarianten(input, rooms, pve, extraSlaap, N));
    setAi({});
    setStap("resultaten");
  }

  /** AI-afbeelding van een variant (op knopdruk, i.v.m. kosten) — indelingGenereerAIAfbeelding() */
  async function genereerAi(i: number) {
    const v = varianten[i];
    if (!v) return;
    setAi((a) => ({ ...a, [i]: { bezig: true } }));
    let staat: AiStaat;
    try {
      const ref = await plattegrondVoorAi();
      if (!ref) {
        staat = {
          bezig: false,
          fout: "Er is geen plattegrond bij deze telling bekend. Lees eerst een plattegrond in (via ‘Plattegrond inlezen’) voordat je een AI-afbeelding kunt genereren.",
        };
      } else {
        // alleen ruimtetype, m² en vast/nieuw — geen namen of andere gegevens
        const ruimten = [
          ...v.vertrekken.map((r) => ({ groep: "vertrekken" as const, r })),
          ...v.overig.map((r) => ({ groep: "overig" as const, r })),
        ].map(({ groep, r }) => ({ groep, type: r.type, m2: num(r.m2), vast: !!r._indVast }));
        const r = await maakVariantAfbeelding({ data: { afbeelding: ref, ruimten } });
        staat = r.ok
          ? { bezig: false, beeld: r.data, gebruik: r.gebruik }
          : { bezig: false, fout: aiMelding(r.fout, "afbeelding", r.gebruik), gebruik: r.gebruik };
      }
    } catch {
      staat = { bezig: false, fout: aiMelding("geen_verbinding", "afbeelding") };
    }
    setAi((a) => ({ ...a, [i]: staat }));
  }

  /** Toepassen met als nieuwe plattegrond de AI-afbeelding, of anders het blokkenschema */
  async function pasToe(i: number, v: IndelingVariant) {
    const aiBeeld = ai[i]?.beeld;
    const beeld = await variantBeeld(aiBeeld, v, werkRef.current.rooms);
    onToepassen(
      toepassen(werkRef.current.input, v),
      { klantId, pveId: pve ? pve.id : "" },
      v,
      beeld,
      !!aiBeeld && !!beeld,
    );
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Stappen">
        {STAPPEN.map(([k, l], i) => (
          <li
            key={k}
            aria-current={stap === k ? "step" : undefined}
            className={`rounded-full border px-3 py-1 ${
              stap === k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {i + 1}. {l}
          </li>
        ))}
      </ol>

      {stap === "eigenaar" && (
        <div className="space-y-4">
          {energieMist && (
            <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
              Het energielabel (of energie-index/bouwjaar) is nog niet volledig ingevuld — zonder
              dat kloppen de puntentotalen van de varianten niet. Vul het in bij de telling zelf.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Kies voor wie je dit voorstel maakt. Dat bepaalt welke uitrusting en indelingswensen
            (bijv. geen aparte toiletruimte, een gewenst aantal slaapkamers) worden meegenomen.
          </p>
          <label className="flex max-w-md flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Eigenaar</span>
            <select
              className={selCls}
              value={klantId}
              onChange={(e) => {
                setKlantId(e.target.value);
                setPveId(standaardPve(e.target.value, ""));
              }}
            >
              <option value="">Geen eigenaar</option>
              {klanten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.naam}
                </option>
              ))}
            </select>
          </label>
          {klant && actief.length > 0 ? (
            <label className="flex max-w-md flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Uitgangspunten (PvE) van {klant.naam}</span>
              <select className={selCls} value={pveId} onChange={(e) => setPveId(e.target.value)}>
                <option value="">Geen — gebruik redelijke standaarden</option>
                {actief.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.naam}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              {klant
                ? "Deze eigenaar heeft nog geen (actief) PvE. Je kunt er een toevoegen bij Eigenaren, of gewoon doorgaan met redelijke standaarden."
                : "Zonder eigenaar gebruikt de tool redelijke standaardvoorzieningen (geen indelingswensen)."}
            </p>
          )}
          <Button onClick={() => setStap("kamers")}>Volgende stap →</Button>
        </div>
      )}

      {stap === "kamers" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Geef per bestaande ruimte aan of hij vrij herindeelbaar is, vast moet blijven (bijv.
            leidingen of een dragende muur) of vervalt. Hierna genereert de tool een paar
            programma-varianten met het bijbehorende WWS-puntentotaal en een eenvoudig,
            proportioneel blokkenschema — geen bouwkundige tekening.
          </p>
          {plattegrondUrl && magToepassen && (
            <PlattegrondTekenen
              url={plattegrondUrl}
              rooms={rooms}
              herkomst={(r) => (input[r.key][r.idx] as { herkomst?: string } | undefined)?.herkomst}
              onWijzig={(i: number, w: RuimteWijziging) =>
                wijzig(ruimteWijzigen(werkRef.current.input, werkRef.current.rooms, i, w))
              }
              onStatus={(i) =>
                setRooms((rs) =>
                  rs.map((x, j) => (j === i ? { ...x, status: volgendeStatus(x.status) } : x)),
                )
              }
              onNieuw={(n) =>
                wijzig(ruimteToevoegen(werkRef.current.input, werkRef.current.rooms, n))
              }
            />
          )}
          {rooms.length ? (
            <ul className="divide-y divide-border rounded-md border border-border">
              {rooms.map((r, i) => {
                const label =
                  (r.naam && r.naam.trim()) ||
                  (r.key === "vertrekken" ? vertrekType(r.type) : overigType(r.type)).l;
                return (
                  <li
                    key={r.key + r.idx}
                    className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="flex-1">
                      {label}
                      {r.kind && (
                        <span className="text-muted-foreground"> ({FAC_LABEL[r.kind]})</span>
                      )}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{fmt(r.m2)} m²</span>
                    <select
                      className={selCls}
                      aria-label={"Status van " + label}
                      value={r.status}
                      onChange={(e) =>
                        setRooms((rs) =>
                          rs.map((x, j) =>
                            j === i ? { ...x, status: e.target.value as IndelingStatus } : x,
                          ),
                        )
                      }
                    >
                      {(Object.keys(STATUS_LABEL) as IndelingStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nog geen ruimten in deze telling. Voeg eerst ruimten toe en open het indelingsadvies
              daarna opnieuw.
            </p>
          )}
          <label className="flex max-w-md flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              Specifiek aantal slaapkamers voorstellen (optioneel)
            </span>
            <Input
              inputMode="numeric"
              placeholder="bijv. 2"
              value={extraSlaap}
              onChange={(e) => setExtraSlaap(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStap("eigenaar")}>
              ← Vorige stap
            </Button>
            <Button onClick={genereer}>Genereer varianten →</Button>
          </div>
        </div>
      )}

      {stap === "resultaten" && (
        <Resultaten
          varianten={varianten}
          extraSlaap={extraSlaap}
          energieMist={energieMist}
          magToepassen={magToepassen}
          ai={ai}
          aiMogelijk={!!plattegrondUrl && magToepassen}
          onAi={genereerAi}
          onTerug={() => setStap("kamers")}
          onToepassen={pasToe}
        />
      )}
    </div>
  );
}

function Resultaten({
  varianten,
  extraSlaap,
  energieMist,
  magToepassen,
  ai,
  aiMogelijk,
  onAi,
  onTerug,
  onToepassen,
}: {
  varianten: IndelingVariant[];
  extraSlaap: string;
  energieMist: boolean;
  magToepassen: boolean;
  ai: Record<number, AiStaat>;
  aiMogelijk: boolean;
  onAi: (i: number) => void;
  onTerug: () => void;
  onToepassen: (i: number, v: IndelingVariant) => void;
}) {
  const gelijkeTotalen =
    varianten.length > 1 && varianten.every((v) => v.R.totaal === varianten[0]!.R.totaal);
  const extra = extraSlaap ? Math.round(num(extraSlaap)) : 0;
  const extraMislukt = extra > 0 && !varianten.some((v) => v.nSlaap === extra);
  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={onTerug}>
        ← Vorige stap
      </Button>
      {energieMist && (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
          Er is nog geen (geldig) energielabel, energie-index of bouwjaar ingevuld — de getoonde
          puntentotalen en segmenten zijn hierdoor nog niet correct.
        </p>
      )}
      {extraMislukt && (
        <p className="text-sm text-muted-foreground">
          Met {extra} slaapkamer{extra === 1 ? "" : "s"} blijft er te weinig vrije ruimte per
          slaapkamer over (minimaal zo’n 6 m² per slaapkamer); dit voorstel kon niet gemaakt worden.
          Ga terug en zet meer ruimten op ‘Vrij herindelen’, of pas het aantal aan.
        </p>
      )}
      {varianten.length ? (
        <>
          <p className="text-xs text-muted-foreground">
            Het schema is een eenvoudig, proportioneel blokkenschema (geen bouwkundige tekening):
            vast gehouden ruimten staan er qua oppervlak exact zo in als in de telling, maar de vorm
            en plek van nieuw voorgestelde ruimten zijn een schatting. Gebruik dit als vertrekpunt
            voor een echte plattegrond, niet als eindresultaat.
          </p>
          {gelijkeTotalen && (
            <p className="text-xs text-muted-foreground">
              Deze varianten scoren even veel punten: de WWS rekent vooral met totale vierkante
              meters en voorzieningen, niet met het aantal kamers. Kies dan op basis van
              bruikbaarheid of marktconformiteit, niet op punten.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {varianten.map((v, i) => (
              <article
                key={v.nSlaap}
                className="space-y-2 rounded-lg border border-border p-3"
                aria-label={`Variant met ${v.nSlaap} slaapkamer${v.nSlaap === 1 ? "" : "s"}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">
                    {v.nSlaap} slaapkamer{v.nSlaap === 1 ? "" : "s"}
                  </h3>
                  <div className="text-sm">
                    <b>{v.R.totaal} punten</b>
                    <span className="text-muted-foreground">
                      {" "}
                      · {SEGMENT_NAMEN[v.R.seg]}
                      {v.R.maxHuur != null && <> · {eur(v.R.maxHuur)}/mnd</>}
                    </span>
                  </div>
                </div>
                <Schema v={v} />
                {v.toiletToegevoegd && (
                  <p
                    className="rounded-md border border-border bg-muted px-2 py-1 text-xs"
                    role="note"
                  >
                    Toilet toegevoegd aan de badkamer: deze variant had verder nergens een toilet.
                  </p>
                )}
                {v.geenToilet && (
                  <p
                    className="rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs"
                    role="alert"
                  >
                    Let op: deze variant heeft geen toilet, en ook geen badkamer om er een in te
                    plaatsen. Zet bij Ruimten een toiletruimte of badkamer op ‘Vast houden’ of ‘Vrij
                    herindelen’.
                  </p>
                )}
                <AiAfbeelding staat={ai[i]} />
                <div className="flex flex-wrap gap-2">
                  {aiMogelijk && (
                    <Button variant="outline" disabled={!!ai[i]?.bezig} onClick={() => onAi(i)}>
                      {ai[i]?.bezig
                        ? "Bezig met genereren…"
                        : ai[i]?.beeld
                          ? "Opnieuw genereren (± € 0,03)"
                          : "Genereer AI-afbeelding (± € 0,03)"}
                    </Button>
                  )}
                  {magToepassen && (
                    <Button
                      variant="outline"
                      disabled={!!ai[i]?.bezig}
                      onClick={() => onToepassen(i, v)}
                    >
                      Toepassen op deze telling
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Met de huidige keuzes (vast/vervalt) blijft er te weinig vrije ruimte over voor een
          realistisch programma. Ga terug en zet meer ruimten op ‘Vrij herindelen’.
        </p>
      )}
    </div>
  );
}

const SW = 520,
  SH = 300,
  PAD = 6;

/** Schematische plattegrond: ruimten proportioneel naast en onder elkaar (vloerplanLayout) */
function Schema({ v }: { v: IndelingVariant }) {
  const bl = blokjes(v);
  const rects = vloerplanLayout(bl, SW - 2 * PAD, SH - 2 * PAD);
  const heeftVast = bl.some((b) => b.vast),
    heeftNieuw = bl.some((b) => b.nieuw);
  return (
    <div>
      <svg
        viewBox={`0 0 ${SW} ${SH}`}
        className="h-auto w-full rounded-md border border-border bg-background"
        role="img"
        aria-label={
          "Schematische indeling: " + bl.map((b) => `${b.label} ${fmt(b.m2)} m²`).join(", ")
        }
      >
        {bl.map((b, i) => {
          const r = rects[i]!;
          const x = PAD + r.x,
            y = PAD + r.y,
            w = Math.max(1, r.w - 3),
            h = Math.max(1, r.h - 3);
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={2}
                className={
                  b.vast ? "fill-muted stroke-muted-foreground" : "fill-primary/10 stroke-primary"
                }
                strokeWidth={2}
                strokeDasharray={b.nieuw ? "6 4" : undefined}
              >
                <title>{`${b.label}, ${fmt(b.m2)} m²${b.vast ? " (vast gehouden)" : b.nieuw ? " (nieuw voorgesteld)" : ""}`}</title>
              </rect>
              {w > 50 && h > 26 && (
                <text
                  x={x + w / 2}
                  y={y + h / 2 - 2}
                  textAnchor="middle"
                  className="fill-foreground text-[12px] font-medium"
                >
                  {b.label.length > Math.floor(w / 7)
                    ? b.label.slice(0, Math.max(3, Math.floor(w / 7) - 1)) + "…"
                    : b.label}
                </text>
              )}
              {w > 40 && h > 14 && (
                <text
                  x={x + w / 2}
                  y={y + h / 2 + (w > 50 && h > 26 ? 14 : 4)}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {fmt(b.m2)} m²
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {(heeftVast || heeftNieuw) && (
        <p className="mt-1 flex gap-4 text-xs text-muted-foreground">
          {heeftVast && (
            <span className="flex items-center gap-1">
              <i className="inline-block size-3 rounded-sm border-2 border-muted-foreground bg-muted" />{" "}
              vast gehouden
            </span>
          )}
          {heeftNieuw && (
            <span className="flex items-center gap-1">
              <i className="inline-block size-3 rounded-sm border-2 border-dashed border-primary bg-primary/10" />{" "}
              nieuw voorgesteld
            </span>
          )}
        </p>
      )}
    </div>
  );
}

interface AiStaat {
  bezig: boolean;
  beeld?: Afbeelding;
  fout?: string;
  gebruik?: Gebruik | undefined;
}

function AiAfbeelding({ staat }: { staat: AiStaat | undefined }) {
  if (!staat) return null;
  return (
    <div className="space-y-1">
      {staat.beeld && (
        <img
          src={naarDataUrl(staat.beeld.data, staat.beeld.type)}
          alt="Door AI gegenereerde plattegrond van deze variant"
          className="w-full rounded-md border border-border"
        />
      )}
      {staat.fout && (
        <p className="rounded-md border border-border bg-muted px-2 py-1 text-xs" role="status">
          {staat.fout}
        </p>
      )}
      {staat.gebruik && (
        <p className="text-xs text-muted-foreground">{gebruikTekst(staat.gebruik)}</p>
      )}
    </div>
  );
}

/** De nieuwe plattegrond bij toepassen: de AI-afbeelding, of het getekende blokkenschema */
async function variantBeeld(
  aiBeeld: Afbeelding | undefined,
  v: IndelingVariant,
  rooms: readonly IndelingRuimte[],
): Promise<NieuwBeeld | null> {
  try {
    let blob: Blob;
    if (aiBeeld) {
      blob = new Blob([base64NaarBytes(aiBeeld.data) as BlobPart], { type: aiBeeld.type });
    } else {
      const url = schemaDataUrl(
        () => document.createElement("canvas") as unknown as SchemaCanvas,
        v.vertrekken,
        v.overig,
        rooms,
      );
      if (!url) return null;
      blob = await (await fetch(url)).blob();
    }
    const bm = await createImageBitmap(blob);
    const r = { blob, breedte: bm.width, hoogte: bm.height };
    bm.close();
    return r;
  } catch {
    return null;
  }
}
