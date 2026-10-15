import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SEGMENT_NAMEN, type OverigeRuimte, type Vertrek, type WwsInput } from "@/lib/wws";
import { actievePves, pasPveOpFac, pasPveToe, pveVoorTelling } from "@/lib/wws/pve";
import { magTellingBewerken, type Rechten } from "@/lib/rollen";
import {
  legVersieVast,
  nieuweTellingStaat,
  openVersieInStaat,
  slaWerkversieOp,
  standaardVersieNaam,
  type Bewerker,
  type TellingMeta,
  type TellingStaat,
  type Versie,
} from "@/lib/wws/opslag";
import { adresFoutMelding } from "@/lib/wws/opzoeken/dienst";
import { epToepassen, type EpLabel } from "@/lib/wws/opzoeken/eponline";
import { zoekAdres } from "@/lib/wws/opzoeken/opzoeken.functions";
import { adresOpzoekenNodig, adresToepassen, adresZoekVelden } from "@/lib/wws/opzoeken/pdok";
import AdviesDialoog from "./AdviesDialoog";
import EnergielabelOphalen from "./EnergielabelOphalen";
import DelenDialoog from "./DelenDialoog";
import EigenaarKeuze from "./EigenaarKeuze";
import IndelingDialoog, { type IndelingKeuze } from "./IndelingDialoog";
import PveToepassenDialoog, { type PveVraag } from "./PveToepassenDialoog";
import WwsCalculator from "./WwsCalculator";
import { useNormen } from "./NormenContext";
import { klantenQuery, tellingStore } from "./tellingStore";

const NIET_OPGESLAGEN = "Er zijn niet-opgeslagen wijzigingen. Toch doorgaan?";

const foutTekst = (e: unknown) =>
  e instanceof Error ? e.message : ((e as { message?: string })?.message ?? "Er ging iets mis.");

const datumTijd = (iso: string) =>
  iso ? new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" }) : "";

interface Props {
  /** Te openen telling (uit ?id=); leeg = nieuwe telling */
  tellingId: string | undefined;
  userId: string;
  bewerker: Bewerker;
  rechten: Rechten;
}

type Laden = "bezig" | "klaar" | "niet-gevonden";

/**
 * Een telling bewerken en opslaan: werkversie opslaan, een versie vastleggen en een
 * eerdere versie openen — zoals in wws-site.html.
 */
export default function TellingEditor({ tellingId, userId, bewerker, rechten }: Props) {
  const navigate = useNavigate();
  const NORMEN = useNormen();
  const queryClient = useQueryClient();

  const [id, setId] = useState(() => tellingId ?? crypto.randomUUID());
  const [isNieuw, setIsNieuw] = useState(!tellingId);
  const [staat, setStaat] = useState<TellingStaat>(() => nieuweTellingStaat(bewerker.naam));
  const [eigenaar, setEigenaar] = useState<{ id: string; naam: string | null }>({
    id: userId,
    naam: null,
  });
  const [versies, setVersies] = useState<Versie[]>([]);
  const [laden, setLaden] = useState<Laden>(tellingId ? "bezig" : "klaar");
  const [bezig, setBezig] = useState(false);
  const [versieDialoog, setVersieDialoog] = useState(false);
  const [adviesOpen, setAdviesOpen] = useState(false);
  const [delenOpen, setDelenOpen] = useState(false);
  const [pveVraag, setPveVraag] = useState<PveVraag | null>(null);
  const [indelingOpen, setIndelingOpen] = useState(false);
  const { data: klanten = [] } = useQuery(klantenQuery());
  const [versieNaam, setVersieNaam] = useState("");

  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = (d: boolean) => {
    dirtyRef.current = d;
    setDirtyState(d);
  };

  useBlocker({
    shouldBlockFn: ({ current, next }) => {
      if (!dirtyRef.current) return false;
      if (current.pathname === next.pathname && current.search === next.search) return false;
      return !window.confirm(NIET_OPGESLAGEN);
    },
    enableBeforeUnload: () => dirtyRef.current,
  });

  // telling laden als ?id= verandert (niet na het eerste opslaan van een nieuwe telling:
  // dan is ?id= al gelijk aan de telling die open staat)
  const geladenId = useRef<string | null>(tellingId ? null : id);
  useEffect(() => {
    const doel = tellingId ?? null;
    if (doel === null) {
      if (geladenId.current !== null && !isNieuw) {
        // van een bestaande telling naar /wws zonder id: nieuwe telling
        const nieuwId = crypto.randomUUID();
        geladenId.current = nieuwId;
        setId(nieuwId);
        setIsNieuw(true);
        setStaat(nieuweTellingStaat(bewerker.naam));
        setEigenaar({ id: userId, naam: null });
        setVersies([]);
        setDirty(false);
        setLaden("klaar");
      }
      return;
    }
    if (doel === geladenId.current) return;
    geladenId.current = doel;
    let actief = true;
    setLaden("bezig");
    (async () => {
      try {
        const [t, vs] = await Promise.all([tellingStore.haal(doel), tellingStore.versies(doel)]);
        if (!actief) return;
        if (!t) {
          setLaden("niet-gevonden");
          return;
        }
        setId(t.id);
        setIsNieuw(false);
        setStaat({
          meta: t.meta,
          input: t.input,
          versieCount: t.versieCount,
          aantalVersies: t.aantalVersies,
          basedOn: t.basedOn,
          createdAt: t.createdAt || t.gewijzigdOp,
        });
        setEigenaar({ id: t.ownerId, naam: t.ownerNaam });
        setVersies(vs);
        setDirty(false);
        setLaden("klaar");
      } catch (e) {
        if (actief) {
          toast.error("Telling laden lukte niet: " + foutTekst(e));
          setLaden("niet-gevonden");
        }
      }
    })();
    return () => {
      actief = false;
      // Dit laden is afgebroken: vergeet het doel weer, anders slaat de volgende run het
      // laden over (StrictMode draait dit effect in development direct een tweede keer).
      if (geladenId.current === doel) geladenId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tellingId]);

  const setInput: Dispatch<SetStateAction<WwsInput>> = useCallback((u) => {
    setStaat((s) => ({ ...s, input: typeof u === "function" ? u(s.input) : u }));
    setDirty(true);
  }, []);

  const zetMeta = (veld: keyof TellingMeta & string, waarde: string) => {
    setStaat((s) => ({ ...s, meta: { ...s.meta, [veld]: waarde } }));
    setDirty(true);
    if (veld === "postcode" || veld === "huisnummer") planAdresOpzoeken();
  };

  // ---------- adres en energielabel opzoeken ----------
  // laatste staat en telling-id, voor wat na een netwerkaanroep pas terugkomt
  const staatRef = useRef(staat);
  staatRef.current = staat;
  const idRef = useRef(id);
  idRef.current = id;
  const adresTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const adresLaatsteFout = useRef("");
  useEffect(() => () => clearTimeout(adresTimer.current), []);

  /**
   * Na het typen van postcode of huisnummer: straat en plaats opzoeken bij PDOK als die nog
   * leeg zijn — vulAdresAutomatischIn(). Alleen na een gebruikersactie, niet bij het laden.
   */
  function planAdresOpzoeken() {
    clearTimeout(adresTimer.current);
    adresTimer.current = setTimeout(async () => {
      const meta = staatRef.current.meta;
      const velden = adresZoekVelden(meta);
      if (!velden || !adresOpzoekenNodig(meta)) return;
      const poging = velden.postcode + "|" + velden.huisnummer;
      const voorId = idRef.current;
      const meld = (m: string) => {
        if (adresLaatsteFout.current === poging) return;
        adresLaatsteFout.current = poging;
        toast(m);
      };
      try {
        const r = await zoekAdres({ data: velden });
        if (idRef.current !== voorId) return;
        if (!r.ok) {
          if (r.fout !== "niet_gevonden") meld(adresFoutMelding(r.fout));
          return;
        }
        if (!adresToepassen(staatRef.current.meta, r.data)) return;
        setStaat((s) => {
          const m = adresToepassen(s.meta, r.data);
          return m ? { ...s, meta: m } : s;
        });
        setDirty(true);
      } catch {
        meld(adresFoutMelding("geen_verbinding"));
      }
    }, 500);
  }

  /** EP-Online-label overnemen in de werkversie — applyEpLabel() */
  function energielabelToepassen(label: EpLabel) {
    const s = staatRef.current;
    const r = epToepassen(s.input, s.meta, label);
    for (const m of r.meldingen) toast(m);
    if (!r.gewijzigd) return;
    setStaat((x) => ({ ...x, input: r.input, meta: r.meta }));
    setDirty(true);
  }

  /** Na het eerste opslaan: ?id= in de adresbalk zetten, zonder te herladen */
  const naOpslaan = async () => {
    setDirty(false);
    void queryClient.invalidateQueries({ queryKey: ["tellingen"] });
    if (isNieuw) {
      setIsNieuw(false);
      geladenId.current = id;
      await navigate({ to: "/wws", search: { id }, replace: true });
    }
  };

  async function opslaan() {
    if (bezig) return;
    setBezig(true);
    try {
      await slaWerkversieOp(tellingStore, { id, isNieuw, staat, normen: NORMEN, bewerker });
      await naOpslaan();
      toast.success("Opgeslagen");
    } catch (e) {
      toast.error("Opslaan lukte niet: " + foutTekst(e));
    } finally {
      setBezig(false);
    }
  }

  async function versieVastleggen() {
    if (bezig) return;
    setBezig(true);
    try {
      const r = await legVersieVast(tellingStore, {
        id,
        isNieuw,
        staat,
        normen: NORMEN,
        bewerker,
        naam: versieNaam,
      });
      setStaat(r.staat);
      setVersies((vs) => [r.versie, ...vs]);
      setVersieDialoog(false);
      setVersieNaam("");
      await naOpslaan();
      toast.success("Versie " + r.versie.nr + " vastgelegd");
    } catch (e) {
      toast.error("Versie vastleggen lukte niet: " + foutTekst(e));
    } finally {
      setBezig(false);
    }
  }

  /**
   * Indelingsvariant toepassen: zoals het verbeteradvies in de werkversie (niet opgeslagen) en
   * zonder stil invullen door het PvE — de variant is al met het gekozen PvE gemaakt. Eigenaar
   * en gebruikt PvE worden pas nu gekoppeld (annuleren heeft zo geen bijwerking).
   */
  function indelingToepassen(
    input: WwsInput,
    keuze: IndelingKeuze,
    nSlaap: number,
    punten: number,
  ) {
    setStaat((s) => ({
      ...s,
      input,
      meta: { ...s.meta, klantId: keuze.klantId, pveId: keuze.pveId },
    }));
    setDirty(true);
    setIndelingOpen(false);
    toast(
      "Indeling met " +
        nSlaap +
        " slaapkamer" +
        (nSlaap === 1 ? "" : "s") +
        " toegepast (" +
        punten +
        " punten). Sla de telling op, of leg een nieuwe versie vast.",
    );
  }

  /** "Toepassen op telling": in de werkversie, nog niet opgeslagen */
  function adviesToepassen(input: WwsInput, n: number, punten: number) {
    setStaat((s) => ({ ...s, input }));
    setDirty(true);
    setAdviesOpen(false);
    toast(
      n +
        " maatregel" +
        (n > 1 ? "en" : "") +
        " toegepast (" +
        punten +
        " punten). Sla de telling op, of leg een nieuwe versie vast.",
    );
  }

  // ---------- PvE van de eigenaar ----------
  const klant = klanten.find((k) => k.id === staat.meta.klantId) ?? null;
  // laatste meta voor pasRuimteAan (die draait binnen een state-update van de calculator)
  const metaRef = useRef(staat.meta);
  metaRef.current = staat.meta;

  /** Eigenaar gekozen in het formulier: heeft die een actief PvE, dan vragen of het moet */
  function eigenaarGekozen(id: string) {
    zetMeta("klantId", id);
    const k = klanten.find((x) => x.id === id);
    if (k && actievePves(k.pves).length) setPveVraag({ klant: k, pveId: "" });
  }

  /** Na bevestiging: alleen ruimten die nog op standaardwaarden staan — bevestigPveToepassen() */
  function pveToepassen(vraag: PveVraag, pveId: string) {
    const pve = vraag.klant.pves.find((p) => p.id === pveId);
    setPveVraag(null);
    if (!pve) return;
    const r = pasPveToe(staat.input, pve);
    setStaat((s) => ({ ...s, input: r.input, meta: { ...s.meta, pveId: pve.id } }));
    setDirty(true);
    if (r.aangepast)
      toast(
        "PvE toegepast: " +
          r.aangepast +
          " onderdeel" +
          (r.aangepast > 1 ? "en" : "") +
          " overgenomen van ‘" +
          pve.naam +
          "’ (" +
          vraag.klant.naam +
          ")" +
          (r.overgeslagen ? " (" + r.overgeslagen + " al ingevuld, overgeslagen)" : "") +
          ". Controleer de gemarkeerde ruimten.",
      );
    else
      toast(
        r.overgeslagen
          ? "Niets overgenomen: die ruimten waren al ingevuld."
          : "Deze telling heeft nog geen keuken-, badkamer- of toiletruimte om het PvE op toe te passen.",
      );
  }

  /**
   * Stil aanvullen van één ruimte na een gebruikersactie in het formulier (soort gewijzigd of
   * ruimte toegevoegd) — pasPveOpNieuweRuimte(). Niet bij laden, versie openen of het
   * verbeteradvies: die paden roepen dit niet aan.
   */
  const pasRuimteAan = (_groep: "vertrekken" | "overig", ruimte: Vertrek | OverigeRuimte) => {
    const meta = metaRef.current;
    const k = klanten.find((x) => x.id === meta.klantId);
    if (!k) return;
    pasPveOpFac(ruimte.fac, pveVoorTelling(k.pves, meta.pveId));
  };

  // Alleen-lezen: de kijkrol, of een telling die met je gedeeld is (niet eigenaar, geen admin).
  // Zelfde regel als mag_telling_bewerken() in de database.
  const alleenLezen = isNieuw
    ? !rechten.magSchrijven
    : !magTellingBewerken(rechten, eigenaar.id, userId);

  function versieOpenen(v: Versie) {
    if (dirtyRef.current && !window.confirm(NIET_OPGESLAGEN)) return;
    setStaat((s) => openVersieInStaat(s, v));
    if (alleenLezen) {
      toast("Versie " + v.nr + " getoond (alleen lezen).");
      return;
    }
    // de werkversie wijkt nu af van wat is opgeslagen
    setDirty(true);
    toast("Versie " + v.nr + " geladen. Sla op om dit de werkversie te maken.");
  }

  if (laden === "bezig") {
    return <p className="mx-auto max-w-7xl px-4 py-8 text-muted-foreground">Telling laden…</p>;
  }
  if (laden === "niet-gevonden") {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p>Deze telling bestaat niet (meer), of je hebt er geen toegang toe.</p>
        <div className="mt-4 flex gap-2">
          <Button asChild variant="outline">
            <Link to="/archief">Naar het archief</Link>
          </Button>
          <Button asChild>
            <Link to="/wws">Nieuwe telling</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isNieuw && !rechten.magSchrijven) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p>
          Met de kijkrol kun je geen nieuwe telling maken. Open een bestaande telling via het
          archief.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/archief">Naar het archief</Link>
        </Button>
      </div>
    );
  }

  const m = staat.meta;
  const vanCollega = eigenaar.id !== userId;

  const paneel = (
    <section className="space-y-4 border-b border-border py-6" aria-label="Telling">
      {alleenLezen ? (
        <p
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm"
          role="note"
          aria-label="Alleen lezen"
        >
          {rechten.isViewer
            ? "Je hebt een kijkrol: je kunt deze telling bekijken, maar niet wijzigen."
            : `Deze telling is met je gedeeld door ${eigenaar.naam ?? "een collega"}. Je kunt hem bekijken, maar niet aanpassen.`}
        </p>
      ) : (
        vanCollega && (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
            Telling van {eigenaar.naam ?? "een collega"}. Wijzigingen worden in deze telling
            opgeslagen; de eigenaar blijft dezelfde.
          </p>
        )
      )}
      <fieldset disabled={alleenLezen} className="m-0 min-w-0 border-0 p-0">
        <div className="grid gap-3 sm:grid-cols-6">
          <MetaVeld
            label="Naam"
            className="sm:col-span-6"
            waarde={m.naam}
            zet={(v) => zetMeta("naam", v)}
          />
          <MetaVeld
            label="Straat"
            className="sm:col-span-3"
            waarde={m.adres}
            zet={(v) => zetMeta("adres", v)}
          />
          <MetaVeld
            label="Huisnummer"
            className="sm:col-span-1"
            waarde={m.huisnummer}
            zet={(v) => zetMeta("huisnummer", v)}
          />
          <MetaVeld
            label="Postcode"
            className="sm:col-span-2"
            waarde={m.postcode}
            zet={(v) => zetMeta("postcode", v)}
          />
          <MetaVeld
            label="Plaats"
            className="sm:col-span-3"
            waarde={m.plaats}
            zet={(v) => zetMeta("plaats", v)}
          />
          <MetaVeld
            label="Peildatum"
            type="date"
            className="sm:col-span-3"
            waarde={m.peildatum}
            zet={(v) => zetMeta("peildatum", v)}
          />
          <div className="sm:col-span-6">
            <EigenaarKeuze
              klantId={m.klantId}
              onKies={eigenaarGekozen}
              magToevoegen={rechten.magSchrijven}
              alleenLezen={alleenLezen}
            />
            {!alleenLezen && klant && actievePves(klant.pves).length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => setPveVraag({ klant, pveId: m.pveId })}
              >
                PvE opnieuw toepassen
              </Button>
            )}
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {!alleenLezen && (
          <>
            <Button onClick={opslaan} disabled={bezig}>
              Opslaan
            </Button>
            <Button
              variant="outline"
              disabled={bezig}
              onClick={() => {
                setVersieNaam("");
                setVersieDialoog(true);
              }}
            >
              Versie vastleggen
            </Button>
          </>
        )}
        <Button variant="outline" onClick={() => setAdviesOpen(true)}>
          Verbeteradvies
        </Button>
        <Button variant="outline" onClick={() => setIndelingOpen(true)}>
          Indelingsadvies
        </Button>
        {!alleenLezen && !isNieuw && (
          <Button variant="outline" onClick={() => setDelenOpen(true)}>
            Delen
          </Button>
        )}
        {rechten.magSchrijven && (
          <Button asChild variant="ghost">
            <Link to="/wws">Nieuwe telling</Link>
          </Button>
        )}
        <span className="text-sm text-muted-foreground" role="status" aria-label="Opslagstatus">
          {alleenLezen
            ? "Alleen lezen"
            : dirty
              ? "Niet-opgeslagen wijzigingen"
              : isNieuw
                ? "Nog niet opgeslagen"
                : "Alles opgeslagen"}
          {staat.basedOn !== null && <> · gebaseerd op versie {staat.basedOn}</>}
        </span>
      </div>

      {versies.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Versies</h3>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {versies.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="w-8 tabular-nums text-muted-foreground">{v.nr}</span>
                <span className="min-w-0 flex-1 truncate" title={v.notitie}>
                  {v.notitie}
                </span>
                <span className="tabular-nums">{v.resultaat.totaal} p</span>
                <span className="text-muted-foreground">{SEGMENT_NAMEN[v.resultaat.seg]}</span>
                <span className="text-muted-foreground">{datumTijd(v.createdAt)}</span>
                <Button size="sm" variant="ghost" onClick={() => versieOpenen(v)}>
                  Openen
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={versieDialoog} onOpenChange={setVersieDialoog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Versie vastleggen</DialogTitle>
            <DialogDescription>
              Legt de telling zoals hij nu is vast als versie {staat.versieCount + 1}, samen met de
              gebruikte normen. Een ingevulde naam wordt ook de naam van de telling.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void versieVastleggen();
            }}
          >
            <Input
              aria-label="Naam van de versie"
              autoFocus
              value={versieNaam}
              placeholder={standaardVersieNaam(m, staat.versieCount + 1)}
              onChange={(e) => setVersieNaam(e.target.value)}
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setVersieDialoog(false)}>
                Annuleren
              </Button>
              <Button type="submit" disabled={bezig}>
                Vastleggen
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );

  return (
    <>
      <WwsCalculator
        input={staat.input}
        setInput={setInput}
        boven={paneel}
        alleenLezen={alleenLezen}
        pasRuimteAan={pasRuimteAan}
        energieExtra={
          !alleenLezen && <EnergielabelOphalen key={id} meta={m} pasToe={energielabelToepassen} />
        }
      />
      <IndelingDialoog
        open={indelingOpen}
        onOpenChange={setIndelingOpen}
        input={staat.input}
        klantId={staat.meta.klantId}
        pveId={staat.meta.pveId}
        klanten={klanten}
        magToepassen={!alleenLezen}
        onToepassen={(input, keuze, v) => indelingToepassen(input, keuze, v.nSlaap, v.R.totaal)}
      />
      <PveToepassenDialoog
        vraag={pveVraag}
        onSluit={() => setPveVraag(null)}
        onToepassen={pveToepassen}
      />
      <AdviesDialoog
        open={adviesOpen}
        onOpenChange={setAdviesOpen}
        input={staat.input}
        onToepassen={adviesToepassen}
        isAdmin={rechten.isAdmin}
        magToepassen={!alleenLezen}
      />
      {!alleenLezen && !isNieuw && (
        <DelenDialoog
          open={delenOpen}
          onOpenChange={setDelenOpen}
          tellingId={id}
          ownerId={eigenaar.id}
          userId={userId}
          isAdmin={rechten.isAdmin}
        />
      )}
    </>
  );
}

function MetaVeld({
  label,
  waarde,
  zet,
  type = "text",
  className = "",
}: {
  label: string;
  waarde: string;
  zet: (v: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="text-muted-foreground">{label}</span>
      <Input type={type} value={waarde} onChange={(e) => zet(e.target.value)} />
    </label>
  );
}
