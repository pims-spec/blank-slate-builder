import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bloxsFoutTekst, type BloxsFout } from "@/lib/wws/bloxs/fouten";
import {
  bloxsStructuurOphalen,
  bloxsToegangTesten,
  bloxsVerbindingTesten,
} from "@/lib/wws/bloxs/bloxs.functions";
import type { BloxsStructuur } from "@/lib/wws/bloxs/metadata";

/**
 * Bloxs OData-feed op de beheerpagina: verbinding testen en de structuur bekijken (alleen namen
 * van entiteiten en velden, nooit gegevens).
 */
export function BloxsBeheer() {
  const [test, setTest] = useState<{ ok: true } | { ok: false; fout: BloxsFout } | null>(null);
  const [structuur, setStructuur] = useState<BloxsStructuur | null>(null);
  const [fout, setFout] = useState<BloxsFout | null>(null);
  const [bezig, setBezig] = useState<"test" | "structuur" | "toegang" | null>(null);
  const [toegang, setToegang] = useState<
    | { entiteit: string; ok: boolean; fout?: BloxsFout; status?: number; methoden?: string[] }[]
    | null
  >(null);
  const [zoek, setZoek] = useState("");

  async function testen() {
    setBezig("test");
    try {
      const r = await bloxsVerbindingTesten();
      setTest(r.ok ? { ok: true } : r);
    } catch {
      setTest({ ok: false, fout: "niet_bereikbaar" });
    } finally {
      setBezig(null);
    }
  }

  /** Per toegestane entiteit één vraag met $top=0 (geen rijen): heeft het account toegang? */
  async function toegangTesten() {
    setBezig("toegang");
    setFout(null);
    try {
      const r = await bloxsToegangTesten();
      if (r.ok) setToegang(r.data);
      else setFout(r.fout);
    } catch {
      setFout("niet_bereikbaar");
    } finally {
      setBezig(null);
    }
  }

  async function ophalen() {
    setBezig("structuur");
    setFout(null);
    try {
      const r = await bloxsStructuurOphalen();
      if (r.ok) setStructuur(r.data);
      else setFout(r.fout);
    } catch {
      setFout("niet_bereikbaar");
    } finally {
      setBezig(null);
    }
  }

  const zichtbaar = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    if (!structuur) return [];
    if (!z) return structuur.entiteiten;
    return structuur.entiteiten.filter(
      (e) => e.naam.toLowerCase().includes(z) || e.velden.some((v) => v.toLowerCase().includes(z)),
    );
  }, [structuur, zoek]);

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4" aria-label="Bloxs OData-feed">
      <h3 className="font-semibold text-foreground">Bloxs OData-feed</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Alleen de structuur (namen van entiteiten en velden) en per entiteit of er toegang is (vraag
        zonder rijen), nooit gegevens uit Bloxs.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!!bezig} onClick={() => void testen()}>
          {bezig === "test" ? "Testen…" : "Verbinding testen"}
        </Button>
        <Button variant="outline" disabled={!!bezig} onClick={() => void ophalen()}>
          {bezig === "structuur" ? "Ophalen…" : "Structuur ophalen"}
        </Button>
        <Button variant="outline" disabled={!!bezig} onClick={() => void toegangTesten()}>
          {bezig === "toegang" ? "Testen…" : "Toegang per entiteit testen"}
        </Button>
        {test && (
          <span
            role="status"
            className={"text-sm " + (test.ok ? "text-foreground" : "text-destructive")}
          >
            {test.ok ? "Verbinding werkt." : bloxsFoutTekst(test.fout)}
          </span>
        )}
      </div>
      {toegang && (
        <ul className="mt-3 space-y-1 text-sm" aria-label="Toegang per entiteit">
          {toegang.map((t) => (
            <li key={t.entiteit}>
              <code>{t.entiteit}</code>:{" "}
              {t.ok ? (
                t.entiteit.startsWith("$metadata") ? (
                  "ja, openbaar (zegt niets over de inloggegevens)"
                ) : (
                  "toegang"
                )
              ) : (
                <span className="text-destructive">
                  {bloxsFoutTekst(t.fout ?? "onverwacht_antwoord")}
                  {t.status ? " (HTTP " + t.status + ")" : ""}
                  {t.methoden?.length ? " · Bloxs vraagt: " + t.methoden.join(", ") : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {fout && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {bloxsFoutTekst(fout)}
        </p>
      )}
      {structuur && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {structuur.entiteiten.length} entiteiten
            </p>
            <Input
              className="w-full sm:w-72"
              placeholder="Zoek op entiteit of veld"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              aria-label="Zoek op entiteit of veld"
            />
          </div>
          <ul className="mt-3 space-y-1" aria-label="Entiteiten in de OData-feed">
            {zichtbaar.map((e) => (
              <li key={e.naam + "|" + e.type}>
                <details className="rounded-lg border border-border px-3 py-2">
                  <summary className="cursor-pointer text-sm">
                    <code>{e.naam}</code>{" "}
                    <span className="text-muted-foreground">
                      ({e.velden.length} velden{e.type !== e.naam ? ", type " + e.type : ""})
                    </span>
                  </summary>
                  <dl className="mt-2 space-y-1 text-xs">
                    {e.sleutel.length > 0 && (
                      <div>
                        <dt className="inline font-medium">Sleutel: </dt>
                        <dd className="inline">
                          <code>{e.sleutel.join(", ")}</code>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline font-medium">Velden: </dt>
                      <dd className="inline break-words">
                        <code>{e.velden.join(", ")}</code>
                      </dd>
                    </div>
                    {e.navigatie.length > 0 && (
                      <div>
                        <dt className="inline font-medium">Navigatie: </dt>
                        <dd className="inline break-words">
                          <code>{e.navigatie.join(", ")}</code>
                        </dd>
                      </div>
                    )}
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
