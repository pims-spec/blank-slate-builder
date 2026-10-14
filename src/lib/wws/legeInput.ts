import type { WwsInput } from "./types";

/** Lege telling, gelijk aan emptyTelling().input in wws-site.html */
export function legeInput(): WwsInput {
  return {
    woningtype: "meergezins",
    facV: 1,
    vertrekken: [],
    overig: [],
    energie: { soort: "label", label: "", indexKlasse: "", datum: "", bouwjaar: "" },
    handicap: { investering: "" },
    buiten: { gemAdressen: 1, ruimten: [] },
    gem: { adressen: 1, vertrekken: [], overig: [], voorzPunten: "" },
    parkeer: { typeI: "", typeII: "", typeIII: "", adressen: 1, laadpalen: "" },
    woz: { soort: "woz", waarde: "", jaar: "2026", nieuwbouw1519: false, kleinCorop: false },
    bijz: { zorgwoning: false, aanbel: false, laadpalen: "" },
    opslag: { keuze: "geen", monument: "geen", contractVoor2024: false, nieuwbouw: false },
  };
}
