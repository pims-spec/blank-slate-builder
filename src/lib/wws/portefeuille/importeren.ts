// Import van adressen uit Excel of CSV (naast Bloxs). Kolommen op naam: postcode, huisnummer,
// toevoeging (en eventueel huisletter, straat en woonplaats). De rijen komen als lijst van
// lijsten (SheetJS sheet_to_json met header: 1); de eerste rij met "postcode" is de kop.
import {
  adresSleutel,
  normaliseerAdres,
  schoonNaam,
  type AdresFout,
  type PortefeuilleAdres,
} from "./adres";

/** Maximaal aantal adressen per import */
export const MAX_IMPORT = 5000;

export interface ImportUitkomst {
  adressen: PortefeuilleAdres[];
  /** Rijnummer zoals in het bestand (1 = eerste rij) */
  ongeldig: { rij: number; reden: string }[];
  dubbel: { rij: number; adres: PortefeuilleAdres }[];
  /** Rijen na het maximum */
  teVeel: number;
  fout?: "geen_kop" | "leeg";
}

const REDEN: Record<AdresFout, string> = {
  postcode: "ongeldige postcode",
  huisnummer: "ongeldig huisnummer",
  toevoeging: "ongeldige huisletter of toevoeging",
};

const naam = (x: unknown) =>
  String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** Welke kolom is wat; null als er geen kop met postcode en huisnummer is */
function kolommen(kop: readonly unknown[]) {
  const n = kop.map(naam);
  const zoek = (...namen: string[]) => n.findIndex((k) => namen.includes(k));
  const postcode = zoek("postcode", "pc");
  const huisnummer = zoek("huisnummer", "huisnr", "nummer", "nr");
  if (postcode < 0 || huisnummer < 0) return null;
  return {
    postcode,
    huisnummer,
    toevoeging: zoek("toevoeging", "huisnummertoevoeging", "toev"),
    huisletter: zoek("huisletter", "letter"),
    straat: zoek("straat", "straatnaam", "openbareruimte"),
    woonplaats: zoek("woonplaats", "plaats", "plaatsnaam", "stad"),
  };
}

/** Rijen uit een spreadsheet of CSV naar genormaliseerde, unieke adressen */
export function leesImport(rijen: readonly (readonly unknown[])[]): ImportUitkomst {
  const uit: ImportUitkomst = { adressen: [], ongeldig: [], dubbel: [], teVeel: 0 };
  const kopIndex = rijen.findIndex((r) => kolommen(r) !== null);
  if (kopIndex < 0) return { ...uit, fout: "geen_kop" };
  const k = kolommen(rijen[kopIndex]!)!;
  const gezien = new Set<string>();
  for (let i = kopIndex + 1; i < rijen.length; i++) {
    const r = rijen[i]!;
    if (r.every((c) => String(c ?? "").trim() === "")) continue; // lege rij
    const a = normaliseerAdres({
      postcode: r[k.postcode],
      huisnummer: r[k.huisnummer],
      toevoeging: k.toevoeging >= 0 ? r[k.toevoeging] : "",
      huisletter: k.huisletter >= 0 ? r[k.huisletter] : "",
    });
    if (!a.ok) {
      uit.ongeldig.push({ rij: i + 1, reden: REDEN[a.fout] });
      continue;
    }
    const s = adresSleutel(a.adres);
    if (gezien.has(s)) {
      uit.dubbel.push({ rij: i + 1, adres: a.adres });
      continue;
    }
    if (uit.adressen.length >= MAX_IMPORT) {
      uit.teVeel++;
      continue;
    }
    gezien.add(s);
    const straat = k.straat >= 0 ? schoonNaam(r[k.straat], 200) : null;
    const woonplaats = k.woonplaats >= 0 ? schoonNaam(r[k.woonplaats], 100) : null;
    uit.adressen.push({
      ...a.adres,
      ...(straat ? { straat } : {}),
      ...(woonplaats ? { woonplaats } : {}),
    });
  }
  if (!uit.adressen.length && !uit.ongeldig.length && !uit.dubbel.length) uit.fout = "leeg";
  return uit;
}
