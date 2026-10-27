import { Button } from "@/components/ui/button";
import type { OphaalStaat } from "@/lib/wws/opzoeken/automatisch";
import { epBepaalSoort, epFindField, epToIsoDate, type EpLabel } from "@/lib/wws/opzoeken/eponline";

const SOORT_NAAM = {
  labelOud: "Energielabel (vóór 2015)",
  index: "Energie-Index (2015-2021)",
  label: "Label vanaf 2021 (NTA 8800)",
  bouwjaar: "Bouwjaar (geen geldig label)",
} as const;

/**
 * Het energielabel van EP-Online bij het adres: wordt vanzelf opgehaald na postcode en
 * huisnummer (TellingEditor); met "opnieuw ophalen" kan het nog een keer.
 */
export default function EnergielabelUitslag({
  staat,
  onOpnieuw,
}: {
  staat: OphaalStaat<EpLabel>;
  /** Alleen met schrijfrechten; zonder: geen knop */
  onOpnieuw?: (() => void) | undefined;
}) {
  const label = staat.uitslag;
  const klasse = label && epFindField(label, ["energieklasse", "labelklasse", "energielabel"]);
  const datum =
    label &&
    (epToIsoDate(epFindField(label, ["registratiedatum"])) ||
      epToIsoDate(epFindField(label, ["opnamedatum"])));
  if (!onOpnieuw && !label && !staat.fout) return null;
  return (
    <div className="mt-3 space-y-2">
      {label && (
        <div
          className="space-y-1 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm"
          role="status"
          aria-label="Resultaat EP-Online"
        >
          <p className="font-medium text-emerald-800 dark:text-emerald-300">
            ✓ Succesvol opgehaald bij EP-Online
          </p>
          <p>
            {klasse ? (
              <>
                Label <b>{String(klasse)}</b>
              </>
            ) : (
              "Geen labelklasse herkend"
            )}
            {datum ? ", registratiedatum " + datum : ""}
          </p>
          <p>
            Overgenomen als <b>{SOORT_NAAM[epBepaalSoort(label).soort]}</b>
          </p>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Gegevens van EP-Online tonen
            </summary>
            <pre className="whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(label, null, 2)}
            </pre>
          </details>
        </div>
      )}
      {staat.fout && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm" role="status">
          {staat.fout}
        </p>
      )}
      {onOpnieuw && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpnieuw}
          disabled={staat.bezig}
        >
          {staat.bezig ? "Bezig met ophalen…" : "Energielabel opnieuw ophalen (EP-Online)"}
        </Button>
      )}
    </div>
  );
}
