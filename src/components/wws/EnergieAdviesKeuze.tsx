import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { eur, SEGMENT_NAMEN, type EnergieAdvies, type WwsInput } from "@/lib/wws";
import {
  beginlabelVraag,
  datumTekst,
  gebruiktAdviesLabel,
  REGISTRATIE_MELDING,
  uitgangspuntTekst,
  vergelijkBeginlabel,
  vergelijkOpties,
  type OptieEffect,
} from "@/lib/wws/advies/energieAdvies";
import type { Normen } from "@/lib/wws/normen";

interface Props {
  input: WwsInput;
  normen: Normen;
  magBewerken: boolean;
  /** Naam van wie bevestigt (komt in energieAdvies.uitgangspunt) */
  bewerker: string;
  onZet: (advies: EnergieAdvies) => void;
}

const vandaag = () => new Date().toISOString().slice(0, 10);
const plus = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n);
const euroVerschil = (d: number) => (d >= 0 ? "+" : "−") + eur(Math.abs(d));
const kostenTekst = (o: OptieEffect) =>
  eur(o.kostenMin) + (o.kostenMax > o.kostenMin ? " – " + eur(o.kostenMax) : "");

/**
 * Energieadvies in het verbeteradvies (bewuste afwijking van de bron): de controlevraag bij een
 * afwijkend beginlabel, en de opties uit het advies naast elkaar om er één te kiezen.
 */
export default function EnergieAdviesKeuze({ input, normen, magBewerken, bewerker, onZet }: Props) {
  const EA = input.energieAdvies;
  const v = useMemo(() => vergelijkBeginlabel(input.energie, EA), [input.energie, EA]);
  const opties = useMemo(() => vergelijkOpties(input, normen, vandaag()), [input, normen]);
  const [wijzigen, setWijzigen] = useState(false);
  if (!EA) return null;

  const u = EA.uitgangspunt;
  const bevestigd = !!u && !!v && u.label === v.advies.label;
  const vraagOpen = !!v?.verschil && (!bevestigd || wijzigen);
  const gekozen = opties.find((o) => o.index === EA.gekozenOptie) ?? null;

  function bevestig(keuze: "advies" | "registratie") {
    if (!v || !EA) return;
    onZet({
      ...EA,
      uitgangspunt: { keuze, label: v.advies.label, door: bewerker, op: new Date().toISOString() },
    });
    setWijzigen(false);
  }

  return (
    <div className="space-y-5 text-sm">
      {v?.verschil && (
        <section aria-label="Beginlabel" className="space-y-3">
          <h3 className="font-semibold">Beginlabel van het verbeteradvies</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border-2 border-ruimte-rand p-3">
              <div className="text-xs text-muted-foreground">Geregistreerd (EP-Online)</div>
              <div className="text-lg font-semibold">
                {v.registratie.label ? "Label " + v.registratie.label : v.registratie.omschrijving}
                {v.registratie.soort === "labelOud" && " (vóór 2015)"}
              </div>
              <div className="text-xs text-muted-foreground">
                {v.registratie.datum
                  ? "Geregistreerd op " + datumTekst(v.registratie.datum)
                  : "Geen registratiedatum"}
              </div>
            </div>
            <div className="rounded-lg border-2 border-ruimte-rand p-3">
              <div className="text-xs text-muted-foreground">Volgens het energieadvies</div>
              <div className="text-lg font-semibold">Label {v.advies.label}</div>
              <div className="text-xs text-muted-foreground">
                {v.advies.datum
                  ? "Advies van " + datumTekst(v.advies.datum)
                  : "Advies zonder datum"}
              </div>
            </div>
          </div>

          {vraagOpen && magBewerken ? (
            <div
              role="group"
              aria-label="Controlevraag beginlabel"
              className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3"
            >
              <p>{beginlabelVraag(v)}</p>
              <p className="text-xs text-muted-foreground">
                Voorstel:{" "}
                {v.voorstel === "advies"
                  ? "het advies, want dat is recenter dan de registratie."
                  : "EP-Online" +
                    (v.advies.datum
                      ? ", want het advies is niet recenter."
                      : ", want het advies heeft geen datum.")}{" "}
                Tot je bevestigt, rekent het verbeteradvies met het geregistreerde label.
              </p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["advies", "Ja, ga uit van het advies"],
                    ["registratie", "Nee, gebruik EP-Online"],
                  ] as const
                ).map(([k, tekst]) => (
                  <Button
                    key={k}
                    variant={v.voorstel === k ? "default" : "outline"}
                    onClick={() => bevestig(k)}
                  >
                    {tekst}
                  </Button>
                ))}
                {wijzigen && (
                  <Button variant="ghost" onClick={() => setWijzigen(false)}>
                    Annuleren
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <p>{uitgangspuntTekst(input)}</p>
              {bevestigd && magBewerken && (
                <Button variant="outline" size="sm" onClick={() => setWijzigen(true)}>
                  Uitgangspunt wijzigen
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground" role="note">
            {REGISTRATIE_MELDING}
          </p>
        </section>
      )}

      {opties.length > 0 && (
        <section aria-label="Opties uit het energieadvies" className="space-y-3">
          <h3 className="font-semibold">
            {opties.length > 1
              ? "Opties uit het energieadvies vergelijken"
              : "Optie uit het energieadvies"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Het eindlabel bepaalt de punten. Het beginlabel is{" "}
            {opties[0]!.van
              ? "label " +
                opties[0]!.van +
                (gebruiktAdviesLabel(input) ? " (volgens het energieadvies)" : " (EP-Online)")
              : "onbekend (geen geregistreerd label)"}
            .{" "}
            {gekozen
              ? "De gekozen optie is de labelmaatregel in het verbeteradvies."
              : "Kies je geen optie, dan kiest het verbeteradvies zelf."}
          </p>
          <ul
            className={
              opties.length > 1 ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "grid gap-3"
            }
          >
            {opties.map((o) => (
              <OptieKaart
                key={o.index}
                o={o}
                gekozen={gekozen}
                magBewerken={magBewerken}
                onKies={() => onZet({ ...EA, gekozenOptie: o.index })}
              />
            ))}
          </ul>
          {gekozen && magBewerken && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const { gekozenOptie: _weg, ...rest } = EA;
                onZet(rest);
              }}
            >
              Keuze opheffen (verbeteradvies kiest zelf)
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Terugverdientijd = gemiddelde kosten ÷ extra huur per jaar. Dit is een indicatie: zonder
            besparing voor de huurder, rente, onderhoud of huurverhogingsregels.
          </p>
        </section>
      )}
    </div>
  );
}

function OptieKaart({
  o,
  gekozen,
  magBewerken,
  onKies,
}: {
  o: OptieEffect;
  gekozen: OptieEffect | null;
  magBewerken: boolean;
  onKies: () => void;
}) {
  const isGekozen = gekozen?.index === o.index;
  const titel = (o.van ?? "?") + " → " + o.naar;
  return (
    <li
      className={
        "flex flex-col gap-2 rounded-lg border-2 p-3 " +
        (isGekozen ? "border-primary bg-primary/5" : "border-ruimte-rand")
      }
      aria-label={"Optie " + titel}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-lg font-semibold">Label {titel}</div>
        {o.stappen != null && (
          <span className="text-xs text-muted-foreground">
            {o.stappen} stap{o.stappen === 1 ? "" : "pen"}
          </span>
        )}
      </div>
      <div>
        <span className="font-medium">{kostenTekst(o)}</span>
        {(o.besparingMin > 0 || o.besparingMax > 0) && (
          <span className="text-xs text-muted-foreground">
            {" "}
            · besparing {eur(o.besparingMin)}
            {o.besparingMax > o.besparingMin ? " – " + eur(o.besparingMax) : ""} per jaar
          </span>
        )}
      </div>
      {(o.optie.omschrijving ?? []).length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs">
          {(o.optie.omschrijving ?? []).map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs tabular-nums">
        <dt className="text-muted-foreground">Punten</dt>
        <dd>
          {plus(o.puntenErbij)} → {o.totaal}
        </dd>
        <dt className="text-muted-foreground">Segment</dt>
        <dd>{SEGMENT_NAMEN[o.seg]}</dd>
        <dt className="text-muted-foreground">Max. huur</dt>
        <dd>{eur(o.maxHuur)} per maand</dd>
        <dt className="text-muted-foreground">Extra huur</dt>
        <dd>{eur(o.extraHuurMaand)} per maand</dd>
        <dt className="text-muted-foreground">Terugverdientijd</dt>
        <dd>
          {o.terugverdienJaren != null
            ? "± " + o.terugverdienJaren.toLocaleString("nl-NL") + " jaar (indicatie)"
            : "geen (huur gaat niet omhoog)"}
        </dd>
      </dl>
      {gekozen && !isGekozen && (
        <p className="text-xs text-muted-foreground">
          T.o.v. de gekozen optie: {plus(o.totaal - gekozen.totaal)} punten,{" "}
          {euroVerschil(o.extraHuurMaand - gekozen.extraHuurMaand)} huur per maand, kosten{" "}
          {euroVerschil(o.kosten - gekozen.kosten)}
        </p>
      )}
      {magBewerken && (
        <Button
          className="mt-auto"
          variant={isGekozen ? "default" : "outline"}
          aria-pressed={isGekozen}
          onClick={onKies}
          disabled={isGekozen}
        >
          {isGekozen ? "Gekozen" : "Kies deze optie"}
        </Button>
      )}
    </li>
  );
}
