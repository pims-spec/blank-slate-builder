import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MonumentKeuze } from "@/lib/wws/types";
import { EpVraagSchema } from "@/lib/wws/opzoeken/dienst";
import { epAdresVelden } from "@/lib/wws/opzoeken/eponline";
import { monumentFoutMelding, type MonumentStatus } from "@/lib/wws/opzoeken/monument";
import { zoekMonument } from "@/lib/wws/opzoeken/opzoeken.functions";
import type { TellingMeta } from "@/lib/wws/opslag";

interface Props {
  meta: TellingMeta;
  /** De huidige keuze bij "Monument" */
  keuze: MonumentKeuze;
  /** Een keuze overnemen in de telling */
  zetKeuze: (k: MonumentKeuze) => void;
}

const REGISTER = "https://monumentenregister.cultureelerfgoed.nl/monumenten/";

/**
 * "Monumentstatus opzoeken" bij rubriek 13: rijks- en gemeentelijk monument (Kadaster) en
 * rijksbeschermd stads- of dorpsgezicht (RCE). Neemt niets vanzelf over: de gebruiker klikt.
 */
export default function MonumentOpzoeken({ meta, keuze, zetKeuze }: Props) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [s, setS] = useState<MonumentStatus | null>(null);

  async function opzoeken() {
    const vraag = EpVraagSchema.safeParse(epAdresVelden(meta));
    setS(null);
    if (!vraag.success) return setFout(monumentFoutMelding("ongeldige_invoer"));
    setBezig(true);
    setFout(null);
    try {
      const r = await zoekMonument({ data: vraag.data });
      if (r.ok) setS(r.data);
      else setFout(monumentFoutMelding(r.fout));
    } catch {
      setFout(monumentFoutMelding("geen_verbinding"));
    } finally {
      setBezig(false);
    }
  }

  const knop = (k: MonumentKeuze, tekst: string, eerste = false) => (
    <Button
      key={k}
      type="button"
      size="sm"
      variant={eerste ? "default" : "outline"}
      disabled={keuze === k}
      onClick={() => zetKeuze(k)}
    >
      {keuze === k ? "Overgenomen: " + tekst : tekst}
    </Button>
  );

  return (
    <div className="mt-3 space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={opzoeken} disabled={bezig}>
        {bezig ? "Bezig met opzoeken…" : "Monumentstatus opzoeken (Kadaster en RCE)"}
      </Button>
      {fout && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm" role="status">
          {fout}
        </p>
      )}
      {s && (
        <div
          className="space-y-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm"
          role="status"
          aria-label="Resultaat monumentstatus"
        >
          <p className="text-xs text-muted-foreground">{s.adres}</p>
          {s.voorstel === null ? (
            <p>
              Geen rijksmonument, geen gemeentelijk monument en geen rijksbeschermd stads- of
              dorpsgezicht gevonden. Provinciale monumenten en door de gemeente beschermde
              stadsgezichten staan niet in deze bronnen; controleer die bij de gemeente.
            </p>
          ) : (
            <ul className="list-disc space-y-0.5 pl-5">
              {s.rijksmonument && (
                <li>
                  <b>Rijksmonument</b>
                  {s.rijksmonumentNummers.length > 0 && (
                    <>
                      {" "}
                      (
                      {s.rijksmonumentNummers.map((n, i) => (
                        <span key={n}>
                          {i > 0 && ", "}
                          <a
                            href={REGISTER + n}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline underline-offset-2"
                          >
                            nr. {n}
                          </a>
                        </span>
                      ))}
                      )
                    </>
                  )}
                </li>
              )}
              {s.gemeentelijkMonument && (
                <li>
                  <b>Gemeentelijk monument</b> (aanwijzing geregistreerd bij het Kadaster)
                </li>
              )}
              {s.gezichten.map((g) => (
                <li key={g}>
                  Ligt in <b>beschermd stads- of dorpsgezicht</b> {g}
                </li>
              ))}
            </ul>
          )}
          {s.voorstel && (
            <div className="flex flex-wrap gap-2">
              {s.rijksmonument && (
                <>
                  {knop("rijks_voor", "Rijksmonument, contract vóór 1 juli 2024", true)}
                  {knop("rijks_na", "Rijksmonument, contract na 1 juli 2024", true)}
                </>
              )}
              {s.gemeentelijkMonument &&
                knop("gemprov", "Gemeentelijk monument", s.voorstel === "gemprov")}
              {s.gezichten.length > 0 &&
                knop("stads", "Beschermd stads- en dorpsgezicht", s.voorstel === "stads")}
            </div>
          )}
          {s.voorstel && (
            <p className="text-xs text-muted-foreground">
              Kies wat je overneemt; er telt één keuze. De status is zo goed als de registratie bij
              het Kadaster en de RCE; een aanwijzing van na 2024 kan nog ontbreken.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
