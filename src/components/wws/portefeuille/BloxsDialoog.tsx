import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  bloxsAdressen,
  bloxsEigenaren,
  bloxsFunctiesTesten,
  bloxsObjectenPagina,
} from "@/lib/wws/bloxs/bloxs.functions";
import { bloxsFoutTekst, type BloxsFout } from "@/lib/wws/bloxs/fouten";
import type { BloxsId } from "@/lib/wws/bloxs/odata";
import type { BloxsAdres, BloxsObject, Cursor, Eigenaar, Soort } from "@/lib/wws/bloxs/sync";
import { adressenInPorties } from "@/lib/wws/bloxs/porties";
import {
  adresIds,
  complexen,
  idUitTekst,
  maakSyncPlan,
  type SyncPlan,
} from "@/lib/wws/bloxs/syncPlan";
import type { Klant } from "@/lib/wws/opslag";
import type { Portefeuille } from "@/lib/wws/portefeuille/opslag";
import { aantal } from "@/lib/wws/portefeuille/tekst";
import { kiesGohomeEigenaar, naamSleutel } from "@/lib/wws/bloxs/eigenaarKoppeling";
import { klantenStore, portefeuilleStore } from "../tellingStore";

/** Waarde in de keuzelijst voor "nieuwe eigenaar in GoHome aanmaken" */
const NIEUW = "__nieuw__";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  klanten: readonly Klant[];
  /** Opnieuw inladen (anders een nieuwe portefeuille uit Bloxs) */
  bestaand: Portefeuille | null;
  /** Alle portefeuilles, om een eerdere koppeling Bloxs-eigenaar → GoHome-eigenaar te vinden */
  portefeuilles: readonly Portefeuille[];
  onKlaar: (portefeuilleId: string) => Promise<void> | void;
}

/** Portefeuille uit Bloxs (OData-feed) inladen, of opnieuw inladen */
export function BloxsDialoog(p: Props) {
  return (
    <Dialog open={p.open} onOpenChange={p.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {p.bestaand ? "Opnieuw inladen uit Bloxs" : "Portefeuille uit Bloxs"}
          </DialogTitle>
          <DialogDescription>
            Alleen de naam van de eigenaar en per object het adres (postcode, huisnummer, straat,
            woonplaats). Geen huurders-, contract- of financiële gegevens.
          </DialogDescription>
        </DialogHeader>
        {p.open && <Inhoud {...p} />}
      </DialogContent>
    </Dialog>
  );
}

type Fase = "testen" | "eigenaren" | "kiezen" | "objecten" | "keuze" | "opslaan" | "klaar" | "fout";

/** De HTTP-status uit een mislukte stap, als die er is (alleen het getal) */
const statusVan = (r: object) =>
  "status" in r && typeof r.status === "number" ? r.status : undefined;

interface Samenvatting {
  plan: SyncPlan;
  units: number;
  buildings: number;
  vervallenObjecten: number;
  gemarkeerd: number;
  teruggekeerd: number;
}

interface InlaadKeuze {
  eigenaar: Eigenaar;
  objecten: BloxsObject[];
  klantId: string;
}

function Inhoud({ klanten, bestaand, portefeuilles, onKlaar, onOpenChange }: Props) {
  const [fase, setFase] = useState<Fase>("testen");
  const [fout, setFout] = useState<string>("");
  const [aanvragen, setAanvragen] = useState(0);
  const teller = useRef(0);
  const stoppen = useRef(false);
  const [eigenaren, setEigenaren] = useState<Eigenaar[]>([]);
  const [zoek, setZoek] = useState("");
  const [eigenaar, setEigenaar] = useState<Eigenaar | null>(null);
  const [selectie, setSelectie] = useState<Eigenaar[]>([]);
  const [inlaadKeuzes, setInlaadKeuzes] = useState<InlaadKeuze[]>([]);
  const [uitkomsten, setUitkomsten] = useState<{ naam: string; samenvatting: Samenvatting }[]>([]);
  const [objecten, setObjecten] = useState<BloxsObject[]>([]);
  const [voortgang, setVoortgang] = useState("");
  const [complex, setComplex] = useState("");
  const [naam, setNaam] = useState("");
  const [klantId, setKlantId] = useState(bestaand?.klantId ?? "");
  const [samenvatting, setSamenvatting] = useState<Samenvatting | null>(null);

  const tel = (n: number) => {
    teller.current += n;
    setAanvragen(teller.current);
  };
  const mislukt = (f: BloxsFout | "gestopt" | "onbekend", status?: number) => {
    setFout(
      f === "gestopt"
        ? "Gestopt. Er is niets opgeslagen."
        : f === "onbekend"
          ? "Er ging iets mis bij het inladen van deze eigenaar."
          : bloxsFoutTekst(f) + (status ? " (HTTP " + status + ")" : ""),
    );
    setFase("fout");
    return null;
  };

  // bij openen: eerst testen of $select/$filter/$top werken (zonder rijen)
  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        const t = await bloxsFunctiesTesten();
        tel(t.aanvragen);
        if (weg) return;
        if (!t.ok) { mislukt(t.fout, statusVan(t)); return; }
        if (bestaand) {
          if (!bestaand.bloxsEigenaarRef && !bestaand.bloxsComplexRef) { mislukt("onbekend"); return; }
          await haalObjecten(
            idUitTekst(bestaand.bloxsEigenaarRef ?? ""),
            bestaand.bloxsComplexRef ? idUitTekst(bestaand.bloxsComplexRef) : null,
            true,
          );
          return;
        }
        setFase("eigenaren");
        const e = await bloxsEigenaren();
        tel(e.aanvragen);
        if (weg) return;
        if (!e.ok) { mislukt(e.fout, statusVan(e)); return; }
        setEigenaren(e.data);
        setFase("kiezen");
      } catch {
        if (!weg) mislukt("onbekend");
      }
    })();
    return () => {
      weg = true;
      stoppen.current = true;
    };
    // eenmalig bij openen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function haalObjecten(e: BloxsId, c: BloxsId | null, directOpslaan: boolean, meerdere = false): Promise<BloxsObject[] | null> {
    setFase("objecten");
    stoppen.current = false;
    const alle: BloxsObject[] = [];
    const soorten: Soort[] = c != null ? ["unit"] : ["unit", "building"];
    try {
      for (const soort of soorten) {
        let cursor: Cursor | null = { skip: 0 };
        while (cursor) {
          if (stoppen.current) return mislukt("gestopt");
          setVoortgang(
            (soort === "unit" ? "Units" : "Buildings") + " ophalen… (" + alle.length + " objecten)",
          );
          const r: Awaited<ReturnType<typeof bloxsObjectenPagina>> = await bloxsObjectenPagina({
            data: { soort, eigenaar: e, complex: c, cursor },
          });
          tel(r.aanvragen);
          if (!r.ok) return mislukt(r.fout, statusVan(r));
          alle.push(...r.data.objecten);
          cursor = r.data.volgende;
        }
      }
    } catch {
      return mislukt("onbekend");
    }
    if (meerdere) return alle;
    setObjecten(alle);
    if (directOpslaan) await opslaan(alle, c);
    else setFase("keuze");
    return alle;
  }

  async function haalGekozen() {
    setUitkomsten([]);
    if (selectie.length === 1) {
      const e = selectie[0];
      if (e) await haalObjecten(e.id, null, false);
      return;
    }
    const keuzes: InlaadKeuze[] = [];
    for (const e of selectie) {
      if (stoppen.current) { mislukt("gestopt"); return; }
      const alle = await haalObjecten(e.id, null, false, true);
      if (!alle) return;
      const k = kiesGohomeEigenaar(e, portefeuilles, klanten);
      keuzes.push({ eigenaar: e, objecten: alle, klantId: k.soort === "bestaand" ? k.klantId : NIEUW });
    }
    setInlaadKeuzes(keuzes);
    setFase("keuze");
  }

  const complexLijst = useMemo(() => complexen(objecten), [objecten]);
  const gekozenComplex = complexLijst.find((c) => String(c.id) === complex) ?? null;
  const voorstelNaam = (eigenaar?.naam ?? "") + (gekozenComplex ? " – " + gekozenComplex.naam : "");

  async function opslaan(alle: readonly BloxsObject[], c: BloxsId | null, keuze?: InlaadKeuze) {
    setFase("opslaan");
    const gekozen =
      c != null
        ? alle.filter((o) => o.soort === "unit" && String(o.complexId) === String(c))
        : alle;
    if (!gekozen.length) {
      // nooit een lege sync opslaan: dan zouden alle adressen als "niet meer in Bloxs" gelden
      setFout("Bloxs gaf geen objecten voor deze selectie. Er is niets opgeslagen.");
      setFase("fout");
      return null;
    }
    try {
      const bronEigenaar = keuze?.eigenaar ?? eigenaar;
      if (!bestaand && !bronEigenaar) return mislukt("onbekend");
      const ids = adresIds(gekozen);
      // kleine porties; bij een 400 (filter te ingewikkeld) halveert adressenInPorties de portie
      const r0 = await adressenInPorties(
        ids,
        async (deel) => bloxsAdressen({ data: { ids: deel } }),
        {
          gestopt: () => stoppen.current,
          voortgang: (klaar, totaal) =>
            setVoortgang("Adressen ophalen… " + klaar + " van " + totaal),
        },
      );
      tel(r0.aanvragen);
      if (!r0.ok) return mislukt(r0.fout, r0.status);
      const adressen: BloxsAdres[] = r0.data;
      const plan = maakSyncPlan(gekozen, adressen);
      setVoortgang("Opslaan…");
      const id = bestaand
        ? bestaand.id
        : await portefeuilleStore.maak(
            keuze ? keuze.eigenaar.naam : naam.trim() || voorstelNaam || "Bloxs",
            await klantVoorOpslaan(bronEigenaar, keuze?.klantId ?? klantId),
            {
              eigenaarRef: String(bronEigenaar?.id),
              complexRef: c != null ? String(c) : null,
            },
          );
      const r = await portefeuilleStore.bloxsSyncOpslaan(id, plan, crypto.randomUUID());
      const resultaat: Samenvatting = {
        plan,
        units: gekozen.filter((o) => o.soort === "unit").length,
        buildings: gekozen.filter((o) => o.soort === "building").length,
        ...r,
      };
      if (keuze) return { id, samenvatting: resultaat };
      setSamenvatting(resultaat);
      setFase("klaar");
      await onKlaar(id);
      return { id, samenvatting: resultaat };
    } catch {
      return mislukt("onbekend");
    }
  }

  async function laadMeerdereIn() {
    const opgeslagen: typeof uitkomsten = [];
    let laatsteId = "";
    for (const keuze of inlaadKeuzes.filter((k) => k.objecten.length > 0)) {
      if (stoppen.current) {
        mislukt("gestopt");
        break;
      }
      const r = await opslaan(keuze.objecten, null, keuze);
      if (!r) break;
      laatsteId = r.id;
      opgeslagen.push({ naam: keuze.eigenaar.naam, samenvatting: r.samenvatting });
      setUitkomsten([...opgeslagen]);
    }
    if (opgeslagen.length === inlaadKeuzes.filter((k) => k.objecten.length > 0).length) setFase("klaar");
    if (laatsteId) await onKlaar(laatsteId);
  }

  /** Bloxs-eigenaar kiezen; de GoHome-eigenaar wordt erbij voorgesteld (aan te passen) */
  function kies(e: Eigenaar) {
    const volgende = selectie.some((x) => x.id === e.id) ? selectie.filter((x) => x.id !== e.id) : [...selectie, e];
    setSelectie(volgende);
    const enkel = volgende.length === 1 ? volgende[0] : null;
    setEigenaar(enkel ?? null);
    if (!enkel) return;
    const k = kiesGohomeEigenaar(enkel, portefeuilles, klanten);
    setKlantId(k.soort === "bestaand" ? k.klantId : NIEUW);
  }

  /** De GoHome-eigenaar bij het opslaan; "nieuw" maakt hem aan (of vindt hem als hij al bestaat) */
  async function klantVoorOpslaan(e: Eigenaar | null, gekozenKlant: string): Promise<string | null> {
    if (gekozenKlant !== NIEUW) return gekozenKlant || null;
    if (!e) throw new Error("Geen eigenaar gekozen");
    try {
      return (await klantenStore.voegToe(e.naam)).id;
    } catch {
      // bestaat al (bijv. net door een collega aangemaakt): op naam opzoeken
      const lijst = await klantenStore.lijst();
      const bestaandKlant = lijst.find((k) => naamSleutel(k.naam) === naamSleutel(e.naam));
      if (!bestaandKlant) throw new Error("Eigenaar aanmaken mislukt");
      return bestaandKlant.id;
    }
  }

  const zichtbaar = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    return z
      ? eigenaren.filter(
          (e) => e.naam.toLowerCase().includes(z) || (e.referentie ?? "").toLowerCase().includes(z),
        )
      : eigenaren;
  }, [eigenaren, zoek]);

  const bezig =
    fase === "testen" || fase === "eigenaren" || fase === "objecten" || fase === "opslaan";

  return (
    <div className="space-y-4 text-sm">
      {bezig && (
        <p role="status" className="text-muted-foreground">
          {fase === "testen"
            ? "Verbinding met Bloxs controleren…"
            : fase === "eigenaren"
              ? "Eigenaren ophalen…"
              : voortgang}
        </p>
      )}

      {fase === "kiezen" && (
        <div className="space-y-2">
          <label className="block font-medium" htmlFor="bloxs-zoek">
            Eigenaren ({eigenaren.length}) · {selectie.length} geselecteerd
          </label>
          <Input
            id="bloxs-zoek"
            placeholder="Zoek op naam of referentie"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />
          <ul
            className="max-h-64 overflow-y-auto rounded-xl border border-border"
            aria-label="Eigenaren"
          >
            {zichtbaar.map((e) => (
              <li key={String(e.id)}>
                <label
                  className={
                    "flex w-full cursor-pointer items-start gap-3 px-3 py-2 text-left hover:bg-secondary " +
                    (selectie.some((x) => x.id === e.id) ? "bg-secondary font-medium" : "")
                  }
                >
                  <Checkbox className="mt-0.5" checked={selectie.some((x) => x.id === e.id)} onCheckedChange={() => kies(e)} aria-label={e.naam} />
                  <span className="min-w-0 break-words">{e.naam}
                  {e.referentie && <span className="text-muted-foreground"> · {e.referentie}</span>}</span>
                </label>
              </li>
            ))}
            {!zichtbaar.length && (
              <li className="px-3 py-2 text-muted-foreground">Geen eigenaren gevonden.</li>
            )}
          </ul>
        </div>
      )}

      {fase === "keuze" && inlaadKeuzes.length > 0 && (
        <ul className="space-y-3">
          {inlaadKeuzes.map((k, i) => (
            <li key={String(k.eigenaar.id)} className="border-b border-border pb-3">
              <p className="font-medium break-words">{k.eigenaar.naam} · {aantal(k.objecten.length, "object", "objecten")}</p>
              {!k.objecten.length ? <p className="text-muted-foreground">Geen onverkochte objecten; wordt overgeslagen.</p> : (
                <label className="mt-2 flex flex-col gap-1">
                  <span className="text-muted-foreground">Eigenaar in GoHome · {k.eigenaar.naam}</span>
                  <select className="h-9 w-full min-w-0 rounded-xl border border-input bg-background px-2" value={k.klantId}
                    onChange={(e) => setInlaadKeuzes((vorige) => vorige.map((x, n) => n === i ? { ...x, klantId: e.target.value } : x))}>
                    <option value="">Geen eigenaar</option>
                    <option value={NIEUW}>+ Nieuw in GoHome: {k.eigenaar.naam}</option>
                    {klanten.map((klant) => <option key={klant.id} value={klant.id}>{klant.naam}</option>)}
                  </select>
                </label>
              )}
            </li>
          ))}
        </ul>
      )}

      {fase === "keuze" && !inlaadKeuzes.length && (
        <div className="space-y-3">
          <p>
            <b>{eigenaar?.naam}</b>:{" "}
            {aantal(objecten.filter((o) => o.soort === "unit").length, "unit", "units")} en{" "}
            {aantal(objecten.filter((o) => o.soort === "building").length, "building", "buildings")}
            .
          </p>
          {!objecten.length && (
            <p className="text-orange-ink">
              Deze eigenaar heeft geen (onverkochte) objecten in Bloxs. Kies een andere eigenaar.
            </p>
          )}
          {complexLijst.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Complex (optioneel)</span>
              <select
                className="h-9 max-w-full rounded-xl border border-input bg-background px-2"
                value={complex}
                onChange={(e) => setComplex(e.target.value)}
              >
                <option value="">Alle objecten van deze eigenaar</option>
                {complexLijst.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.naam} ({c.aantal})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Naam van de portefeuille</span>
            <Input
              value={naam || voorstelNaam}
              maxLength={200}
              onChange={(e) => setNaam(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Eigenaar in GoHome (optioneel)</span>
            <select
              className="h-9 max-w-full rounded-xl border border-input bg-background px-2"
              value={klantId}
              onChange={(e) => setKlantId(e.target.value)}
            >
              <option value="">Geen eigenaar</option>
              {eigenaar &&
                !klanten.some((k) => naamSleutel(k.naam) === naamSleutel(eigenaar.naam)) && (
                  <option value={NIEUW}>+ Nieuw in GoHome: {eigenaar.naam}</option>
                )}
              {klanten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.naam}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {fase === "klaar" && samenvatting && <Uitkomst s={samenvatting} opnieuw={!!bestaand} />}
      {uitkomsten.length > 0 && <div className="space-y-3" aria-label="Ingeladen portefeuilles">
        {uitkomsten.map((u) => <div key={u.naam}><p className="font-medium">{u.naam}</p><Uitkomst s={u.samenvatting} opnieuw={false} /></div>)}
      </div>}

      {fase === "fout" && (
        <p role="alert" className="text-destructive">
          {uitkomsten.length ? "De hierboven vermelde portefeuilles zijn opgeslagen. " + fout.replace("Er is niets opgeslagen.", "De overige eigenaren zijn niet opgeslagen.") : fout}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Aanvragen naar Bloxs: <span className="tabular-nums">{aanvragen}</span>
      </p>

      <DialogFooter>
        {bezig ? (
          <Button variant="outline" onClick={() => (stoppen.current = true)}>
            Stoppen
          </Button>
        ) : (
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {fase === "klaar" ? "Sluiten" : "Annuleren"}
          </Button>
        )}
        {fase === "kiezen" && (
          <Button
            disabled={!selectie.length}
            onClick={() => { stoppen.current = false; void haalGekozen(); }}
          >
            Objecten ophalen
          </Button>
        )}
        {fase === "keuze" && (
          <Button
            variant="ghost"
            onClick={() => {
              setObjecten([]);
              setComplex("");
              setNaam("");
              setInlaadKeuzes([]);
              setFase("kiezen");
            }}
          >
            Andere eigenaren
          </Button>
        )}
        {fase === "keuze" && (
          <Button
            disabled={inlaadKeuzes.length ? !inlaadKeuzes.some((k) => k.objecten.length > 0) : !objecten.length}
            onClick={() => { stoppen.current = false; void (inlaadKeuzes.length ? laadMeerdereIn() : opslaan(objecten, gekozenComplex ? gekozenComplex.id : null)); }}
          >
            Inladen
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function Uitkomst({ s, opnieuw }: { s: Samenvatting; opnieuw: boolean }) {
  const z = s.plan.zonderAdres;
  return (
    <div className="space-y-2" role="status">
      <p>
        {aantal(s.units + s.buildings, "object", "objecten")} ingeladen ({s.units} units,{" "}
        {s.buildings} buildings), {aantal(s.plan.adressen.length, "adres", "adressen")}
        {s.plan.gedeeld > 0 && <> ({s.plan.gedeeld} objecten delen een adres)</>}.
      </p>
      {opnieuw && (
        <p>
          {aantal(s.gemarkeerd, "adres", "adressen")} niet meer in Bloxs (gemarkeerd, niet
          verwijderd) · {s.teruggekeerd} weer terug ·{" "}
          {aantal(s.vervallenObjecten, "object", "objecten")} vervallen.
        </p>
      )}
      {z.length > 0 ? (
        <details>
          <summary className="text-orange-ink">
            {aantal(z.length, "object", "objecten")} zonder bruikbaar adres (te controleren in
            Bloxs)
          </summary>
          <ul className="mt-1 max-h-40 overflow-y-auto text-muted-foreground">
            {z.map((x, i) => (
              <li key={i}>
                {x.referentie}:{" "}
                {x.reden === "geen_adres" ? "geen adres" : "adres niet te splitsen (" + x.ruw + ")"}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="text-muted-foreground">Alle adressen waren goed te splitsen.</p>
      )}
    </div>
  );
}
