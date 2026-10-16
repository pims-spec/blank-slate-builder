import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  bloxsAdressen,
  bloxsEigenaren,
  bloxsFunctiesTesten,
  bloxsObjectenPagina,
} from "@/lib/wws/bloxs/bloxs.functions";
import { bloxsFoutTekst, type BloxsFout } from "@/lib/wws/bloxs/fouten";
import type { BloxsId } from "@/lib/wws/bloxs/odata";
import type { BloxsAdres, BloxsObject, Cursor, Eigenaar, Soort } from "@/lib/wws/bloxs/sync";
import { MAX_ADRESSEN } from "@/lib/wws/bloxs/sync";
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
import { portefeuilleStore } from "../tellingStore";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  klanten: readonly Klant[];
  /** Opnieuw inladen (anders een nieuwe portefeuille uit Bloxs) */
  bestaand: Portefeuille | null;
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

interface Samenvatting {
  plan: SyncPlan;
  units: number;
  buildings: number;
  vervallenObjecten: number;
  gemarkeerd: number;
  teruggekeerd: number;
}

function Inhoud({ klanten, bestaand, onKlaar, onOpenChange }: Props) {
  const [fase, setFase] = useState<Fase>("testen");
  const [fout, setFout] = useState<string>("");
  const [aanvragen, setAanvragen] = useState(0);
  const teller = useRef(0);
  const stoppen = useRef(false);
  const [eigenaren, setEigenaren] = useState<Eigenaar[]>([]);
  const [zoek, setZoek] = useState("");
  const [eigenaar, setEigenaar] = useState<Eigenaar | null>(null);
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
  const mislukt = (f: BloxsFout | "gestopt" | "onbekend") => {
    setFout(
      f === "gestopt"
        ? "Gestopt. Er is niets opgeslagen."
        : f === "onbekend"
          ? "Er ging iets mis. Er is niets opgeslagen."
          : bloxsFoutTekst(f),
    );
    setFase("fout");
  };

  // bij openen: eerst testen of $select/$filter/$top werken (zonder rijen)
  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        const t = await bloxsFunctiesTesten();
        tel(t.aanvragen);
        if (weg) return;
        if (!t.ok) return mislukt(t.fout);
        if (bestaand) {
          if (!bestaand.bloxsEigenaarRef && !bestaand.bloxsComplexRef) return mislukt("onbekend");
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
        if (!e.ok) return mislukt(e.fout);
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

  async function haalObjecten(e: BloxsId, c: BloxsId | null, directOpslaan: boolean) {
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
          if (!r.ok) return mislukt(r.fout);
          alle.push(...r.data.objecten);
          cursor = r.data.volgende;
        }
      }
    } catch {
      return mislukt("onbekend");
    }
    setObjecten(alle);
    if (directOpslaan) await opslaan(alle, c);
    else setFase("keuze");
  }

  const complexLijst = useMemo(() => complexen(objecten), [objecten]);
  const gekozenComplex = complexLijst.find((c) => String(c.id) === complex) ?? null;
  const voorstelNaam = (eigenaar?.naam ?? "") + (gekozenComplex ? " – " + gekozenComplex.naam : "");

  async function opslaan(alle: readonly BloxsObject[], c: BloxsId | null) {
    setFase("opslaan");
    const gekozen =
      c != null
        ? alle.filter((o) => o.soort === "unit" && String(o.complexId) === String(c))
        : alle;
    if (!gekozen.length) {
      // nooit een lege sync opslaan: dan zouden alle adressen als "niet meer in Bloxs" gelden
      setFout("Bloxs gaf geen objecten voor deze selectie. Er is niets opgeslagen.");
      setFase("fout");
      return;
    }
    try {
      const ids = adresIds(gekozen);
      const adressen: BloxsAdres[] = [];
      for (let i = 0; i < ids.length; i += MAX_ADRESSEN) {
        if (stoppen.current) return mislukt("gestopt");
        setVoortgang(
          "Adressen ophalen… " + Math.min(i + MAX_ADRESSEN, ids.length) + " van " + ids.length,
        );
        const r = await bloxsAdressen({ data: { ids: ids.slice(i, i + MAX_ADRESSEN) } });
        tel(r.aanvragen);
        if (!r.ok) return mislukt(r.fout);
        adressen.push(...r.data);
      }
      const plan = maakSyncPlan(gekozen, adressen);
      setVoortgang("Opslaan…");
      const id = bestaand
        ? bestaand.id
        : await portefeuilleStore.maak(naam.trim() || voorstelNaam || "Bloxs", klantId || null, {
            eigenaarRef: String(eigenaar!.id),
            complexRef: c != null ? String(c) : null,
          });
      const r = await portefeuilleStore.bloxsSyncOpslaan(id, plan, crypto.randomUUID());
      setSamenvatting({
        plan,
        units: gekozen.filter((o) => o.soort === "unit").length,
        buildings: gekozen.filter((o) => o.soort === "building").length,
        ...r,
      });
      setFase("klaar");
      await onKlaar(id);
    } catch {
      mislukt("onbekend");
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
            Eigenaar ({eigenaren.length})
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
                <button
                  type="button"
                  className={
                    "w-full px-3 py-2 text-left hover:bg-secondary " +
                    (eigenaar?.id === e.id ? "bg-secondary font-medium" : "")
                  }
                  onClick={() => setEigenaar(e)}
                >
                  {e.naam}
                  {e.referentie && <span className="text-muted-foreground"> · {e.referentie}</span>}
                </button>
              </li>
            ))}
            {!zichtbaar.length && (
              <li className="px-3 py-2 text-muted-foreground">Geen eigenaren gevonden.</li>
            )}
          </ul>
        </div>
      )}

      {fase === "keuze" && (
        <div className="space-y-3">
          <p>
            <b>{eigenaar?.naam}</b>:{" "}
            {aantal(objecten.filter((o) => o.soort === "unit").length, "unit", "units")} en{" "}
            {aantal(objecten.filter((o) => o.soort === "building").length, "building", "buildings")}
            .
          </p>
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

      {fase === "fout" && (
        <p role="alert" className="text-destructive">
          {fout}
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
            disabled={!eigenaar}
            onClick={() => eigenaar && void haalObjecten(eigenaar.id, null, false)}
          >
            Objecten ophalen
          </Button>
        )}
        {fase === "keuze" && (
          <Button
            disabled={!objecten.length}
            onClick={() => void opslaan(objecten, gekozenComplex ? gekozenComplex.id : null)}
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
