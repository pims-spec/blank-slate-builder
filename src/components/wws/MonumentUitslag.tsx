import { Button } from "@/components/ui/button";
import type { OphaalStaat } from "@/lib/wws/opzoeken/automatisch";
import type { MonumentStatus } from "@/lib/wws/opzoeken/monument";

const REGISTER = "https://monumentenregister.cultureelerfgoed.nl/monumenten/";

/**
 * De monumentstatus bij het adres (Kadaster en RCE), onder de keuze "Monument". Wordt vanzelf
 * opgehaald na postcode en huisnummer (TellingEditor); met "opnieuw ophalen" kan het nog een keer.
 */
export default function MonumentUitslag({
  staat,
  onOpnieuw,
}: {
  staat: OphaalStaat<MonumentStatus>;
  /** Alleen met schrijfrechten; zonder: geen knop */
  onOpnieuw?: (() => void) | undefined;
}) {
  const s = staat.uitslag;
  if (!onOpnieuw && !s && !staat.fout) return null;
  return (
    <div className="mt-2 space-y-2">
      {s && (
        <div
          className="space-y-1 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm"
          role="status"
          aria-label="Gevonden monumentstatus"
        >
          <p className="font-medium text-emerald-800 dark:text-emerald-300">
            ✓ Succesvol opgehaald bij het Kadaster en de RCE
          </p>
          {s.voorstel === null ? (
            <p>
              Bij {s.adres} is geen rijksmonument, gemeentelijk monument of rijksbeschermd stads- of
              dorpsgezicht gevonden. Provinciale monumenten en door de gemeente beschermde
              stadsgezichten staan niet in deze bronnen; controleer die bij de gemeente.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Gevonden bij {s.adres}:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {s.rijksmonument && (
                  <li>
                    <b>Rijksmonument</b>
                    {s.rijksmonumentNummers.map((n, i) => (
                      <span key={n}>
                        {i === 0 ? " (" : ", "}
                        <a
                          href={REGISTER + n}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline underline-offset-2"
                        >
                          nr. {n}
                        </a>
                        {i === s.rijksmonumentNummers.length - 1 ? ")" : ""}
                      </span>
                    ))}
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
              <p className="text-xs text-muted-foreground">
                De status is zo goed als de registratie bij het Kadaster en de RCE; een aanwijzing
                van na 2024 kan nog ontbreken.
              </p>
            </>
          )}
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
          {staat.bezig ? "Bezig met ophalen…" : "Monumentstatus opnieuw ophalen (Kadaster en RCE)"}
        </Button>
      )}
    </div>
  );
}
