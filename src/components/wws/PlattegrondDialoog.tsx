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
  pdfAantalPaginas,
  pdfPaginasNaarCanvassen,
  stapelCanvassen,
} from "@/lib/wws/plattegrond/beeld";
import {
  buitenTekst,
  platToepassen,
  standaardKeuzes,
  standaardVervangen,
  type PlatKeuzes,
} from "@/lib/wws/plattegrond/toepassen";
import {
  MAX_VERDIEPINGEN,
  stapelMaten,
  stelVerdiepingVoor,
  VERDIEPING_NAMEN,
  verdiepingenVan,
  verdiepingNotitie,
  volgendeVerdieping,
  voegVerdiepingenSamen,
} from "@/lib/wws/plattegrond/verdiepingen";
import type { NieuwBeeld } from "./plattegrondBeeld";

interface Tekening {
  id: number;
  bestand: File;
  /** Pagina van een PDF; null = afbeelding */
  pagina: number | null;
  /** Bestandsnaam, met de pagina bij een PDF met meer pagina's */
  naam: string;
  verdieping: string;
}

// groen = afgelezen, paars = berekend, oranje = ingeschat (zoals de bron), met tekst in AA-contrast
const BRON_KLEUR: Record<string, string> = {
  afgelezen: "bg-seg-hoog text-seg-foreground",
  berekend: "bg-primary text-primary-foreground",
  ingeschat: "bg-orange text-orange-foreground",
};
const veldCls =
  "rounded-lg border border-transparent bg-muted px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
            Upload een plattegrond als afbeelding (PNG of JPG) of PDF. Meer verdiepingen? Kies alle
            tekeningen, of een PDF met een pagina per verdieping. Claude leest de maten af en zet de
            ruimten klaar. Je controleert alles voordat het in de telling komt. Gebruik bij voorkeur
            een tekening met maatvoering; zonder maten zijn de oppervlakten alleen een schatting.
          </DialogDescription>
        </DialogHeader>
        {p.open && <PlattegrondInlezen {...p} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Het inlezen zelf (bestand, Claude, controle, overnemen). Ook gebruikt als plattegrondstap van de
 * "Blanco"-start van het indelingsadvies (renderIndelingPlattegrondStap): dan altijd vervangen
 * (de telling is nog leeg) en een andere knoptekst — applyIndPlat().
 */
export function PlattegrondInlezen({
  input,
  meta,
  onOvernemen,
  vastVervangen = false,
  knopTekst = "Overnemen",
  beginBestanden,
  beginVerdiepingen,
}: Omit<Props, "open" | "onOpenChange"> & {
  vastVervangen?: boolean;
  knopTekst?: string;
  /** "Map inlezen": de plattegrond(en) zijn al gekozen */
  beginBestanden?: readonly File[];
  /** De verdieping per beginbestand (al gekozen bij het nakijken van de map) */
  beginVerdiepingen?: readonly string[];
}) {
  // meer verdiepingen (elk apart naar Claude); niet in de Blanco-start van het indelingsadvies,
  // dat de vlakken op één tekening nodig heeft
  const meer = !vastVervangen;
  const [tekeningen, setTekeningen] = useState<Tekening[]>([]);
  const [notitie, setNotitie] = useState("");
  const [beeld, setBeeld] = useState<NieuwBeeld | null>(null);
  const [voorbeeld, setVoorbeeld] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [status, setStatus] = useState("");
  const [R, setR] = useState<PlattegrondAntwoord | null>(null);
  const [verdiepingen, setVerdiepingen] = useState<string[]>([]);
  const [k, setK] = useState<PlatKeuzes | null>(null);
  const [gebruik, setGebruik] = useState<Gebruik | undefined>();
  const ctl = useRef<AbortController | null>(null);
  const volgnr = useRef(0);
  const begonnen = useRef(false);

  useEffect(() => {
    if (!beeld) return;
    const u = URL.createObjectURL(beeld.blob);
    setVoorbeeld(u);
    return () => URL.revokeObjectURL(u);
  }, [beeld]);

  /** Bestanden erbij (een PDF met meer pagina's: elke pagina een tekening); hoogstens 4 */
  async function voegToe(
    bestanden: readonly File[],
    vervang: boolean,
    gekozen: readonly string[] = [],
  ) {
    const al = vervang ? [] : tekeningen;
    const nieuw: Tekening[] = [];
    let teVeel = false;
    for (const [b, bestand] of bestanden.entries()) {
      let paginas: (number | null)[] = [null];
      if (bestand.type === "application/pdf" && meer) {
        try {
          const n = await pdfAantalPaginas(bestand);
          paginas = Array.from({ length: n }, (_, i) => i + 1);
        } catch {
          setStatus("De PDF kon niet worden gelezen.");
          continue;
        }
      } else if (bestand.type === "application/pdf") paginas = [1];
      for (const pagina of paginas) {
        if (al.length + nieuw.length >= (meer ? MAX_VERDIEPINGEN : 1)) {
          teVeel = true;
          break;
        }
        const nr = al.length + nieuw.length;
        nieuw.push({
          id: volgnr.current++,
          bestand,
          pagina,
          naam: bestand.name + (paginas.length > 1 ? ", pagina " + pagina : ""),
          verdieping: gekozen[b]
            ? // al gekozen; bij een PDF met meer pagina's de volgende pagina's één hoger
              volgendeVerdieping(gekozen[b], (pagina ?? 1) - 1)
            : paginas.length > 1
              ? stelVerdiepingVoor("", nr)
              : stelVerdiepingVoor(bestand.name, nr),
        });
      }
    }
    // van laag naar hoog (kelder, begane grond, 1e, …, zolder); verder in de gekozen volgorde
    const plek = (t: Tekening) => {
      const i = (VERDIEPING_NAMEN as readonly string[]).indexOf(t.verdieping);
      return i < 0 ? VERDIEPING_NAMEN.length : i;
    };
    setTekeningen([...al, ...[...nieuw].sort((a, b) => plek(a) - plek(b))]);
    setR(null);
    setK(null);
    setStatus(
      teVeel
        ? `Hoogstens ${MAX_VERDIEPINGEN} tekeningen tegelijk; de rest is niet toegevoegd.`
        : "",
    );
  }

  useEffect(() => {
    if (begonnen.current || !beginBestanden?.length) return;
    begonnen.current = true;
    void voegToe(beginBestanden, true, beginVerdiepingen);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij het openen
  }, []);

  async function canvasVan(t: Tekening): Promise<HTMLCanvasElement> {
    if (t.pagina === null) return bestandNaarCanvas(t.bestand);
    const [c] = await pdfPaginasNaarCanvassen(t.bestand, [t.pagina]);
    if (!c) throw new Error("Deze pagina kon niet worden gelezen.");
    return c;
  }

  async function inlezen() {
    if (!tekeningen.length) {
      setStatus("Kies eerst een bestand.");
      return;
    }
    if (new Set(tekeningen.map((t) => t.verdieping)).size < tekeningen.length) {
      setStatus("Twee tekeningen hebben dezelfde verdieping. Kies per tekening een andere.");
      return;
    }
    setBezig(true);
    setR(null);
    setK(null);
    const n = tekeningen.length;
    try {
      const delen: { verdieping: string; R: PlattegrondAntwoord }[] = [];
      const canvassen: HTMLCanvasElement[] = [];
      let eersteJpeg: Blob | null = null;
      ctl.current = new AbortController();
      for (const [j, t] of tekeningen.entries()) {
        const wie = n > 1 ? t.verdieping + ": " : "";
        setStatus(wie + "Tekening voorbereiden…");
        let jpeg: Blob, c: HTMLCanvasElement;
        try {
          c = await canvasVan(t);
          jpeg = await canvasNaarJpeg(c);
        } catch (e) {
          setStatus(
            wie +
              (t.bestand.type === "application/pdf"
                ? "De PDF kon niet worden gelezen. Exporteer de plattegrond als PNG of JPG en probeer opnieuw."
                : e instanceof Error && e.message
                  ? e.message
                  : "Dit bestand kon niet worden gelezen."),
          );
          return;
        }
        if (n === 1) setBeeld({ blob: jpeg, breedte: c.width, hoogte: c.height });
        eersteJpeg ??= jpeg;
        setStatus(
          n > 1
            ? `Claude leest ${t.verdieping.toLowerCase()} (${j + 1} van ${n})… dit duurt meestal 15 tot 40 seconden per tekening.`
            : "Claude leest de plattegrond… dit duurt meestal 15 tot 40 seconden.",
        );
        const data = bytesNaarBase64(await blobNaarBytes(jpeg));
        // eigen gegevens van de telling eruit; Claude krijgt alleen de tekening en de instructie
        const eigen = anonimiseer(notitie.trim(), meta);
        let r;
        try {
          r = await leesPlattegrond({
            signal: ctl.current.signal,
            data: {
              afbeelding: { data, type: "image/jpeg" },
              notitie: n > 1 ? verdiepingNotitie(t.verdieping, eigen) : eigen,
            },
          });
        } catch {
          setStatus(
            ctl.current?.signal.aborted
              ? "Gestopt."
              : wie + aiMelding("geen_verbinding", "plattegrond"),
          );
          return;
        }
        setGebruik(r.gebruik);
        if (!r.ok) {
          setStatus(wie + aiMelding(r.fout, "plattegrond", r.gebruik));
          return;
        }
        delen.push({ verdieping: t.verdieping, R: r.data });
        canvassen.push(c);
      }
      if (n > 1) {
        setStatus("De tekeningen onder elkaar zetten…");
        const maten = stapelMaten(canvassen.map((c) => ({ breedte: c.width, hoogte: c.height })));
        const c = stapelCanvassen(
          canvassen,
          tekeningen.map((t) => t.verdieping),
          maten,
        );
        try {
          setBeeld({
            blob: await canvasNaarJpeg(c),
            breedte: c.width,
            hoogte: c.height,
            verdiepingen: verdiepingenVan(
              maten,
              tekeningen.map((t) => t.verdieping),
            ),
          });
        } catch (e) {
          setStatus(e instanceof Error ? e.message : "Samenvoegen van de tekeningen is mislukt.");
          return;
        }
      }
      const samen = voegVerdiepingenSamen(delen);
      setR(samen.R);
      setVerdiepingen(n > 1 ? samen.verdiepingen : []);
      setK({ ...standaardKeuzes(samen.R), vervangen: vastVervangen || standaardVervangen(input) });
      // runIndPlat() in de Blanco-start zegt "ga door" (daar heet de knop Doorgaan)
      setStatus(
        vastVervangen
          ? "Klaar. Controleer de ruimten en ga door."
          : "Klaar. Controleer de ruimten en neem ze over.",
      );
    } finally {
      setBezig(false);
    }
  }

  const zetRuimte = (i: number, w: Partial<PlatKeuzes["ruimten"][number]>) =>
    setK((x) => x && { ...x, ruimten: x.ruimten.map((r, j) => (j === i ? { ...r, ...w } : r)) });

  const aanrecht = R ? num(R.keuken.aanrecht_m) : 0;

  return (
    // min-w-0: anders maakt de brede tabel het venster breder dan het scherm (grid-kind)
    <div className="min-w-0 space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">
            {meer ? "Plattegrond (één of meer verdiepingen)" : "Plattegrond"}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            multiple={meer}
            disabled={bezig}
            onChange={(e) => {
              void voegToe([...(e.target.files ?? [])], !meer);
              e.target.value = "";
            }}
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
      {meer && tekeningen.length > 0 && (
        <ul className="space-y-1">
          {tekeningen.map((t, i) => {
            const naam = t.naam;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={"Verdieping: " + naam}
                  className={veldCls}
                  disabled={bezig}
                  value={t.verdieping}
                  onChange={(e) =>
                    setTekeningen((ts) =>
                      ts.map((x, j) => (j === i ? { ...x, verdieping: e.target.value } : x)),
                    )
                  }
                >
                  {[...new Set([t.verdieping, ...VERDIEPING_NAMEN])].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <span className="break-all">{naam}</span>
                <button
                  type="button"
                  aria-label={"Weghalen: " + naam}
                  disabled={bezig}
                  className="rounded px-1.5 text-xs hover:text-destructive"
                  onClick={() => {
                    setTekeningen((ts) => ts.filter((_, j) => j !== i));
                    setR(null);
                    setK(null);
                  }}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {meer && tekeningen.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Elke tekening wordt apart ingelezen en telt als één AI-aanroep. In de telling komen de
          tekeningen onder elkaar op één afbeelding.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Alleen de tekening en vaste instructies gaan naar Claude. Staat er een naam of adres op de
        tekening (bijv. in het stempel), snijd dat dan eerst weg. Zet in de toelichting geen namen
        of adressen.
      </p>
      {voorbeeld && (
        <img
          src={voorbeeld}
          alt="Voorbeeld plattegrond"
          className="max-h-64 max-w-full rounded-lg border border-border bg-white"
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
                  {verdiepingen.length > 0 && <th className="p-1">Verdieping</th>}
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
                      {verdiepingen.length > 0 && <td className="p-1">{verdiepingen[i]}</td>}
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
                          className={`rounded-lg px-2 py-0.5 text-[11px] ${BRON_KLEUR[r.bron] ?? "bg-muted text-foreground"}`}
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
            {!vastVervangen && (
              <Vink
                aan={k.vervangen}
                zet={(v) => setK({ ...k, vervangen: v })}
                tekst="Bestaande ruimten vervangen (anders toevoegen). Al ingevulde voorzieningen blijven bij dezelfde soort ruimte."
              />
            )}
          </div>
          {R.nameten.length > 0 && (
            <div className="rounded-lg bg-warn px-3 py-2">
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
          onClick={() =>
            R &&
            k &&
            beeld &&
            onOvernemen(
              platToepassen(input, R, k, verdiepingen.length ? { verdiepingen } : {}),
              beeld,
            )
          }
        >
          {knopTekst}
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
