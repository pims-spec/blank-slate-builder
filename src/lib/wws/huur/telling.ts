// "Maak een volledige puntentelling" vanuit de huurprijsindicator: een nieuwe telling met wat al
// bekend is (adres, bouwjaar, woningtype, energielabel, WOZ, buitenruimte, garage) en de ruimten
// als lijst om in te meten. De aangenomen oppervlakten van de WWS-check gaan NIET mee: in een
// volledige telling meet je de ruimten zelf.
import { nieuweTellingStaat, type TellingStaat } from "../opslag/doc";
import type { Normen } from "../normen";
import type { HuurAntwoorden, HuurWoning } from "./model";
import type { HuurNormen } from "./normen";
import { globaleTelling } from "./wws";

export function startTelling(
  w: HuurWoning,
  a: HuurAntwoorden,
  H: HuurNormen,
  N: Normen,
  opsteller: string,
  nu = new Date(),
): TellingStaat {
  const s = nieuweTellingStaat(opsteller, nu);
  const x = globaleTelling(w, a, H, N, "hoog");
  // ruimten: soort en voorzieningen, oppervlakte leeg (zelf meten)
  x.vertrekken = x.vertrekken.map((r) => ({ ...r, m2: "", maten: [{ l: "", b: "" }] }));
  x.overig = x.overig.map((r) => ({ ...r, m2: "", maten: [{ l: "", b: "" }] }));
  if (a.buiten !== "geen" && !(a.buitenM2 > 0))
    x.buiten.ruimten = x.buiten.ruimten.map((b) => ({ ...b, m2: "" }));
  return {
    ...s,
    meta: {
      ...s.meta,
      postcode: w.postcode.replace(/^(\d{4})([A-Z]{2})$/, "$1 $2"),
      huisnummer: w.huisnummer,
      adres: w.straat,
      plaats: w.plaats,
      bouwjaar: w.bouwjaar ? String(w.bouwjaar) : "",
    },
    input: x,
  };
}
