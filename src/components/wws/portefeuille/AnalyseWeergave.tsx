import { useState, type ReactNode } from "react";
import {
  EFG_TOELICHTING,
  efgTekst,
  nietGevondenReden,
  type AnalyseUitkomst,
} from "@/lib/wws/portefeuille/analyse";
import { nlDatum } from "@/lib/wws/portefeuille/datum";
import { aantal, periode } from "@/lib/wws/portefeuille/tekst";
import { AdresLijstDialoog, type Doorklik } from "./AdresLijstDialoog";
import { LabelGrafiek } from "./LabelGrafiek";
import { RamingKaart } from "./RamingKaart";

const pctTekst = (p: number) => p.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) + "%";
const tijd = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" }) : "–";

function Kaart({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="gh-card p-4" aria-label={titel}>
      <h3 className="mb-3 font-semibold">{titel}</h3>
      {children}
    </section>
  );
}

/**
 * De uitkomst van een analyse (live of opgeslagen): grafiek, risico, EFG en de lijsten. Met
 * `onUitsluiten` (alleen de actuele analyse, met schrijfrechten) staat bij "Te controleren" per adres
 * een kruisje om het uit de analyse te halen.
 */
export function AnalyseWeergave({
  uitkomst: u,
  onUitsluiten,
  ramingActie,
}: {
  uitkomst: AnalyseUitkomst;
  onUitsluiten?: ((adres: string) => void) | undefined;
  /** Knop om BAG-gegevens op te halen, in de verduurzamingsraming (alleen actuele analyse) */
  ramingActie?: ReactNode;
}) {
  const c = u.teControleren;
  const aantalControle =
    c.nietGevonden.length + c.meerdere.length + c.fout.length + c.nietOpgehaald.length;
  const [doorklik, setDoorklik] = useState<Doorklik | null>(null);
  const kiesKlasse = (klasse: string) => {
    const k = u.perKlasse.find((x) => x.klasse === klasse);
    if (k)
      setDoorklik({
        titel: klasse === "geen label" ? "Geen label" : "Label " + klasse,
        aantal: k.aantal,
        adressen: k.adressen,
      });
  };
  return (
    <div className="space-y-4">
      <AdresLijstDialoog d={doorklik} onSluit={() => setDoorklik(null)} />
      <p className="text-sm text-muted-foreground">
        Analyse per {nlDatum(u.datum)} · {u.aantalAdressen} adressen, waarvan {u.aantalBeoordeeld}{" "}
        beoordeeld · EP-Online opgehaald{" "}
        {u.epOpgehaaldVan ? periode(u.epOpgehaaldVan, u.epOpgehaaldTot, tijd) : "nog niet"}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Kaart titel="Woningen per labelklasse">
          <LabelGrafiek uitkomst={u} onKies={kiesKlasse} />
          <p className="mt-1 text-xs text-muted-foreground">Klik op een staaf voor de adressen.</p>
        </Kaart>
        <Kaart titel="Risicoprofiel">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 text-left font-medium">Categorie</th>
                <th className="py-1 pl-3 text-right font-medium">Aantal</th>
                <th className="py-1 pl-3 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {u.risico.map((r) => (
                <tr key={r.categorie} className="border-t border-border">
                  <td className="py-1.5">
                    <button
                      type="button"
                      className="text-left underline-offset-2 hover:underline"
                      onClick={() =>
                        setDoorklik({ titel: r.naam, aantal: r.aantal, adressen: r.adressen })
                      }
                    >
                      {r.naam}
                    </button>
                  </td>
                  <td className="py-1.5 pl-3 text-right tabular-nums">{r.aantal}</td>
                  <td className="py-1.5 pl-3 text-right whitespace-nowrap tabular-nums">
                    {pctTekst(r.pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Elke woning telt in één categorie (van boven naar beneden); klik op een categorie voor
            de adressen. Verouderd: geldig, maar geregistreerd vóór{" "}
            {nlDatum(u.instellingen.verouderdVoor)} (oud label of energie-index).
          </p>
        </Kaart>
      </div>

      <Kaart titel="EFG-regels">
        <p className="text-sm">{efgTekst(u)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{EFG_TOELICHTING}</p>
        <p className="mt-2 text-2xl font-bold tabular-nums">
          {u.efg.aantal}{" "}
          <span className="text-base font-medium text-muted-foreground">
            {u.efg.aantal === 1 ? "woning" : "woningen"} · {pctTekst(u.efg.pct)} van de portefeuille
          </span>
        </p>
        {u.efg.geenLabelApart !== null && (
          <p className="text-sm text-muted-foreground">
            Daarnaast {aantal(u.efg.geenLabelApart, "woning", "woningen")} zonder geregistreerd
            label.
          </p>
        )}
      </Kaart>

      <Kaart
        titel={`Label verloopt of verliep binnen ${u.vensterMaanden} maanden (${u.verloopLijst.length})`}
      >
        {u.verloopLijst.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Adres</th>
                  <th className="py-1 pr-3 font-medium">Label</th>
                  <th className="py-1 pr-3 font-medium">Registratie</th>
                  <th className="py-1 pr-3 font-medium">Verloopt</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {u.verloopLijst.map((r) => (
                  <tr key={r.adres} className="border-t border-border">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{r.adres}</td>
                    <td className="py-1.5 pr-3">{r.klasse}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{nlDatum(r.registratiedatum)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{nlDatum(r.verloopdatum)}</td>
                    <td className={"py-1.5 " + (r.status === "verlopen" ? "text-destructive" : "")}>
                      {r.status === "verlopen" ? "verlopen" : "verloopt"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Geen woningen in deze periode.</p>
        )}
      </Kaart>

      {u.raming && <RamingKaart raming={u.raming} actie={ramingActie} />}

      <Kaart titel={`Woningen onder de EFG-regels (${u.efg.woningen.length})`}>
        {u.efg.woningen.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Adres</th>
                  <th className="py-1 pr-3 font-medium">Label</th>
                  <th className="py-1 font-medium">Registratie</th>
                </tr>
              </thead>
              <tbody>
                {u.efg.woningen.map((w) => (
                  <tr key={w.adres} className="border-t border-border">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{w.adres}</td>
                    <td className="py-1.5 pr-3">{w.klasse ?? "geen label"}</td>
                    <td className="py-1.5 tabular-nums">{nlDatum(w.registratiedatum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Geen woningen.</p>
        )}
      </Kaart>

      {aantalControle > 0 && (
        <Kaart titel={`Te controleren (${aantalControle})`}>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {(
              [
                [nietGevondenReden(u), c.nietGevonden],
                ["Niet eenduidig (meerdere labels)", c.meerdere],
                ["Ophalen mislukt", c.fout],
                ["Nog niet opgehaald", c.nietOpgehaald],
              ] as const
            )
              .filter(([, l]) => l.length)
              .map(([titel, lijst]) => (
                <div key={titel}>
                  <div className="font-medium">
                    {titel} ({lijst.length})
                  </div>
                  <ul className="mt-1 max-h-40 overflow-y-auto text-muted-foreground">
                    {lijst.map((a) => (
                      <li key={a} className="flex items-center justify-between gap-2">
                        <span className="min-w-0">{a}</span>
                        {onUitsluiten && (
                          <button
                            type="button"
                            className="shrink-0 rounded px-1.5 text-base leading-none hover:bg-muted hover:text-destructive"
                            title="Uit de analyse halen"
                            aria-label={"Uit de analyse halen: " + a}
                            onClick={() => onUitsluiten(a)}
                          >
                            ×
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </Kaart>
      )}
    </div>
  );
}
