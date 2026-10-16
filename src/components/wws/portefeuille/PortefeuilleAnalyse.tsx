import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Rechten } from "@/lib/rollen";
import {
  analyseer,
  portefeuilleNormen,
  type AnalyseAdres,
  type AnalyseUitkomst,
} from "@/lib/wws/portefeuille/analyse";
import { adresTekst } from "@/lib/wws/portefeuille/adres";
import { nlDatum, plusMaanden, vandaag } from "@/lib/wws/portefeuille/datum";
import type { ImportUitkomst } from "@/lib/wws/portefeuille/importeren";
import { aantal } from "@/lib/wws/portefeuille/tekst";
import { stopMelding } from "@/lib/wws/portefeuille/ophalen";
import {
  MAX_PER_PORTIE,
  haalLabelsOp,
  vulAdressenAanBijPdok,
} from "@/lib/wws/portefeuille/portefeuille.functions";
import { maakPortefeuillePdf } from "@/lib/wws/pdf/portefeuille";
import { useNormen } from "../NormenContext";
import {
  klantenQuery,
  portefeuilleAdressenQuery,
  portefeuilleAnalysesQuery,
  portefeuilleStore,
  portefeuillesQuery,
} from "../tellingStore";
import { useDownload } from "../useDownload";
import { AnalyseWeergave } from "./AnalyseWeergave";
import { BloxsDialoog } from "./BloxsDialoog";
import { CombiAnalyse } from "./CombiAnalyse";
import { PortefeuilleDelenDialoog } from "./PortefeuilleDelenDialoog";
import { ImportDialoog } from "./ImportDialoog";

type OpnieuwKeuze = "alle" | "probleem" | "oud";

interface Voortgang {
  gedaan: number;
  /** Tot en met dit adres loopt de huidige portie */
  tot: number;
  totaal: number;
}

/** Portefeuille-analyse energielabels (nieuw onderdeel, niet in wws-site.html) */
export default function PortefeuilleAnalyse({
  rechten,
  userId,
}: {
  rechten: Rechten;
  userId: string;
}) {
  const qc = useQueryClient();
  const N = useNormen();
  const instellingen = useMemo(() => portefeuilleNormen(N.portefeuille), [N]);
  const download = useDownload();
  const { data: portefeuilles = [], isPending } = useQuery(portefeuillesQuery());
  const { data: klanten = [] } = useQuery(klantenQuery());
  const [gekozen, setGekozen] = useState<string | null>(null);
  const p = portefeuilles.find((x) => x.id === gekozen) ?? portefeuilles[0] ?? null;
  const adressenQ = useQuery({ ...portefeuilleAdressenQuery(p?.id ?? ""), enabled: !!p });
  const analysesQ = useQuery({ ...portefeuilleAnalysesQuery(p?.id ?? ""), enabled: !!p });
  const alleAdressen = useMemo(() => adressenQ.data ?? [], [adressenQ.data]);
  // adressen die bij de laatste Bloxs-sync niet meer voorkwamen tellen niet mee (wel zichtbaar)
  const adressen = useMemo(() => alleAdressen.filter((a) => !a.nietInBloxsSinds), [alleAdressen]);
  const vervallen = useMemo(() => alleAdressen.filter((a) => a.nietInBloxsSinds), [alleAdressen]);
  const uitBloxs = p?.bron === "bloxs";

  const [importOpen, setImportOpen] = useState<"nieuw" | "toevoegen" | null>(null);
  const [bloxsOpen, setBloxsOpen] = useState<"nieuw" | "opnieuw" | null>(null);
  const [modus, setModus] = useState<"een" | "combi">("een");
  const [verwijderVraag, setVerwijderVraag] = useState(false);
  const [delenOpen, setDelenOpen] = useState(false);
  const [datum, setDatum] = useState(vandaag());
  const [venster, setVenster] = useState("3");
  const [bekeken, setBekeken] = useState<{ id: string; uitkomst: AnalyseUitkomst } | null>(null);
  const [opnieuw, setOpnieuw] = useState<OpnieuwKeuze>("probleem");
  const [voortgang, setVoortgang] = useState<Voortgang | null>(null);
  const [aanvullen, setAanvullen] = useState<{ gedaan: number; totaal: number } | null>(null);
  const [melding, setMelding] = useState("");
  const stoppen = useRef(false);

  const maanden = Math.min(24, Math.max(1, Math.round(Number(venster)) || 3));
  const live = useMemo(
    () =>
      analyseer(
        adressen,
        /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : vandaag(),
        maanden,
        instellingen,
      ),
    [adressen, datum, maanden, instellingen],
  );
  const toon = bekeken?.uitkomst ?? live;

  const magBeheren = (createdBy: string | null) =>
    rechten.magSchrijven && (createdBy === userId || rechten.isAdmin);
  const eigenaarNaam = p?.klantId ? (klanten.find((k) => k.id === p.klantId)?.naam ?? null) : null;
  const zonderResultaat = adressen.filter((a) => !a.resultaat);
  // PDOK alleen voor geïmporteerde portefeuilles; bij Bloxs komen straat en woonplaats uit Bloxs
  const zonderStraat = uitBloxs ? [] : adressen.filter((a) => !a.straat);
  const bezig = voortgang !== null || aanvullen !== null;

  function vernieuw() {
    if (!p) return;
    void qc.invalidateQueries({ queryKey: ["portefeuille-adressen", p.id] });
    void qc.invalidateQueries({ queryKey: ["portefeuilles"] });
  }

  /**
   * Straat en woonplaats aanvullen via PDOK voor adressen zonder straat (in porties van 10). Niet
   * gevonden adressen houden alleen postcode en huisnummer; het aanvullen is niet nodig voor de
   * analyse, dus een storing bij PDOK geeft alleen een melding.
   */
  async function vulAan(portefeuilleId: string, lijst: readonly AnalyseAdres[]) {
    if (!lijst.length) return;
    setAanvullen({ gedaan: 0, totaal: lijst.length });
    let gedaan = 0;
    try {
      for (let i = 0; i < lijst.length; i += MAX_PER_PORTIE) {
        const portie = lijst.slice(i, i + MAX_PER_PORTIE);
        const r = await vulAdressenAanBijPdok({
          data: {
            adressen: portie.map((a) => ({
              id: a.id,
              postcode: a.postcode,
              huisnummer: a.huisnummer,
            })),
          },
        });
        await portefeuilleStore.vulAdressenAan(r.aangevuld);
        gedaan += r.aangevuld.length + r.nietGevonden.length;
        setAanvullen({ gedaan, totaal: lijst.length });
        if (r.stop) {
          toast.error(
            r.stop === "te_veel_verzoeken"
              ? "PDOK geeft aan dat er te veel verzoeken zijn. Straat en woonplaats aanvullen is gestopt; probeer het later opnieuw."
              : "PDOK is nu niet bereikbaar. Straat en woonplaats aanvullen is gestopt; probeer het later opnieuw.",
          );
          break;
        }
      }
    } catch {
      toast.error("Straat en woonplaats aanvullen lukte niet. Probeer het later opnieuw.");
    } finally {
      setAanvullen(null);
      void qc.invalidateQueries({ queryKey: ["portefeuille-adressen", portefeuilleId] });
    }
  }

  /** In porties van 10 ophalen bij EP-Online, opslaan, en de voortgang bijhouden */
  async function ophalen(lijst: readonly AnalyseAdres[]) {
    if (!p || !lijst.length || bezig) return;
    stoppen.current = false;
    setMelding("");
    setBekeken(null);
    setVoortgang({ gedaan: 0, tot: 0, totaal: lijst.length });
    let gedaan = 0;
    try {
      for (let i = 0; i < lijst.length; i += MAX_PER_PORTIE) {
        if (stoppen.current) {
          setMelding(
            "Gestopt. Met ‘Hervatten’ gaat het ophalen verder bij de adressen zonder resultaat.",
          );
          break;
        }
        const portie = lijst.slice(i, i + MAX_PER_PORTIE).map((a) => ({
          id: a.id,
          postcode: a.postcode,
          huisnummer: a.huisnummer,
          huisletter: a.huisletter,
          toevoeging: a.toevoeging,
        }));
        setVoortgang({ gedaan, tot: gedaan + portie.length, totaal: lijst.length });
        const r = await haalLabelsOp({ data: { adressen: portie } });
        await portefeuilleStore.slaResultatenOp(p.id, userId, r.resultaten);
        gedaan += r.resultaten.length;
        setVoortgang({ gedaan, tot: gedaan, totaal: lijst.length });
        if (r.stop) {
          setMelding(stopMelding(r.stop));
          break;
        }
      }
      if (gedaan === lijst.length) toast.success("Energielabels opgehaald (" + gedaan + ").");
    } catch {
      setMelding(stopMelding("geen_verbinding"));
    } finally {
      setVoortgang(null);
      vernieuw();
    }
  }

  function opnieuwLijst(k: OpnieuwKeuze): AnalyseAdres[] {
    if (k === "alle") return adressen;
    if (k === "probleem")
      return adressen.filter((a) => a.resultaat && a.resultaat.status !== "gevonden");
    const grens = plusMaanden(vandaag(), -1);
    return adressen.filter((a) => a.resultaat && a.resultaat.opgehaaldOp.slice(0, 10) < grens);
  }

  async function importeer(w: { naam: string; klantId: string | null }, u: ImportUitkomst) {
    const id =
      importOpen === "toevoegen" && p ? p.id : await portefeuilleStore.maak(w.naam, w.klantId);
    const nieuw = await portefeuilleStore.voegAdressenToe(id, u.adressen);
    toast.success(
      nieuw +
        " adressen toegevoegd" +
        (u.adressen.length > nieuw
          ? " (" + (u.adressen.length - nieuw) + " stonden er al in)"
          : "") +
        ".",
    );
    setGekozen(id);
    setBekeken(null);
    await qc.invalidateQueries({ queryKey: ["portefeuilles"] });
    await qc.invalidateQueries({ queryKey: ["portefeuille-adressen", id] });
    // straat en woonplaats die niet in het bestand stonden meteen aanvullen via PDOK
    const alle = await qc.fetchQuery(portefeuilleAdressenQuery(id));
    void vulAan(
      id,
      alle.filter((a) => !a.straat),
    );
  }

  async function verwijderVervallen() {
    if (!p) return;
    try {
      await portefeuilleStore.verwijderAdressen(vervallen.map((a) => a.id));
      toast.success(aantal(vervallen.length, "adres", "adressen") + " verwijderd.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen lukte niet.");
    } finally {
      vernieuw();
    }
  }

  async function bloxsKlaar(id: string) {
    setGekozen(id);
    setBekeken(null);
    void qc.invalidateQueries({ queryKey: ["klanten"] });
    await qc.invalidateQueries({ queryKey: ["portefeuilles"] });
    await qc.invalidateQueries({ queryKey: ["portefeuille-adressen", id] });
  }

  async function verwijderPortefeuille() {
    if (!p) return;
    try {
      await portefeuilleStore.verwijder(p.id);
      toast.success("Portefeuille verwijderd.");
      setGekozen(null);
      setBekeken(null);
      await qc.invalidateQueries({ queryKey: ["portefeuilles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen lukte niet.");
    }
  }

  async function slaOp() {
    if (!p) return;
    try {
      await portefeuilleStore.slaAnalyseOp(p.id, live);
      toast.success("Analyse opgeslagen.");
      await qc.invalidateQueries({ queryKey: ["portefeuille-analyses", p.id] });
      void qc.invalidateQueries({ queryKey: ["archief-analyses"] });
    } catch (e) {
      toast.error("Opslaan lukte niet: " + (e instanceof Error ? e.message : ""));
    }
  }

  async function verwijderAnalyse(id: string) {
    if (!p) return;
    try {
      await portefeuilleStore.verwijderAnalyse(id);
      if (bekeken?.id === id) setBekeken(null);
      await qc.invalidateQueries({ queryKey: ["portefeuille-analyses", p.id] });
      void qc.invalidateQueries({ queryKey: ["archief-analyses"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen lukte niet.");
    }
  }

  const pdf = (u: AnalyseUitkomst, sleutel: string) =>
    download.pdf(sleutel, (lib) =>
      maakPortefeuillePdf(lib, { portefeuille: p!.naam, eigenaar: eigenaarNaam, uitkomst: u }),
    );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 max-[720px]:px-3">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Portefeuille-analyse</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Energielabels per portefeuille: welke labels verlopen binnenkort, zijn verouderd of
          ontbreken, en welke woningen vallen onder de EFG-regels.
        </p>
      </div>

      {portefeuilles.length >= 2 && (
        <div role="tablist" aria-label="Soort analyse" className="mb-4 flex flex-wrap gap-1">
          {(
            [
              ["een", "Eén portefeuille"],
              ["combi", "Meerdere portefeuilles"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modus === m}
              disabled={bezig}
              onClick={() => setModus(m)}
              className={
                "rounded-full px-3 py-1 text-sm " +
                (modus === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {modus === "combi" && portefeuilles.length >= 2 ? (
        <CombiAnalyse
          rechten={rechten}
          portefeuilles={portefeuilles}
          klanten={klanten}
          instellingen={instellingen}
          onOpen={(id) => {
            setGekozen(id);
            setBekeken(null);
            setModus("een");
          }}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4">
            <label className="flex min-w-56 flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Portefeuille</span>
              <select
                className="h-9 rounded-xl border border-input bg-background px-2"
                value={p?.id ?? ""}
                onChange={(e) => {
                  setGekozen(e.target.value);
                  setBekeken(null);
                  setMelding("");
                }}
                disabled={!portefeuilles.length || bezig}
              >
                {!portefeuilles.length && (
                  <option value="">{isPending ? "Laden…" : "Nog geen portefeuilles"}</option>
                )}
                {portefeuilles.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.naam} ({x.aantalAdressen})
                    {x.createdBy && x.createdBy !== userId ? " · van een collega" : ""}
                  </option>
                ))}
              </select>
            </label>
            {rechten.magSchrijven && (
              <>
                <Button onClick={() => setImportOpen("nieuw")} disabled={bezig}>
                  Portefeuille importeren
                </Button>
                {p && !uitBloxs && (
                  <Button
                    variant="outline"
                    onClick={() => setImportOpen("toevoegen")}
                    disabled={bezig}
                  >
                    Adressen toevoegen
                  </Button>
                )}
                <Button variant="outline" onClick={() => setBloxsOpen("nieuw")} disabled={bezig}>
                  Uit Bloxs
                </Button>
                {p && uitBloxs && (
                  <Button
                    variant="outline"
                    onClick={() => setBloxsOpen("opnieuw")}
                    disabled={bezig}
                  >
                    Opnieuw inladen uit Bloxs
                  </Button>
                )}
              </>
            )}
            {p && magBeheren(p.createdBy) && (
              <Button
                variant="outline"
                className="ml-auto"
                onClick={() => setDelenOpen(true)}
                disabled={bezig}
              >
                Delen
              </Button>
            )}
            {p && magBeheren(p.createdBy) && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setVerwijderVraag(true)}
                disabled={bezig}
              >
                Portefeuille verwijderen
              </Button>
            )}
          </div>

          {!p ? (
            <p className="text-muted-foreground">
              {isPending
                ? "Laden…"
                : rechten.magSchrijven
                  ? "Importeer een portefeuille om te beginnen."
                  : "Er zijn nog geen portefeuilles."}
            </p>
          ) : (
            <div className="space-y-4">
              {/* ---------- ophalen ---------- */}
              <section
                className="rounded-2xl border border-border bg-card p-4"
                aria-label="Energielabels ophalen"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <span>
                    <b>{adressen.length}</b> adressen ·{" "}
                    <b>{adressen.length - zonderResultaat.length}</b> opgehaald
                    {zonderResultaat.length > 0 && <> · {zonderResultaat.length} nog niet</>}
                    {aanvullen && (
                      <span className="text-muted-foreground">
                        {" "}
                        · straat en woonplaats aanvullen: {aanvullen.gedaan} van {aanvullen.totaal}
                      </span>
                    )}
                  </span>
                  {rechten.magSchrijven && (
                    <div className="flex flex-wrap items-center gap-2">
                      {voortgang ? (
                        <Button variant="outline" onClick={() => (stoppen.current = true)}>
                          Stoppen
                        </Button>
                      ) : (
                        <>
                          <Button
                            disabled={bezig || !zonderResultaat.length}
                            onClick={() => void ophalen(zonderResultaat)}
                          >
                            {adressen.length > zonderResultaat.length && zonderResultaat.length
                              ? "Hervatten"
                              : "Ophalen"}{" "}
                            ({zonderResultaat.length})
                          </Button>
                          <select
                            aria-label="Opnieuw ophalen: welke adressen"
                            className="h-9 max-w-full rounded-xl border border-input bg-background px-2"
                            value={opnieuw}
                            onChange={(e) => setOpnieuw(e.target.value as OpnieuwKeuze)}
                          >
                            <option value="probleem">
                              Niet gevonden, niet eenduidig of mislukt
                            </option>
                            <option value="oud">Ouder dan een maand</option>
                            <option value="alle">Alle adressen</option>
                          </select>
                          <Button
                            variant="outline"
                            disabled={bezig || !opnieuwLijst(opnieuw).length}
                            onClick={() => void ophalen(opnieuwLijst(opnieuw))}
                          >
                            Opnieuw ophalen ({opnieuwLijst(opnieuw).length})
                          </Button>
                          {zonderStraat.length > 0 && (
                            <Button
                              variant="ghost"
                              disabled={bezig}
                              onClick={() => p && void vulAan(p.id, zonderStraat)}
                            >
                              Straat en woonplaats aanvullen ({zonderStraat.length})
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {voortgang && (
                  <div className="mt-3">
                    <div
                      className="h-2 overflow-hidden rounded-full bg-secondary"
                      role="progressbar"
                      aria-label="Voortgang ophalen"
                      aria-valuemin={0}
                      aria-valuemax={voortgang.totaal}
                      aria-valuenow={voortgang.gedaan}
                    >
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: (voortgang.gedaan / voortgang.totaal) * 100 + "%" }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {voortgang.gedaan} van {voortgang.totaal} klaar
                      {voortgang.tot > voortgang.gedaan &&
                        ` · bezig met ${voortgang.gedaan + 1}–${voortgang.tot}`}{" "}
                      · ongeveer {instellingen.epPerSeconde} per seconde
                    </p>
                  </div>
                )}
                {melding && (
                  <p className="mt-2 text-sm text-orange-ink" role="alert">
                    {melding}
                  </p>
                )}
                {uitBloxs && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Uit Bloxs
                    {p.bloxsGesynchroniseerdOp
                      ? " · laatst ingeladen " +
                        new Date(p.bloxsGesynchroniseerdOp).toLocaleString("nl-NL", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : ""}
                  </p>
                )}
                {vervallen.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="text-orange-ink">
                      {aantal(vervallen.length, "adres", "adressen")} niet meer in Bloxs (telt niet
                      mee in de analyse)
                    </summary>
                    <ul className="mt-1 max-h-40 overflow-y-auto text-muted-foreground">
                      {vervallen.map((a) => (
                        <li key={a.id}>{adresTekst(a)}</li>
                      ))}
                    </ul>
                    {rechten.magSchrijven && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 text-destructive hover:text-destructive"
                        disabled={bezig}
                        onClick={() => void verwijderVervallen()}
                      >
                        Deze adressen verwijderen
                      </Button>
                    )}
                  </details>
                )}
              </section>

              {/* ---------- analyse ---------- */}
              <section
                className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4"
                aria-label="Analyse"
              >
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Analysedatum</span>
                  <Input
                    type="date"
                    value={datum}
                    onChange={(e) => (setDatum(e.target.value), setBekeken(null))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Venster (maanden)</span>
                  <Input
                    inputMode="numeric"
                    className="w-24"
                    value={venster}
                    onChange={(e) => (setVenster(e.target.value), setBekeken(null))}
                  />
                </label>
                {rechten.magSchrijven && (
                  <Button
                    variant="outline"
                    onClick={() => void slaOp()}
                    disabled={bezig || !adressen.length}
                  >
                    Analyse opslaan
                  </Button>
                )}
                <Button
                  onClick={() => void pdf(toon, "pdf")}
                  disabled={!!download.bezig || !adressen.length}
                >
                  {download.bezig === "pdf" ? "PDF maken…" : "PDF"}
                </Button>
              </section>

              {bekeken && (
                <p
                  className="rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-sm"
                  role="status"
                >
                  Je bekijkt een opgeslagen analyse van {nlDatum(bekeken.uitkomst.datum)}.{" "}
                  <button type="button" className="underline" onClick={() => setBekeken(null)}>
                    Terug naar de actuele analyse
                  </button>
                </p>
              )}

              {adressenQ.isPending ? (
                <p className="text-muted-foreground">Adressen laden…</p>
              ) : (
                <AnalyseWeergave uitkomst={toon} />
              )}

              {/* ---------- opgeslagen analyses ---------- */}
              <section
                className="rounded-2xl border border-border bg-card p-4"
                aria-label="Opgeslagen analyses"
              >
                <h3 className="mb-2 font-semibold">Opgeslagen analyses</h3>
                {analysesQ.data?.length ? (
                  <ul className="divide-y divide-border text-sm">
                    {analysesQ.data.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                        <span className="min-w-[12rem] flex-1">
                          Analyse per {nlDatum(a.uitkomst.datum)} · {a.uitkomst.vensterMaanden} mnd
                          ·{" "}
                          <span className="text-muted-foreground">
                            opgeslagen{" "}
                            {new Date(a.gemaaktOp).toLocaleString("nl-NL", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setBekeken({ id: a.id, uitkomst: a.uitkomst })}
                        >
                          Bekijken
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void pdf(a.uitkomst, a.id)}
                          disabled={!!download.bezig}
                        >
                          PDF
                        </Button>
                        {magBeheren(a.gemaaktDoor) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void verwijderAnalyse(a.id)}
                          >
                            Verwijderen
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nog geen opgeslagen analyses.</p>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {p && (
        <PortefeuilleDelenDialoog
          open={delenOpen}
          onOpenChange={setDelenOpen}
          portefeuilles={[p]}
          userId={userId}
          isAdmin={rechten.isAdmin}
        />
      )}
      <BloxsDialoog
        open={bloxsOpen !== null}
        onOpenChange={(o) => !o && setBloxsOpen(null)}
        klanten={klanten}
        bestaand={bloxsOpen === "opnieuw" ? p : null}
        portefeuilles={portefeuilles}
        onKlaar={bloxsKlaar}
      />
      <ImportDialoog
        open={importOpen !== null}
        onOpenChange={(o) => !o && setImportOpen(null)}
        klanten={klanten}
        bestaand={importOpen === "toevoegen" && p ? { id: p.id, naam: p.naam } : null}
        onImporteer={importeer}
      />
      <AlertDialog open={verwijderVraag} onOpenChange={setVerwijderVraag}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Portefeuille verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              ‘{p?.naam}’ wordt definitief verwijderd, met alle {p?.aantalAdressen} adressen,
              opgehaalde labels en opgeslagen analyses. Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void verwijderPortefeuille()}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
