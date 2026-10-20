// Eenvoudsniveau per maatregel en per extra voorziening (bewuste afwijking van de bron).
// De bron kent per maatregel al "eenvoudig / gemiddeld / lastig" (h in MAATREGELEN), maar alle
// extra sanitaire en keukenvoorzieningen zijn daar samen "eenvoudig". Met dezelfde kosten per
// punt koos het advies dan toevallig de eerste in de lijst (bijv. stopcontacten vóór een kastje).
// Hier heeft elke voorziening een eigen niveau, instelbaar in Normen (alleen admin).
import type { Normen } from "../normen";
import type { Haalbaarheid } from "./types";

/** Niveaus van de maatregelen zelf: gelijk aan h in MAATREGELEN (de bron) */
export const MAATREGEL_NIVEAU: Readonly<Record<string, Haalbaarheid>> = {
  label: "gemiddeld",
  verwVertrek: "gemiddeld",
  koeling: "gemiddeld",
  verwOverig: "eenvoudig",
  aanrecht: "gemiddeld",
  keukenExtra: "eenvoudig",
  bad: "lastig",
  toiletHang: "gemiddeld",
  toilet: "lastig",
  wastafel: "gemiddeld",
  sanExtra: "eenvoudig",
  balkon: "lastig",
  aanbel: "eenvoudig",
  laadpaal: "gemiddeld",
};

/** Niveau per extra voorziening; sleutel "sanExtra.<k>" of "keukenExtra.<k>" (k uit de normen) */
export const VOORZIENING_NIVEAU: Readonly<Record<string, Haalbaarheid>> = {
  // badkamer
  "sanExtra.kastje": "eenvoudig", // wastafel vervangen door een wastafel met ingebouwd kastje
  "sanExtra.kastruimte": "eenvoudig", // kastje van 40 × 40 ophangen
  "sanExtra.kraan_een": "eenvoudig",
  "sanExtra.kraan_thermo": "eenvoudig",
  "sanExtra.afscheiding": "eenvoudig",
  "sanExtra.handdoekrad": "gemiddeld", // leidingwerk of elektra
  "sanExtra.stopcontact": "gemiddeld", // elektricien
  "sanExtra.bubbel": "gemiddeld",
  // keuken
  "keukenExtra.kast": "eenvoudig",
  "keukenExtra.kraan_een": "eenvoudig",
  "keukenExtra.kraan_thermo": "eenvoudig",
  "keukenExtra.koelkast": "eenvoudig",
  "keukenExtra.vriezer": "eenvoudig",
  "keukenExtra.oven": "eenvoudig",
  "keukenExtra.magnetron": "eenvoudig",
  "keukenExtra.vaatwasser": "eenvoudig",
  "keukenExtra.kook_ind": "gemiddeld", // krachtstroom
  "keukenExtra.kook_kera": "gemiddeld",
  "keukenExtra.kook_gas": "gemiddeld", // gasleiding
  "keukenExtra.oven_gas": "gemiddeld",
  "keukenExtra.afzuig": "gemiddeld", // afvoer naar buiten
  "keukenExtra.kokend": "gemiddeld", // elektra en waterleiding
};

export const NIVEAU_STANDAARD: Readonly<Record<string, Haalbaarheid>> = {
  ...MAATREGEL_NIVEAU,
  ...VOORZIENING_NIVEAU,
};

export const NIVEAUS: readonly Haalbaarheid[] = ["eenvoudig", "gemiddeld", "lastig"];

/** Het niveau van een maatregel of voorziening: uit de normen, anders de standaard */
export function niveauVan(
  N: Pick<Normen, "adviesNiveaus">,
  sleutel: string,
): Haalbaarheid | undefined {
  const n = N.adviesNiveaus?.[sleutel];
  return n && NIVEAUS.includes(n) ? n : NIVEAU_STANDAARD[sleutel];
}
