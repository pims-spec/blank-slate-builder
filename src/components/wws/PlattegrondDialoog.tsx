import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmt, num, OVERIG_TYPES, VERTREK_TYPES, type WwsInput } from "@/lib/wws";
import type { PlattegrondAntwoord } from "@/lib/wws/ai/antwoorden";
import { leesPlattegrond } from "@/lib/wws/ai/ai.functions";
import { aiMelding, gebruikTekst } from "@/lib/wws/ai/meldingen";
import { anonimiseer } from "@/lib/wws/ai/privacy";
import type { Gebruik } from "@/lib/wws/ai/vragen";
import type { TellingMeta } from "@/lib/wws/opslag";
import {
  bestandNaarCanvas,
  blobNaarBytes,
  bytesNaarBase64,
  canvasNaarJpeg,
} from "@/lib/wws/plattegrond/beeld";
import {
  buitenTekst,
  platToepassen,
  sanitairTekst,
  standaardKeuzes,
  type PlatKeuzes,
} from "@/lib/wws/plattegrond/toepassen";
import type { NieuwBeeld } from "./plattegrondBeeld";

const BRON_KLEUR: Record<string, string> = {
  afgelezen: "bg-emerald-600",
  berekend: "bg-primary",
  ingeschat: "bg-orange-500",
};
const veldCls =
  "rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: WwsInput;
  /** Alleen om eigen gegevens uit de toelichting te halen; gaat niet naar Claude */
  meta: TellingMeta;
  /** "Overnemen": de nieuwe invoer en de afbeelding (wordt bij Opslaan in Storage gezet) */
  onOvernemen: (input: WwsInput, beeld: NieuwBeeld) => void;
}

/** Plattegrond inlezen met Claude — openPlat/runPlat/applyPlat in wws-site.html */
export default function PlattegrondDialoog(p: Props) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Plattegrond inlezen</DialogTitle>
          <DialogDescription>
            Upload een plattegrond als afbeelding (PNG of JPG) of PDF (eerste pagina). Claude leest
            de maten af en zet de ruimten klaar. Je controleert alles voordat het in de telling
            komt. Gebruik bij voorkeur een tekening met maatvoering; zonder maten zijn de
            oppervlakten alleen een schatting.
          </DialogDescription>
        </DialogHeader>
        {p.open && <Inhoud {...p} />}
      </DialogContent>
    </Dialog>
  );
}

function Inhoud({ input, meta, onOvernemen }: Props) {
  const [bestand, setBestand] = useState<File | null>(null);
  const [notitie, setNotitie] = useState("");
  const [beeld, setBeeld] = useState<NieuwBeeld | null>(null);
  const [voorbeeld, setVoorbeeld] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [status, setStatus] = useState("");
  const [R, setR] = useState<PlattegrondAntwoord | null>(null);
  const [k, setK] = useState<PlatKeuzes | null>(null);
  const [gebruik, setGebruik] = useState<Gebruik | undefined>();
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!beeld) return;
    const u = URL.createObjectURL(beeld.blob);
    setVoorbeeld(u);
    return () => URL.revokeObjectURL(u);
  }, [beeld]);

  async function inlezen() {
    if (!bestand) {
      setStatus("Kies eerst een bestand.");
      return;
    }
    setBezig(true);
    setR(null);
    setK(null);
    try {
      setStatus("Tekening voorbereiden…");
      let jpeg: Blob, c: HTMLCanvasElement;
      try {
        c = await bestandNaarCanvas(bestand);
        jpeg = await canvasNaarJpeg(c);
      } catch (e) {
        setStatus(
          bestand.type === "application/pdf"
            ? "De PDF kon niet worden gelezen. Exporteer de plattegrond als PNG of JPG en probeer opnieuw."
            : e instanceof Error && e.message
              ? e.message
              : "Dit bestand kon niet worden gelezen.",
        );
        return;
      }
      const nieuw: NieuwBeeld = { blob: jpeg, breedte: c.width, hoogte: c.height };
      setBeeld(nieuw);
      setStatus("Claude leest de plattegrond… dit duurt meestal 15 tot 40 seconden.");
      const data = bytesNaarBase64(await blobNaarBytes(jpeg));
      let r;
      ctl.current = new AbortController();
      try {
        r = await leesPlattegrond({
          signal: ctl.current.signal,
          data: {
            afbeelding: { data, type: "image/jpeg" },
            // eigen gegevens van de telling eruit; Claude krijgt alleen de tekening en de instructie
            notitie: anonimiseer(notitie.trim(), meta),
          },
        });
      } catch {
        setStatus(
          ctl.current?.signal.aborted ? "Gestopt." : aiMelding("geen_verbinding", "plattegrond"),
        );
        return;
      }
      setGebruik(r.gebruik);
      if (!r.ok) {
        setStatus(aiMelding(r.fout, "plattegrond", r.gebruik));
        return;
      }
      setR(r.data);
      setK(standaardKeuzes(r.data));
      setStatus("Klaar. Controleer de ruimten en neem ze over.");
    } finally {
      setBezig(false);
    }
  }

  const zetRuimte = (i: number, w: Partial<PlatKeuzes["ruimten"][number]>) =>
    setK((x) => x && { ...x, ruimten: x.ruimten.map((r, j) => (j === i ? { ...r, ...w } : r)) });

  const san = R ? sanitairTekst(R) : "";
  const aanrecht = R ? num(R.keuken.aanrecht_m) : 0;

  return (
    // min-w-0: anders maakt de brede tabel het venster breder dan het scherm (grid-kind)
    <div className="min-w-0 space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Plattegrond</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            disabled={bezig}
            onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Toelichting (optioneel)</span>
          <input
            type="text"
            maxLength={500}
            className={veldCls}
            disabled={bezig}
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
            placeholder="Bijv. maten in mm, 2e verdieping, zolder heeft vlizotrap"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Alleen de tekening en vaste instructies gaan naar Claude. Staat er een naam of adres op de
        tekening (bijv. in het stempel), snijd dat dan eerst weg. Zet in de toelichting geen namen
        of adressen.
      </p>
      {voorbeeld && (
        <img
          src={voorbeeld}
          alt="Voorbeeld plattegrond"
          className="max-h-64 max-w-full rounded-md border border-border bg-white"
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={inlezen} disabled={bezig}>
          Plattegrond inlezen
        </Button>
        {bezig && (
          <Button variant="outline" onClick={() => ctl.current?.abort()}>
            Stoppen
          </Button>
        )}
        <span className="text-muted-foreground" role="status">
          {status}
        </span>
        {gebruik && <span className="text-xs text-muted-foreground">{gebruikTekst(gebruik)}</span>}
      </div>

      {R && k && (
        <>
          <p className="rounded-md bg-muted px-3 py-2">
            <b>Maatvoering:</b> {R.maatvoering || "onbekend"}
          </p>
          <h3 className="font-semibold">Gevonden ruimten ({R.ruimten.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="p-1">Neem over</th>
                  <th className="p-1">Soort</th>
                  <th className="p-1">Naam</th>
                  <th className="p-1">Maten</th>
                  <th className="p-1">m²</th>
                  <th className="p-1">Bron</th>
                  <th className="p-1">Opmerking</th>
                </tr>
              </thead>
              <tbody>
                {R.ruimten.map((r, i) => {
                  const keuze = k.ruimten[i]!;
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="p-1">
                        <input
                          type="checkbox"
                          aria-label={"Overnemen: " + (r.naam || "ruimte " + (i + 1))}
                          checked={keuze.overnemen}
                          onChange={(e) => zetRuimte(i, { overnemen: e.target.checked })}
                        />
                      </td>
                      <td className="p-1">
                        <select
                          className={veldCls}
                          aria-label={"Soort: " + (r.naam || "ruimte " + (i + 1))}
                          value={keuze.soort}
                          onChange={(e) => zetRuimte(i, { soort: e.target.value })}
                        >
                          {VERTREK_TYPES.map((t) => (
                            <option key={"v" + t.k} value={"v:" + t.k}>
                              Vertrek: {t.l}
                            </option>
                          ))}
                          {OVERIG_TYPES.map((t) => (
                            <option key={"o" + t.k} value={"o:" + t.k}>
                              {(t.verkeer ? "" : "Overig: ") + t.l}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1">{r.naam}</td>
                      <td className="p-1 text-xs">
                        {r.lengte_m && r.breedte_m
                          ? fmt(r.lengte_m) + " × " + fmt(r.breedte_m)
                          : ""}
                      </td>
                      <td className="p-1">
                        <input
                          className={veldCls + " w-20"}
                          inputMode="decimal"
                          aria-label={"m²: " + (r.naam || "ruimte " + (i + 1))}
                          value={keuze.m2}
                          onChange={(e) => zetRuimte(i, { m2: e.target.value })}
                        />
                      </td>
                      <td className="p-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] text-white ${BRON_KLEUR[r.bron] ?? "bg-muted-foreground"}`}
                        >
                          {r.bron}
                        </span>
                      </td>
                      <td className="p-1 text-xs text-muted-foreground">{r.opmerking}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Vink
              aan={k.sanitair}
              uit={!san}
              zet={(v) => setK({ ...k, sanitair: v })}
              tekst={"Sanitair overnemen" + (san ? ": " + san : " (niets gevonden)")}
            />
            <Vink
              aan={k.keuken}
              uit={!(aanrecht > 0)}
              zet={(v) => setK({ ...k, keuken: v })}
              tekst={
                "Aanrecht overnemen" +
                (aanrecht > 0
                  ? ": " + fmt(aanrecht) + " m (" + (R.keuken.bron || "?") + ")"
                  : " (niet gevonden)")
              }
            />
            <Vink
              aan={k.buiten}
              uit={!R.buitenruimten.length}
              zet={(v) => setK({ ...k, buiten: v })}
              tekst={
                "Privé buitenruimte overnemen" +
                (R.buitenruimten.length ? ": " + buitenTekst(R) : " (niet gevonden)")
              }
            />
            <Vink
              aan={k.vervangen}
              zet={(v) => setK({ ...k, vervangen: v })}
              tekst="Bestaande ruimten vervangen (anders toevoegen)"
            />
          </div>
          {R.nameten.length > 0 && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2">
              <b>Ter plekke nameten of controleren:</b>
              <ul className="list-inside list-disc">
                {R.nameten.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Groen = letterlijk afgelezen, paars = berekend uit afgelezen maten, oranje = ingeschat.
            Controleer vooral de ingeschatte ruimten. Het beleidsboek meet binnenmaats op 1,50 m
            hoogte; dat is op een tekening niet altijd te zien.
          </p>
        </>
      )}
      <DialogFooter>
        <Button
          disabled={!R || !k || !beeld || bezig}
          onClick={() => R && k && beeld && onOvernemen(platToepassen(input, R, k), beeld)}
        >
          Overnemen
        </Button>
      </DialogFooter>
    </div>
  );
}

function Vink({
  aan,
  uit,
  zet,
  tekst,
}: {
  aan: boolean;
  uit?: boolean;
  zet: (v: boolean) => void;
  tekst: string;
}) {
  return (
    <label className={`flex items-start gap-2 ${uit ? "opacity-60" : ""}`}>
      <input
        type="checkbox"
        className="mt-1"
        checked={aan && !uit}
        disabled={uit}
        onChange={(e) => zet(e.target.checked)}
      />
      <span>{tekst}</span>
    </label>
  );
}
