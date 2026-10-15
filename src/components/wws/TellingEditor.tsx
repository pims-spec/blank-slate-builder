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
import { maakTellingPdf } from "@/lib/wws/pdf/rapporten";
import { useDownload } from "./useDownload";
import PlattegrondDialoog from "./PlattegrondDialoog";
import NieuweTellingDialoog from "./NieuweTellingDialoog";
import {
  heeftPlattegrond,
  plattegrondOpslag,
  plattegrondVoorPdf,
  usePlattegrondUrl,
  type NieuwBeeld,
} from "./plattegrondBeeld";
import { bewaarBeeld, ruimOngebruiktOp, ruimOudBeeldOp } from "@/lib/wws/plattegrond/bewaren";
import { werkVersieBij } from "@/lib/wws/opslag/store";
import VersieBeheer from "./VersieBeheer";
import VersiesVergelijken from "./VersiesVergelijken";
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
import { weergaveAdres } from "@/lib/wws/opslag";
import { blobNaarBytes } from "@/lib/wws/plattegrond/beeld";
import DelenDialoog from "./DelenDialoog";
import EigenaarKeuze from "./EigenaarKeuze";
import IndelingDialoog, { type IndelingKeuze } from "./IndelingDialoog";
import PveToepassenDialoog, { type PveVraag } from "./PveToepassenDialoog";
import WwsCalculator, { EnergieVelden, Ontgrendel, WozWaardeVeld } from "./WwsCalculator";
import {
  adresZoek,
  isVergrendeld,
  kopieerMelding,
  OPZOEK_LINKS,
  type LinkSoort,
} from "@/lib/wws/opzoeken/links";
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
  /**
   * Vanaf het startscherm van het indelingsadvies: "indeling" opent na het laden meteen het
   * indelingsadvies; "blanco" vraagt postcode/huisnummer en gaat dan naar de plattegrondstap.
   */
  start?: "indeling" | "blanco" | undefined;
}

type Laden = "bezig" | "klaar" | "niet-gevonden";

/**
 * Een telling bewerken en opslaan: werkversie opslaan, een versie vastleggen en een
 * eerdere versie openen — zoals in wws-site.html.
 */
export default function TellingEditor({ tellingId, userId, bewerker, rechten, start }: Props) {
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
  const [plattegrondOpen, setPlattegrondOpen] = useState(false);
  const [verwijderVraag, setVerwijderVraag] = useState(false);
  const [vergelijkOpen, setVergelijkOpen] = useState(false);
  /** Venster "Nieuwe telling" (postcode + huisnummer) — bij elke nieuwe, lege telling */
  const [vraagAdres, setVraagAdres] = useState(!tellingId && rechten.magSchrijven);
  /** Blanco-start: na het venster Nieuwe telling door naar de plattegrondstap (ntContext) */
  const blancoNaAdres = useRef(start === "blanco" && !tellingId && rechten.magSchrijven);
  /** Het indelingsadvies staat open als Blanco-start (met de plattegrondstap) */
  const [indelingBlanco, setIndelingBlanco] = useState(false);
  /** Nieuwe plattegrond, nog niet opgeslagen: gaat bij Opslaan naar Storage */
  const [nieuwBeeld, setNieuwBeeld] = useState<NieuwBeeld | null>(null);
  /** Pad van de plattegrond zoals die nu is opgeslagen (om na vervangen op te ruimen) */
  const opgeslagenPad = useRef<string | null>(null);
  const plattegrond = usePlattegrondUrl(staat.input, nieuwBeeld);
  const { data: klanten = [] } = useQuery(klantenQuery());
  const download = useDownload();
  const [versieNaam, setVersieNaam] = useState("");

  const kanVersieBijwerken = staat.basedOn != null && versies.some((v) => v.nr === staat.basedOn);

  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = (d: boolean) => {
    dirtyRef.current = d;
    setDirtyState(d);
  };

  /** Eén navigatie zonder vraag: de editor wisselt zelf van telling (dupliceren) */
  const zonderBlokkade = useRef(false);
  useBlocker({
    shouldBlockFn: ({ current, next }) => {
      if (zonderBlokkade.current) {
        zonderBlokkade.current = false;
        return false;
      }
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
        setNieuwBeeld(null);
        opgeslagenPad.current = null;
        setVraagAdres(rechten.magSchrijven);
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
        setNieuwBeeld(null);
        opgeslagenPad.current = t.input.plattegrond?.pad ?? null;
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

  // Startscherm van het indelingsadvies: de vlag uit de adresbalk halen (niet opnieuw bij
  // verversen), en bij "Bestaande telling kiezen" na het laden het indelingsadvies openen
  const indelingGeopend = useRef<string | null>(null);
  useEffect(() => {
    if (start === "blanco") void navigate({ to: "/wws", replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (start !== "indeling" || !tellingId || laden !== "klaar" || isNieuw) return;
    if (indelingGeopend.current === tellingId) return;
    indelingGeopend.current = tellingId;
    setIndelingOpen(true);
    void navigate({ to: "/wws", search: { id: tellingId }, replace: true });
  }, [start, tellingId, laden, isNieuw, navigate]);

  const setInput: Dispatch<SetStateAction<WwsInput>> = useCallback((u) => {
    setStaat((s) => ({ ...s, input: typeof u === "function" ? u(s.input) : u }));
    setDirty(true);
  }, []);

  /** "wijzigen": het automatisch overgenomen veld mag weer met de hand — data-unlockauto */
  const ontgrendel = (sleutel: "adres" | "plaats" | "bouwjaar" | "woningtype") => {
    setStaat((s) => ({
      ...s,
      meta: {
        ...s.meta,
        auto: { ...((s.meta["auto"] as Record<string, boolean>) || {}), [sleutel]: false },
      },
    }));
    setDirty(true);
  };

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
  function planAdresOpzoeken(wacht = 500) {
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
    }, wacht);
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

  /**
   * Een nieuwe plattegrond eerst naar Storage (nieuwe telling: eerst aanmaken); de telling krijgt
   * alleen de verwijzing. Geeft de staat om op te slaan.
   */
  async function metBeeld() {
    const r = await bewaarBeeld({
      store: tellingStore,
      opslag: plattegrondOpslag,
      id,
      isNieuw,
      staat,
      normen: NORMEN,
      bewerker,
      beeld: nieuwBeeld
        ? {
            bytes: await blobNaarBytes(nieuwBeeld.blob),
            breedte: nieuwBeeld.breedte,
            hoogte: nieuwBeeld.hoogte,
          }
        : null,
    });
    if (nieuwBeeld) {
      setStaat(r.staat);
      setNieuwBeeld(null);
    }
    return r;
  }

  /** Na opslaan: de vorige plattegrond weg als niets er nog naar verwijst */
  function ruimOp(s: TellingStaat, vs: readonly Versie[]) {
    const nieuwPad = s.input.plattegrond?.pad ?? null;
    void ruimOudBeeldOp(plattegrondOpslag, opgeslagenPad.current, nieuwPad, vs);
    opgeslagenPad.current = nieuwPad;
  }

  async function opslaan() {
    if (bezig) return;
    setBezig(true);
    try {
      const r = await metBeeld();
      // gebaseerd op een (nog bestaande) versie: die versie bijwerken — updateVersieBijwerken()
      const basis =
        r.staat.basedOn != null ? versies.find((v) => v.nr === r.staat.basedOn) : undefined;
      if (basis && !r.isNieuw) {
        const v = await werkVersieBij(tellingStore, {
          id,
          isNieuw: false,
          staat: r.staat,
          normen: NORMEN,
          bewerker,
          versie: basis,
        });
        const vs = versies.map((x) => (x.id === v.id ? v : x));
        setVersies(vs);
        ruimOp(r.staat, vs);
        void ruimOngebruiktOp(
          plattegrondOpslag,
          [basis.input.plattegrond?.pad],
          [r.staat.input, ...vs.map((x) => x.input)],
        );
        await naOpslaan();
        toast.success("Versie " + v.nr + " bijgewerkt");
        return;
      }
      await slaWerkversieOp(tellingStore, {
        id,
        isNieuw: r.isNieuw,
        staat: r.staat,
        normen: NORMEN,
        bewerker,
      });
      ruimOp(r.staat, versies);
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
      const b = await metBeeld();
      const r = await legVersieVast(tellingStore, {
        id,
        isNieuw: b.isNieuw,
        staat: b.staat,
        normen: NORMEN,
        bewerker,
        naam: versieNaam,
      });
      setStaat(r.staat);
      setVersies((vs) => [r.versie, ...vs]);
      ruimOp(r.staat, [r.versie, ...versies]);
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
    beeld: NieuwBeeld | null,
    ai: boolean,
  ) {
    setStaat((s) => ({
      ...s,
      input,
      meta: { ...s.meta, klantId: keuze.klantId, pveId: keuze.pveId },
    }));
    // de oude plattegrond past niet meer: de AI-afbeelding of het blokkenschema komt ervoor in de
    // plaats (gaat bij Opslaan naar Storage), zoals de bron
    setNieuwBeeld(beeld);
    setDirty(true);
    setIndelingOpen(false);
    setIndelingBlanco(false);
    toast(
      "Indeling met " +
        nSlaap +
        " slaapkamer" +
        (nSlaap === 1 ? "" : "s") +
        " toegepast (" +
        punten +
        " punten)." +
        (beeld
          ? ai
            ? " De AI-gegenereerde afbeelding is als plattegrond-afbeelding bij deze telling gezet."
            : " Het blokkenschema is als plattegrond-afbeelding bij deze telling gezet."
          : "") +
        " Sla de telling op, of leg een nieuwe versie vast.",
    );
  }

  /**
   * "Doorgaan" in het venster Nieuwe telling — nieuweTellingDoorgaan()/maakNieuweTelling(): de
   * telling krijgt postcode en huisnummer, en het adres wordt meteen opgezocht (PDOK).
   */
  function nieuweTellingDoorgaan(postcode: string, huisnummer: string) {
    setVraagAdres(false);
    setStaat((s) => ({ ...s, meta: { ...s.meta, postcode, huisnummer } }));
    setDirty(true);
    planAdresOpzoeken(0);
    vervolgBlanco();
  }

  /** "Overslaan voor nu": lege telling (bij de Blanco-start toch door naar de plattegrond) */
  function nieuweTellingOverslaan() {
    setVraagAdres(false);
    vervolgBlanco();
  }

  /** vervolgIndelingBlanco(): het indelingsadvies met eerst de plattegrondstap */
  function vervolgBlanco() {
    if (!blancoNaAdres.current) return;
    blancoNaAdres.current = false;
    setIndelingBlanco(true);
    setIndelingOpen(true);
  }

  /** Plattegrond uit de Blanco-start: in de werkversie, de afbeelding gaat bij Opslaan naar Storage */
  function blancoPlattegrond(input: WwsInput, beeld: NieuwBeeld) {
    setStaat((s) => ({ ...s, input }));
    setNieuwBeeld(beeld);
    setDirty(true);
  }

  /**
   * Na het verwijderen van een versie — deleteVersie(): aantal versies en "gebaseerd op" bijwerken
   * en de telling opslaan (zoals de bron); de afbeelding van die versie weg als niemand hem gebruikt.
   */
  async function versieVerwijderd(v: Versie) {
    const rest = versies.filter((x) => x.id !== v.id);
    setVersies(rest);
    const nieuw: TellingStaat = {
      ...staat,
      aantalVersies: rest.length,
      basedOn: staat.basedOn === v.nr ? null : staat.basedOn,
    };
    setStaat(nieuw);
    try {
      await slaWerkversieOp(tellingStore, {
        id,
        isNieuw: false,
        staat: nieuw,
        normen: NORMEN,
        bewerker,
      });
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["tellingen"] });
    } catch (e) {
      toast.error("Opslaan lukte niet: " + foutTekst(e));
    }
    void ruimOngebruiktOp(
      plattegrondOpslag,
      [v.input.plattegrond?.pad],
      [nieuw.input, ...rest.map((x) => x.input)],
    );
    toast("Versie " + v.nr + " verwijderd");
  }

  /**
   * Dupliceren — duplicateerTelling(): een nieuwe, nog niet opgeslagen telling met dezelfde invoer
   * en adresgegevens, naam "… (kopie)", zonder versies. Een plattegrond in Storage gaat als nieuwe
   * afbeelding mee (bij Opslaan in de map van de kopie), zodat de kopie niet van het origineel
   * afhangt.
   */
  async function dupliceren() {
    if (dirtyRef.current && !window.confirm(NIET_OPGESLAGEN)) return;
    let beeld = nieuwBeeld;
    const pad = staat.input.plattegrond?.pad;
    if (!beeld && pad) {
      try {
        const blob = await plattegrondOpslag.haal(pad);
        const bm = await createImageBitmap(blob);
        beeld = { blob, breedte: bm.width, hoogte: bm.height };
        bm.close();
      } catch {
        beeld = null;
      }
    }
    const meta = structuredClone(staat.meta);
    meta.naam = (meta.naam || weergaveAdres(meta) || "Naamloze telling") + " (kopie)";
    const input = structuredClone(staat.input);
    delete input.plattegrond;
    const nieuwId = crypto.randomUUID();
    geladenId.current = nieuwId;
    opgeslagenPad.current = null;
    setId(nieuwId);
    setIsNieuw(true);
    setStaat({
      meta,
      input,
      versieCount: 0,
      aantalVersies: 0,
      basedOn: null,
      createdAt: new Date().toISOString(),
    });
    setEigenaar({ id: userId, naam: null });
    setVersies([]);
    setNieuwBeeld(beeld);
    setVraagAdres(false);
    setDirty(true);
    // de kopie is nog niet opgeslagen; dat is de bedoeling, dus niet om bevestiging vragen
    zonderBlokkade.current = true;
    void navigate({ to: "/wws" });
    toast("Telling gedupliceerd als ‘" + meta.naam + "’. Nog niet opgeslagen.");
  }

  /** Verwijderen vanuit de editor — deleteCurrent(); eerst de afbeeldingen, dan de telling */
  async function verwijderTelling() {
    try {
      await tellingStore.verwijder(id);
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["tellingen"] });
      toast.success("Telling verwijderd");
      await navigate({ to: "/archief" });
    } catch (e) {
      toast.error("Verwijderen lukte niet: " + foutTekst(e));
    }
  }

  /** Ingelezen plattegrond overnemen: in de werkversie; de afbeelding gaat bij Opslaan naar Storage */
  function plattegrondOvernemen(input: WwsInput, beeld: NieuwBeeld) {
    setStaat((s) => ({ ...s, input }));
    setNieuwBeeld(beeld);
    setDirty(true);
    setPlattegrondOpen(false);
    toast("Plattegrond overgenomen. Controleer de gemarkeerde ruimten.");
  }

  /** Plattegrond-afbeelding weghalen (bij Opslaan ook uit Storage, tenzij een versie hem gebruikt) */
  function plattegrondVerwijderen() {
    setStaat((s) => {
      const input = { ...s.input };
      delete input.plattegrond;
      delete input.plattegrondImg;
      return { ...s, input };
    });
    setNieuwBeeld(null);
    setDirty(true);
    toast("Plattegrond-afbeelding verwijderd.");
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

  /**
   * Stap 1 van het indelingsadvies: "Adres en WOZ" en "Energielabel" — renderIndelingEigenaar().
   * Dezelfde gegevens als de telling zelf (meta en input van de werkversie), met dezelfde
   * velden, opzoekfuncties en vergrendeling; geen kopie.
   */
  const wijzigInput = (f: (d: WwsInput) => void) =>
    setInput((i) => {
      const d = structuredClone(i);
      f(d);
      return d;
    });
  const indelingStap1 = (
    <fieldset disabled={alleenLezen} className="m-0 min-w-0 space-y-3 border-0 p-0">
      <h3 className="font-semibold">Adres en WOZ</h3>
      <p className="-mt-2 text-xs text-muted-foreground">
        Nodig om het energielabel automatisch op te halen (EP-Online) en om de WOZ-waarde te kunnen
        invullen.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetaVeld
          label="Postcode"
          placeholder="1234 AB"
          waarde={m.postcode}
          zet={(v) => zetMeta("postcode", v)}
        />
        <MetaVeld
          label="Huisnummer + toevoeging"
          placeholder="12 A"
          waarde={m.huisnummer}
          zet={(v) => zetMeta("huisnummer", v)}
        />
        <MetaVeld
          label="Plaats"
          placeholder="Wordt automatisch opgezocht via postcode + huisnummer"
          waarde={m.plaats}
          zet={(v) => zetMeta("plaats", v)}
          onOntgrendel={
            isVergrendeld(m, "plaats", m.plaats) ? () => ontgrendel("plaats") : undefined
          }
        />
      </div>
      <OpzoekLink meta={m} soort="ep" />
      {!alleenLezen && <EnergielabelOphalen key={id} meta={m} pasToe={energielabelToepassen} />}
      <WozWaardeVeld
        waarde={staat.input.woz.waarde}
        zet={(v) =>
          wijzigInput((d) => {
            d.woz.waarde = v;
          })
        }
      />
      <OpzoekLink meta={m} soort="woz" />
      <h3 className="pt-3 font-semibold">Energielabel</h3>
      <p className="-mt-2 text-xs text-muted-foreground">
        Geldt voor de hele woning en telt voor elke variant even zwaar mee (rubriek 4) — controleer
        dit dus ook als je hier alleen voor de indeling komt.
      </p>
      <EnergieVelden energie={staat.input.energie} wijzig={wijzigInput} />
    </fieldset>
  );
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
            onOntgrendel={
              isVergrendeld(m, "adres", m.adres) ? () => ontgrendel("adres") : undefined
            }
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
            onOntgrendel={
              isVergrendeld(m, "plaats", m.plaats) ? () => ontgrendel("plaats") : undefined
            }
          />
          <MetaVeld
            label="Bouwjaar"
            className="sm:col-span-2"
            waarde={m.bouwjaar}
            zet={(v) => zetMeta("bouwjaar", v)}
            onOntgrendel={
              isVergrendeld(m, "bouwjaar", m.bouwjaar) ? () => ontgrendel("bouwjaar") : undefined
            }
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

      <PlattegrondBlok
        input={staat.input}
        nieuw={nieuwBeeld}
        alleenLezen={alleenLezen}
        onInlezen={() => setPlattegrondOpen(true)}
        onVerwijderen={plattegrondVerwijderen}
      />

      <div className="flex flex-wrap items-center gap-2">
        {!alleenLezen && (
          <>
            {/* gebaseerd op een bestaande versie: Opslaan werkt die versie bij (canUpdateVersie) */}
            <Button
              onClick={opslaan}
              disabled={bezig}
              title={
                kanVersieBijwerken
                  ? "Overschrijft versie " + staat.basedOn + " met de huidige wijzigingen"
                  : "Bewaart de werkversie, zonder een versie vast te leggen"
              }
            >
              {kanVersieBijwerken ? "Versie " + staat.basedOn + " bijwerken" : "Opslaan"}
            </Button>
            <Button
              variant="outline"
              disabled={bezig}
              onClick={() => {
                setVersieNaam("");
                setVersieDialoog(true);
              }}
            >
              {kanVersieBijwerken ? "Opslaan als nieuwe versie" : "Versie vastleggen"}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          disabled={download.bezig === "werkversie"}
          onClick={() =>
            download.pdf("werkversie", async (lib) =>
              maakTellingPdf(lib, {
                meta: staat.meta,
                input: staat.input,
                normen: NORMEN,
                plattegrond: await plattegrondVoorPdf(staat.input, nieuwBeeld),
              }),
            )
          }
        >
          {download.bezig === "werkversie" ? "PDF maken…" : "PDF van huidige stand"}
        </Button>
        <Button variant="outline" onClick={() => setAdviesOpen(true)}>
          Advies vrije sector
        </Button>
        <Button variant="outline" onClick={() => setIndelingOpen(true)}>
          Indelingsadvies
        </Button>
        {rechten.magSchrijven && !isNieuw && (
          <Button variant="outline" onClick={() => void dupliceren()}>
            Dupliceren
          </Button>
        )}
        {!isNieuw && rechten.magSchrijven && (eigenaar.id === userId || rechten.isAdmin) && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setVerwijderVraag(true)}
          >
            Telling verwijderen
          </Button>
        )}
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Versies</h3>
            <Button size="sm" variant="outline" onClick={() => setVergelijkOpen(true)}>
              Versies vergelijken
            </Button>
          </div>
          <VersiesVergelijken
            open={vergelijkOpen}
            onOpenChange={setVergelijkOpen}
            versies={versies}
            werkInput={staat.input}
            normen={NORMEN}
          />
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {versies.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="w-8 tabular-nums text-muted-foreground">{v.nr}</span>
                <span className="min-w-[10rem] flex-1 truncate" title={v.notitie}>
                  {v.notitie}
                </span>
                <span className="tabular-nums">{v.resultaat.totaal} p</span>
                <span className="text-muted-foreground">{SEGMENT_NAMEN[v.resultaat.seg]}</span>
                <span className="text-muted-foreground">{datumTijd(v.createdAt)}</span>
                <Button size="sm" variant="ghost" onClick={() => versieOpenen(v)}>
                  Openen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={"PDF van versie " + v.nr}
                  disabled={download.bezig === v.id}
                  onClick={() =>
                    download.pdf(v.id, async (lib) =>
                      // met de normen en de plattegrond van toen, zoals de bron (mergeNormen(v.normen))
                      maakTellingPdf(lib, {
                        meta: v.meta,
                        input: v.input,
                        normen: v.normen,
                        versie: v,
                        plattegrond: await plattegrondVoorPdf(v.input),
                      }),
                    )
                  }
                >
                  PDF
                </Button>
                {!alleenLezen && (
                  <VersieBeheer
                    versie={v}
                    tellingId={id}
                    onHernoemd={(nv) =>
                      setVersies((vs) => vs.map((x) => (x.id === nv.id ? nv : x)))
                    }
                    onVerwijderd={versieVerwijderd}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <AlertDialog open={verwijderVraag} onOpenChange={setVerwijderVraag}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Telling verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              ‘{m.naam || weergaveAdres(m) || "Naamloze telling"}’
              {staat.aantalVersies > 0
                ? staat.aantalVersies === 1
                  ? " en de opgeslagen versie worden"
                  : ` en alle ${staat.aantalVersies} opgeslagen versies worden`
                : " wordt"}{" "}
              definitief verwijderd. Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void verwijderTelling()}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      {isNieuw && rechten.magSchrijven && (
        <NieuweTellingDialoog
          open={vraagAdres}
          onDoorgaan={nieuweTellingDoorgaan}
          onOverslaan={nieuweTellingOverslaan}
        />
      )}
      <WwsCalculator
        input={staat.input}
        setInput={setInput}
        boven={paneel}
        alleenLezen={alleenLezen}
        pasRuimteAan={pasRuimteAan}
        energieExtra={
          <>
            <OpzoekLink meta={m} soort="ep" />
            {!alleenLezen && (
              <EnergielabelOphalen key={id} meta={m} pasToe={energielabelToepassen} />
            )}
          </>
        }
        wozExtra={<OpzoekLink meta={m} soort="woz" />}
        woningtypeVergrendeld={
          isVergrendeld(m, "woningtype", staat.input.woningtype)
            ? { onOntgrendel: () => ontgrendel("woningtype") }
            : undefined
        }
      />
      {!alleenLezen && (
        <PlattegrondDialoog
          open={plattegrondOpen}
          onOpenChange={setPlattegrondOpen}
          input={staat.input}
          meta={staat.meta}
          onOvernemen={plattegrondOvernemen}
        />
      )}
      <IndelingDialoog
        open={indelingOpen}
        onOpenChange={(o) => {
          setIndelingOpen(o);
          if (!o) setIndelingBlanco(false);
        }}
        input={staat.input}
        klantId={staat.meta.klantId}
        pveId={staat.meta.pveId}
        klanten={klanten}
        magToepassen={!alleenLezen}
        plattegrondUrl={plattegrond.url}
        plattegrondVoorAi={async () => {
          const url = await plattegrondVoorPdf(staat.input, nieuwBeeld);
          const m = url && /^data:(image\/jpeg);base64,(.+)$/.exec(url);
          return m ? { type: "image/jpeg", data: m[2]! } : null;
        }}
        {...(indelingBlanco && !alleenLezen
          ? { blanco: { meta: staat.meta, onPlattegrond: blancoPlattegrond } }
          : {})}
        stap1={indelingStap1}
        onInputWijziging={(i) => setInput(i)}
        onToepassen={(input, keuze, v, beeld, ai) =>
          indelingToepassen(input, keuze, v.nSlaap, v.R.totaal, beeld, ai)
        }
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
        meta={staat.meta}
        plattegrond={() => plattegrondVoorPdf(staat.input, nieuwBeeld)}
        onEnergieAdvies={(a) => {
          setInput((i) => {
            const n = { ...i };
            if (a) n.energieAdvies = a;
            else delete n.energieAdvies;
            return n;
          });
        }}
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
  placeholder,
  onOntgrendel,
}: {
  label: string;
  waarde: string;
  zet: (v: string) => void;
  type?: string;
  className?: string;
  placeholder?: string;
  /** Automatisch overgenomen (PDOK/EP-Online): alleen-lezen met "wijzigen" — fld(…, {autoKey}) */
  onOntgrendel?: (() => void) | undefined;
}) {
  return (
    <div className={`flex flex-col gap-1 text-sm ${className}`}>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">{label}</span>
        <Input
          type={type}
          value={waarde}
          readOnly={!!onOntgrendel}
          placeholder={placeholder}
          className={onOntgrendel ? "bg-muted" : undefined}
          onChange={(e) => zet(e.target.value)}
        />
      </label>
      {onOntgrendel && (
        <span className="-mt-1">
          <Ontgrendel onClick={onOntgrendel} veld={label} />
        </span>
      )}
    </div>
  );
}

/** "Opzoeken voor 1234AB 12: WOZ-waardeloket ↗" — lookupRow(); de link kopieert het adres */
function OpzoekLink({ meta, soort }: { meta: TellingMeta; soort: LinkSoort }) {
  const [melding, setMelding] = useState("");
  const q = adresZoek(meta, "woz");
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">
        {q ? (
          <>
            Opzoeken voor <b>{q}</b>:
          </>
        ) : (
          "Vul postcode en huisnummer in om op te zoeken:"
        )}
      </span>
      <a
        className="rounded-md border border-input px-3 py-1 hover:bg-muted"
        href={OPZOEK_LINKS[soort].url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          const z = adresZoek(meta, soort);
          if (!z) {
            setMelding("Tip: vul eerst postcode en huisnummer in.");
            return;
          }
          void navigator.clipboard
            .writeText(z)
            .then(
              () => true,
              () => false,
            )
            .then((ok) => {
              const t = kopieerMelding(soort, z, ok);
              setMelding(t);
              toast(t);
            });
        }}
      >
        {OPZOEK_LINKS[soort].naam} ↗
      </a>
      {melding && (
        <span className="text-xs text-muted-foreground" role="status">
          {melding}
        </span>
      )}
    </div>
  );
}

/** De plattegrond bij de telling: tonen, inlezen (Claude) en verwijderen */
function PlattegrondBlok({
  input,
  nieuw,
  alleenLezen,
  onInlezen,
  onVerwijderen,
}: {
  input: WwsInput;
  nieuw: NieuwBeeld | null;
  alleenLezen: boolean;
  onInlezen: () => void;
  onVerwijderen: () => void;
}) {
  const { url, laden, fout } = usePlattegrondUrl(input, nieuw);
  const heeft = heeftPlattegrond(input, nieuw);
  if (alleenLezen && !heeft) return null;
  return (
    <div className="flex flex-wrap items-start gap-4" aria-label="Plattegrond">
      {heeft && (
        <figure className="m-0">
          {url ? (
            <img
              src={url}
              alt="Plattegrond van deze telling"
              className="max-h-40 max-w-xs rounded-md border border-border bg-white"
            />
          ) : (
            <div className="flex h-24 w-40 items-center justify-center rounded-md border border-border text-xs text-muted-foreground">
              {laden ? "Plattegrond laden…" : fout ? "Plattegrond niet te laden" : ""}
            </div>
          )}
          {nieuw && (
            <figcaption className="mt-1 text-xs text-muted-foreground">
              Nieuw — wordt opgeslagen bij Opslaan
            </figcaption>
          )}
        </figure>
      )}
      {!alleenLezen && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onInlezen}>
            Plattegrond inlezen
          </Button>
          {heeft && (
            <Button type="button" variant="ghost" onClick={onVerwijderen}>
              Plattegrond verwijderen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
