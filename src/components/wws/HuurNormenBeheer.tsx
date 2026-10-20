import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GOHOME_INSCHATTING,
  HUUR_STANDAARD,
  isInschatting,
  NIVEAU_NAMEN,
  WONINGTYPE_NAMEN,
  type BronRegel,
  type FactorGroep,
  type HuurNormen,
  type RegioNiveau,
  type Woningsoort,
} from "@/lib/wws/huur";

const selectCls = "h-9 rounded-xl border border-input bg-background px-2 text-sm";

/** Labels voor de waarden per factorgroep */
const WAARDE_NAMEN: Record<string, string> = {
  ...WONINGTYPE_NAMEN,
  aplus: "A+ of beter",
  ab: "A of B",
  cd: "C of D",
  efg: "E, F of G",
  onbekend: "Onbekend",
  basis: "Basis",
  goed: "Goed",
  luxe: "Luxe",
  matig: "Matig",
  gedateerd: "Gedateerd",
  modern: "Modern",
  nieuw: "Nieuw",
  geen: "Geen",
  balkon: "Balkon",
  tuin: "Tuin",
  dakterras: "Dakterras",
  kaal: "Kaal",
  gestoffeerd: "Gestoffeerd",
  gemeubileerd: "Gemeubileerd",
  factor: "Factor",
  plek: "Eigen plek (€ per maand)",
  garage: "Garage (€ per maand)",
};

const GROEP_NAMEN: Record<keyof HuurNormen["factoren"], string> = {
  woningtype: "Woningtype (alleen als de bronregel voor alle woningtypen is)",
  label: "Energielabel",
  afwerking: "Afwerkingsniveau",
  onderhoud: "Staat van onderhoud",
  keuken: "Keuken",
  badkamer: "Badkamer",
  buiten: "Buitenruimte",
  oplevering: "Oplevering",
  hoogZonderLift: "Appartement vanaf de 3e verdieping zonder lift",
};

function Inschatting({ bron }: { bron: string }) {
  return isInschatting(bron) ? (
    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
      GoHome-inschatting
    </span>
  ) : null;
}

function Groep<K extends string>({
  titel,
  groep,
  onChange,
}: {
  titel: string;
  groep: FactorGroep<K>;
  onChange: (g: FactorGroep<K>) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-border p-3">
      <legend className="flex items-center gap-2 px-1 text-sm font-medium">
        {titel} <Inschatting bron={groep.bron} />
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(Object.keys(groep.waarden) as K[]).map((k) => (
          <label key={k} className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{WAARDE_NAMEN[k] ?? k}</span>
            <Input
              type="number"
              step="0.01"
              min={0}
              aria-label={titel + ": " + (WAARDE_NAMEN[k] ?? k)}
              className="h-8 tabular-nums"
              value={groep.waarden[k]}
              onChange={(e) =>
                onChange({ ...groep, waarden: { ...groep.waarden, [k]: Number(e.target.value) } })
              }
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">
          Herkomst (pas aan zodra de waarden zijn geijkt)
        </span>
        <Input
          aria-label={titel + ": herkomst"}
          className="h-8"
          value={groep.bron}
          onChange={(e) => onChange({ ...groep, bron: e.target.value })}
        />
      </label>
    </fieldset>
  );
}

const nieuweRegel = (): BronRegel => ({
  id: "eigen-" + Math.random().toString(36).slice(2, 8),
  niveau: "gemeente",
  regio: "",
  woningsoort: "alle",
  prijsM2: 0,
  bron: "",
  peildatum: new Date().toISOString().slice(0, 10),
});

/** De referentietabel en de factoren van de huurprijsindicator (in Normen, alleen admin) */
export default function HuurNormenBeheer({
  waarde: H,
  onChange,
}: {
  waarde: HuurNormen;
  onChange: (h: HuurNormen) => void;
}) {
  const zetRegel = (i: number, r: Partial<BronRegel>) =>
    onChange({ ...H, regels: H.regels.map((x, j) => (j === i ? { ...x, ...r } : x)) });
  const getal = (v: string) => (v === "" ? null : Number(v));

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Gemiddelde kale huur per m² per maand in de vrije sector, met bron en datum per regel. De
        indicator zoekt van specifiek naar grof: postcodegebied (4 cijfers) → gemeente (naam zoals
        PDOK hem geeft, bijv. ’s-Gravenhage) → provincie → landelijk. Geen eigen regel? Dan geldt de
        provincie, daarna het landelijke gemiddelde, met een lagere betrouwbaarheid.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-xs" aria-label="Referentietabel">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-1 font-medium">Niveau</th>
              <th className="p-1 font-medium">Regio</th>
              <th className="p-1 font-medium">Weergavenaam</th>
              <th className="p-1 font-medium">Woningsoort</th>
              <th className="p-1 font-medium">€/m²</th>
              <th className="p-1 font-medium">Laag</th>
              <th className="p-1 font-medium">Hoog</th>
              <th className="p-1 font-medium">Gem. m²</th>
              <th className="p-1 font-medium">Bron</th>
              <th className="p-1 font-medium">Link</th>
              <th className="p-1 font-medium">Peildatum</th>
              <th className="p-1" />
            </tr>
          </thead>
          <tbody>
            {H.regels.map((r, i) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="p-1">
                  <select
                    className={selectCls}
                    aria-label={"Niveau regel " + (i + 1)}
                    value={r.niveau}
                    onChange={(e) => zetRegel(i, { niveau: e.target.value as RegioNiveau })}
                  >
                    {(Object.keys(NIVEAU_NAMEN) as RegioNiveau[]).map((n) => (
                      <option key={n} value={n}>
                        {NIVEAU_NAMEN[n]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-1">
                  <Input
                    className="h-8 w-32"
                    aria-label={"Regio regel " + (i + 1)}
                    value={r.regio}
                    onChange={(e) => zetRegel(i, { regio: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <Input
                    className="h-8 w-28"
                    aria-label={"Weergavenaam regel " + (i + 1)}
                    value={r.naam ?? ""}
                    onChange={(e) => zetRegel(i, { naam: e.target.value || undefined } as never)}
                  />
                </td>
                <td className="p-1">
                  <select
                    className={selectCls}
                    aria-label={"Woningsoort regel " + (i + 1)}
                    value={r.woningsoort}
                    onChange={(e) => zetRegel(i, { woningsoort: e.target.value as Woningsoort })}
                  >
                    <option value="alle">Alle</option>
                    <option value="appartement">Appartement</option>
                    <option value="woonhuis">Woonhuis</option>
                  </select>
                </td>
                {(["prijsM2", "prijsM2Laag", "prijsM2Hoog", "gemOppervlakte"] as const).map((k) => (
                  <td key={k} className="p-1">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-8 w-20 tabular-nums"
                      aria-label={k + " regel " + (i + 1)}
                      value={r[k] ?? ""}
                      onChange={(e) =>
                        zetRegel(i, {
                          [k]: k === "prijsM2" ? Number(e.target.value) : getal(e.target.value),
                        })
                      }
                    />
                  </td>
                ))}
                <td className="p-1">
                  <Input
                    className="h-8 w-56"
                    aria-label={"Bron regel " + (i + 1)}
                    value={r.bron}
                    title={r.opmerking}
                    onChange={(e) => zetRegel(i, { bron: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <Input
                    className="h-8 w-40"
                    aria-label={"Link regel " + (i + 1)}
                    value={r.url ?? ""}
                    onChange={(e) => zetRegel(i, { url: e.target.value || undefined } as never)}
                  />
                </td>
                <td className="p-1">
                  <Input
                    type="date"
                    className="h-8 w-36"
                    aria-label={"Peildatum regel " + (i + 1)}
                    value={r.peildatum}
                    onChange={(e) => zetRegel(i, { peildatum: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={"Regel " + (i + 1) + " verwijderen"}
                    onClick={() => onChange({ ...H, regels: H.regels.filter((_x, j) => j !== i) })}
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...H, regels: [...H.regels, nieuweRegel()] })}
        >
          + Regel toevoegen
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...H, regels: HUUR_STANDAARD.regels })}
        >
          Startwaarden NVM/VGM NL terugzetten
        </Button>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium">Correctiefactoren</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Een factor van 1,05 betekent 5% hoger. Standaardwaarden zijn een{" "}
          {GOHOME_INSCHATTING.toLowerCase()}: geen gemeten waarden. Pas de herkomst aan zodra een
          groep is geijkt (bijv. met de eigen portefeuille).
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {(Object.keys(GROEP_NAMEN) as (keyof HuurNormen["factoren"])[]).map((k) => (
            <Groep
              key={k}
              titel={GROEP_NAMEN[k]}
              groep={H.factoren[k] as FactorGroep<string>}
              onChange={(g) => onChange({ ...H, factoren: { ...H.factoren, [k]: g } })}
            />
          ))}
          <Groep
            titel="Parkeren (vast bedrag per maand)"
            groep={H.parkeren}
            onChange={(g) => onChange({ ...H, parkeren: g })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            [
              "Referentie-oppervlakte (m²) zonder gemiddelde in de bron",
              H.referentieM2,
              (v: number) => ({ referentieM2: v }),
            ],
            [
              "Grootte-elasticiteit (0–1)",
              H.grootte.elasticiteit,
              (v: number) => ({ grootte: { ...H.grootte, elasticiteit: v } }),
            ],
            [
              "Bronregel verouderd na (maanden)",
              H.maxOuderdomMaanden,
              (v: number) => ({ maxOuderdomMaanden: v }),
            ],
            [
              "Bandbreedte bij betrouwbaarheid hoog (±)",
              H.spreiding.hoog,
              (v: number) => ({ spreiding: { ...H.spreiding, hoog: v } }),
            ],
            [
              "Bandbreedte bij betrouwbaarheid middel (±)",
              H.spreiding.middel,
              (v: number) => ({ spreiding: { ...H.spreiding, middel: v } }),
            ],
            [
              "Bandbreedte bij betrouwbaarheid laag (±)",
              H.spreiding.laag,
              (v: number) => ({ spreiding: { ...H.spreiding, laag: v } }),
            ],
            [
              "WWS-check: aandeel vertrek, laag scenario",
              H.wws.vertrekAandeelLaag,
              (v: number) => ({ wws: { ...H.wws, vertrekAandeelLaag: v } }),
            ],
            [
              "WWS-check: aandeel vertrek, hoog scenario",
              H.wws.vertrekAandeelHoog,
              (v: number) => ({ wws: { ...H.wws, vertrekAandeelHoog: v } }),
            ],
          ] as const
        ).map(([label, v, zet]) => (
          <label key={label} className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={v}
              onChange={(e) => onChange({ ...H, ...zet(Number(e.target.value)) })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
