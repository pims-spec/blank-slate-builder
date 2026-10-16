import type { ReactNode } from "react";
import { aantal, bandbreedte } from "@/lib/wws/portefeuille/tekst";
import type { Raming } from "@/lib/wws/portefeuille/verduurzaming";

/** Vaste uitleg bij de raming (scherm en PDF) */
export const RAMING_UITLEG =
  "Grove indicatie op basis van labelstappen, de gebruiksoppervlakte en het bouwjaar uit de BAG; " +
  "geen offerte. Woningen zonder geregistreerd label krijgen een aangenomen label op grond van " +
  "het bouwjaar (gemarkeerd met *).";

/**
 * Verduurzamingsraming bij de EFG-regels: per woning de stappen en kosten naar D en naar C, met
 * de totalen. `actie` is de knop om BAG-gegevens op te halen (alleen in de actuele analyse).
 */
export function RamingKaart({ raming: r, actie }: { raming: Raming; actie?: ReactNode }) {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-4"
      aria-label="Verduurzamingsraming"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Verduurzamingsraming</h3>
          <p className="text-xs text-muted-foreground">{RAMING_UITLEG}</p>
        </div>
        {actie}
      </div>

      {!r.ingesteld && (
        <p className="mb-3 rounded-md border border-border bg-muted px-3 py-2 text-sm">
          Bedragen nog niet ingesteld in Normen; hieronder alleen de labelstappen.
        </p>
      )}
      {r.bagNietOpgehaald > 0 && (
        <p className="mb-3 text-sm text-orange-ink">
          Van {aantal(r.bagNietOpgehaald, "woning", "woningen")} zijn de BAG-gegevens nog niet
          opgehaald.
        </p>
      )}

      {r.ingesteld && r.regels.length > 0 && (
        <dl className="mb-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["Naar minimaal label D", r.totaalD],
              ["Naar label C", r.totaalC],
            ] as const
          ).map(([titel, b]) => (
            <div key={titel} className="rounded-xl border border-border p-3">
              <dt className="text-sm text-muted-foreground">{titel}</dt>
              <dd className="text-xl font-bold tabular-nums">{bandbreedte(b)}</dd>
            </div>
          ))}
          {r.zonderBedrag > 0 && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Exclusief {aantal(r.zonderBedrag, "woning", "woningen")} zonder bedrag (zie de
              opmerking in de tabel).
            </p>
          )}
        </dl>
      )}

      {r.regels.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Adres</th>
                <th className="py-1 pr-3 font-medium">Label</th>
                <th className="py-1 pr-3 text-right font-medium">Bouwjaar</th>
                <th className="py-1 pr-3 text-right font-medium">m²</th>
                <th className="py-1 pr-3 font-medium">Naar D</th>
                <th className="py-1 font-medium">Naar C</th>
              </tr>
            </thead>
            <tbody>
              {r.regels.map((x) => (
                <tr key={x.adres} className="border-t border-border align-top">
                  <td className="py-1 pr-3">
                    {x.adres}
                    {x.opmerking && (
                      <div className="text-xs text-muted-foreground">{x.opmerking}</div>
                    )}
                  </td>
                  <td className="py-1 pr-3">
                    {x.label ?? "—"}
                    {x.labelGeschat && <span title="Aangenomen op grond van het bouwjaar">*</span>}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{x.bouwjaar ?? "—"}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{x.m2 ?? "—"}</td>
                  <td className="py-1 pr-3 whitespace-nowrap tabular-nums">
                    {aantal(x.stappenD, "stap", "stappen")}
                    {x.naarD && <div>{bandbreedte(x.naarD)}</div>}
                  </td>
                  <td className="py-1 whitespace-nowrap tabular-nums">
                    {aantal(x.stappenC, "stap", "stappen")}
                    {x.naarC && <div>{bandbreedte(x.naarC)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Geen woningen met een label slechter dan C.</p>
      )}
    </section>
  );
}
