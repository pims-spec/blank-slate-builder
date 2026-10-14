import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
import { SEGMENT_NAMEN, type WwsInput } from "@/lib/wws";
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
import AdviesDialoog from "./AdviesDialoog";
import DelenDialoog from "./DelenDialoog";
import EigenaarKeuze from "./EigenaarKeuze";
import WwsCalculator from "./WwsCalculator";
import { useNormen } from "./NormenContext";
import { tellingStore } from "./tellingStore";

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
  };

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
              onKies={(id) => zetMeta("klantId", id)}
              magToevoegen={rechten.magSchrijven}
              alleenLezen={alleenLezen}
            />
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
