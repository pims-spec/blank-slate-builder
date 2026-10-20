// Huurprijsindicator: postcode en "huisnummer + toevoeging" uit het venster → de velden voor het
// opzoeken (PDOK, BAG, EP-Online).
import { epAdresVelden } from "../opzoeken/eponline";
import { nieuweTellingAdres } from "../opzoeken/pdok";

export interface HuurAdres {
  postcode: string;
  huisnummer: string;
  huisletter: string;
  toevoeging: string;
}

/** "1234 AB" en "12 A" / "12-2" / "12 A 2" → de velden voor het opzoeken; null bij ongeldige invoer */
export function huurAdresUit(postcode: string, huisnummer: string): HuurAdres | null {
  const a = nieuweTellingAdres(postcode, huisnummer);
  if (!a) return null;
  const v = epAdresVelden({ postcode: a.postcode, huisnummer: a.huisnummer });
  // "12 A 2": huisletter én toevoeging (epAdresVelden kent alleen één van beide)
  const beide = /^([A-Za-z])[\s-]+(\S.*)$/.exec(v.huisnummertoevoeging);
  return {
    postcode: a.postcode,
    huisnummer: v.huisnummer,
    huisletter: beide ? beide[1]! : v.huisletter,
    toevoeging: beide ? beide[2]! : v.huisnummertoevoeging,
  };
}
