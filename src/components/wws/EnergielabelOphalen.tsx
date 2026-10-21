import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EpVraagSchema, epFoutMelding } from "@/lib/wws/opzoeken/dienst";
import {
  epAdresVelden,
  epBepaalSoort,
  epFindField,
  epToIsoDate,
  type EpLabel,
} from "@/lib/wws/opzoeken/eponline";
import { zoekEnergielabel } from "@/lib/wws/opzoeken/opzoeken.functions";
import type { TellingMeta } from "@/lib/wws/opslag";

const SOORT_NAAM = {
  labelOud: "Energielabel (vóór 2015)",
  index: "Energie-Index (2015-2021)",
  label: "Label vanaf 2021 (NTA 8800)",
  bouwjaar: "Bouwjaar (geen geldig label)",
} as const;

interface Props {
  meta: TellingMeta;
  /** Neemt het label over in de telling (epToepassen) */
  pasToe: (label: EpLabel) => void;
}

/** "Energielabel automatisch ophalen (EP-Online)" — epBlock() en haalEnergielabelOp() */
export default function EnergielabelOphalen({ meta, pasToe }: Props) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [label, setLabel] = useState<EpLabel | null>(null);

  async function ophalen() {
    const vraag = EpVraagSchema.safeParse(epAdresVelden(meta));
    if (!vraag.success) {
      setLabel(null);
      setFout(epFoutMelding("ongeldige_invoer"));
      return;
    }
    setBezig(true);
    setFout(null);
    setLabel(null);
    try {
      const r = await zoekEnergielabel({ data: vraag.data });
      if (r.ok) {
        setLabel(r.data);
        pasToe(r.data);
      } else setFout(epFoutMelding(r.fout));
    } catch {
      // geen details doorgeven: een fout van de server zelf, of geen verbinding
      setFout(epFoutMelding("geen_verbinding"));
    } finally {
      setBezig(false);
    }
  }

  const klasse = label && epFindField(label, ["energieklasse", "labelklasse", "energielabel"]);
  const datum =
    label &&
    (epToIsoDate(epFindField(label, ["registratiedatum"])) ||
      epToIsoDate(epFindField(label, ["opnamedatum"])));

  return (
    <div className="mt-3 space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={ophalen} disabled={bezig}>
        {bezig ? "Bezig met opzoeken…" : "Energielabel automatisch ophalen (EP-Online)"}
      </Button>
      {fout && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm" role="status">
          {fout}
        </p>
      )}
      {label && (
        <div className="space-y-2 text-sm" role="status" aria-label="Resultaat EP-Online">
          <p className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2">
            {klasse ? (
              <>
                Label <b>{String(klasse)}</b>
              </>
            ) : (
              "Geen labelklasse herkend"
            )}
            {datum ? ", registratiedatum " + datum : ""}
          </p>
          <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2">
            Overgenomen als <b>{SOORT_NAAM[epBepaalSoort(label).soort]}</b>{" "}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={() => pasToe(label)}
            >
              Opnieuw overnemen
            </Button>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Gegevens van EP-Online tonen
              </summary>
              <pre className="whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(label, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
