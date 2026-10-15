// Adressen van een portefeuille: normaliseren (zoals ze in portefeuille_adressen staan),
// dubbele herkennen en omzetten naar een EP-Online-vraag.

export interface PortefeuilleAdres {
  /** Postcode zonder spatie, in hoofdletters: "1053ZD" */
  postcode: string;
  huisnummer: number;
  /** Eén letter of leeg: "A" */
  huisletter: string;
  /** Letters/cijfers of leeg: "2", "BIS", "H" */
  toevoeging: string;
}

export type AdresFout = "postcode" | "huisnummer" | "toevoeging";

/**
 * Een adres uit een import (of later Bloks) naar de vaste vorm. Een huisnummer als "12A" of
 * "12-2" wordt gesplitst; een toevoeging van één letter is een huisletter.
 */
export function normaliseerAdres(ruw: {
  postcode: unknown;
  huisnummer: unknown;
  toevoeging?: unknown;
  huisletter?: unknown;
}): { ok: true; adres: PortefeuilleAdres } | { ok: false; fout: AdresFout } {
  const postcode = String(ruw.postcode ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(postcode)) return { ok: false, fout: "postcode" };

  const hnRuw = String(ruw.huisnummer ?? "").trim();
  const m = /^(\d{1,5})\s*[-\s]?\s*([A-Za-z0-9 -]*)$/.exec(hnRuw);
  if (!m || Number(m[1]) < 1) return { ok: false, fout: "huisnummer" };
  const huisnummer = Number(m[1]);

  const schoon = (x: unknown) =>
    String(x ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  let huisletter = schoon(ruw.huisletter);
  let toevoeging = schoon(ruw.toevoeging);
  const rest = schoon(m[2]);
  if (rest) {
    // "12A" → letter A; "12-2" of "12 BIS" → toevoeging
    if (!huisletter && /^[A-Z]$/.test(rest)) huisletter = rest;
    else if (!toevoeging) toevoeging = rest;
    else toevoeging = rest + toevoeging;
  }
  if (!huisletter && /^[A-Z]$/.test(toevoeging)) {
    huisletter = toevoeging;
    toevoeging = "";
  }
  if (huisletter.length > 1) return { ok: false, fout: "toevoeging" };
  if (toevoeging.length > 10) return { ok: false, fout: "toevoeging" };
  return { ok: true, adres: { postcode, huisnummer, huisletter, toevoeging } };
}

/** Sleutel om dubbele adressen te herkennen (dezelfde als de unieke index in de database) */
export const adresSleutel = (a: PortefeuilleAdres) =>
  [a.postcode, a.huisnummer, a.huisletter, a.toevoeging].join("|");

/** "1053 ZD 49A-2" */
export function adresTekst(a: PortefeuilleAdres): string {
  return (
    a.postcode.slice(0, 4) +
    " " +
    a.postcode.slice(4) +
    " " +
    a.huisnummer +
    a.huisletter +
    (a.toevoeging ? "-" + a.toevoeging : "")
  );
}

/** De vraag aan EP-Online (zelfde velden als de bestaande opzoekfunctie) */
export function epVraagVoor(a: PortefeuilleAdres) {
  return {
    postcode: a.postcode,
    huisnummer: String(a.huisnummer),
    huisletter: a.huisletter,
    huisnummertoevoeging: a.toevoeging,
  };
}
