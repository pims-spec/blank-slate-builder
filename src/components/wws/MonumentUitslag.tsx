import type { MonumentStatus } from "@/lib/wws/opzoeken/monument";

const REGISTER = "https://monumentenregister.cultureelerfgoed.nl/monumenten/";

/**
 * Wat er bij het adres is gevonden (Kadaster en RCE), onder de keuze "Monument". Het ophalen
 * gebeurt vanzelf na het invullen van postcode en huisnummer (TellingEditor).
 */
export default function MonumentUitslag({ status: s }: { status: MonumentStatus }) {
  return (
    <div
      className="space-y-1 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm"
      role="status"
      aria-label="Gevonden monumentstatus"
    >
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
            De status is zo goed als de registratie bij het Kadaster en de RCE; een aanwijzing van
            na 2024 kan nog ontbreken.
          </p>
        </>
      )}
    </div>
  );
}
