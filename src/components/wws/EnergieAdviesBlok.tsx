import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { eur, num, type EnergieAdvies } from "@/lib/wws";
import { leesEnergieAdvies } from "@/lib/wws/ai/ai.functions";
import { aiMelding, gebruikTekst } from "@/lib/wws/ai/meldingen";
import { anonimiseer } from "@/lib/wws/ai/privacy";
import type { Gebruik } from "@/lib/wws/ai/vragen";
import type { TellingMeta } from "@/lib/wws/opslag";
import { pdfTekst } from "@/lib/wws/plattegrond/beeld";

interface Props {
  advies: EnergieAdvies | undefined;
  /** Alleen om eigen gegevens uit de tekst te halen; gaat niet naar Claude */
  meta: TellingMeta;
  magBewerken: boolean;
  /** Nieuw advies (of null = verwijderen) in de werkversie */
  onZet: (advies: EnergieAdvies | null) => void;
}

/**
 * Verduurzamingsadvies uploaden — de "inst"-tab, runEnergieAdvies() en verwijderEnergieAdvies()
 * in wws-site.html. De tekst wordt in de browser uit de PDF gehaald; eigen gegevens van de
 * telling, postcodes, e-mail, telefoon en IBAN gaan eruit voordat hij naar Claude gaat.
 */
export default function EnergieAdviesBlok({ advies, meta, magBewerken, onZet }: Props) {
  const [bestand, setBestand] = useState<File | null>(null);
  const [bezig, setBezig] = useState(false);
  const [status, setStatus] = useState("");
  const [gebruik, setGebruik] = useState<Gebruik | undefined>();
  const ctl = useRef<AbortController | null>(null);

  async function inlezen() {
    if (!bestand) {
      setStatus("Kies eerst een bestand.");
      return;
    }
    setBezig(true);
    try {
      setStatus("Document voorbereiden…");
      let T;
      try {
        T = await pdfTekst(bestand);
      } catch {
        setStatus("Dit bestand kon niet worden gelezen. Upload een PDF met tekst.");
        return;
      }
      if (T.leeg) {
        setStatus("Dit document bevat geen leesbare tekst (waarschijnlijk een scan).");
        return;
      }
      setStatus("Claude leest het advies… dit duurt meestal 15 tot 45 seconden.");
      let r;
      ctl.current = new AbortController();
      try {
        r = await leesEnergieAdvies({
          data: { tekst: anonimiseer(T.text, meta) },
          signal: ctl.current.signal,
        });
      } catch {
        setStatus(
          ctl.current?.signal.aborted ? "Gestopt." : aiMelding("geen_verbinding", "advies"),
        );
        return;
      }
      setGebruik(r.gebruik);
      if (!r.ok) {
        setStatus(aiMelding(r.fout, "advies", r.gebruik));
        return;
      }
      const n = r.data.maatregelen?.length ?? 0;
      onZet({
        ...r.data,
        bestand: bestand.name.slice(0, 200),
        geuploadOp: new Date().toISOString(),
      });
      setStatus("");
      toast(
        "Verduurzamingsadvies verwerkt: " +
          n +
          " maatregel" +
          (n > 1 ? "en" : "") +
          " overgenomen.",
      );
    } finally {
      setBezig(false);
    }
  }

  return (
    <section className="space-y-2 text-sm" aria-label="Verduurzamingsadvies">
      <h3 className="font-semibold">Verduurzamingsadvies uploaden</h3>
      {advies ? (
        <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2">
          <b>Geüpload: {advies.bestand || "advies"}</b>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {advies.geuploadOp &&
              "Verwerkt op " +
                new Date(advies.geuploadOp).toLocaleString("nl-NL", {
                  dateStyle: "long",
                  timeStyle: "short",
                }) +
                ". "}
            De route gebruikt deze maatregelen voor het energielabel in plaats van de algemene
            kostenraming.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="p-1">Van</th>
                  <th className="p-1">Naar</th>
                  <th className="p-1">Omschrijving</th>
                  <th className="p-1">Kosten</th>
                  <th className="p-1">Besparing/jaar</th>
                </tr>
              </thead>
              <tbody>
                {(advies.maatregelen ?? []).map((m, i) => {
                  const kMin = num(m.kostenMin),
                    kMax = num(m.kostenMax),
                    bMin = num(m.besparingMin),
                    bMax = num(m.besparingMax);
                  return (
                    <tr key={i} className="border-t border-border align-top">
                      <td className="p-1">{m.vanLabel}</td>
                      <td className="p-1">{m.naarLabel}</td>
                      <td className="p-1 text-xs">
                        {(m.omschrijving ?? []).map((o, j) => (
                          <div key={j}>{o}</div>
                        ))}
                      </td>
                      <td className="p-1">
                        {eur(kMin)}
                        {kMax > kMin ? " – " + eur(kMax) : ""}
                      </td>
                      <td className="p-1">
                        {eur(bMin)}
                        {bMax > bMin ? " – " + eur(bMax) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {magBewerken && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                onZet(null);
                toast(
                  "Geüpload advies verwijderd; de tool gebruikt weer de algemene kostenraming per labelstap.",
                );
              }}
            >
              Advies verwijderen
            </Button>
          )}
        </div>
      ) : magBewerken ? (
        <>
          <p className="text-muted-foreground">
            Upload een verduurzamings- of energieadvies (PDF met tekst) met concrete maatregelen,
            apparatuur, kosten en besparing per energielabel-stap. Claude haalt de maatregelen eruit
            en de route naar de vrije sector gebruikt die in plaats van een algemene schatting.
            Namen, adressen, e-mail en telefoonnummers worden vooraf uit de tekst gehaald.
          </p>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Advies (PDF)</span>
            <input
              type="file"
              accept="application/pdf"
              disabled={bezig}
              onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={inlezen} disabled={bezig}>
              Advies inlezen
            </Button>
            {bezig && (
              <Button variant="outline" onClick={() => ctl.current?.abort()}>
                Stoppen
              </Button>
            )}
            <span className="text-muted-foreground" role="status">
              {bezig && !status ? "Bezig…" : status}
            </span>
            {gebruik && (
              <span className="text-xs text-muted-foreground">{gebruikTekst(gebruik)}</span>
            )}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Er is geen verduurzamingsadvies geüpload.</p>
      )}
    </section>
  );
}
