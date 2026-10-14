// Velden van het normenformulier — zoals renderNormen() in wws-site.html (zelfde labels en
// paden, bv. "san.douche" of "energie.A.0"), plus de standaardkosten van het verbeteradvies.
import { LABELS, num } from "./basis";
import type { Normen } from "./normen";

export interface NormVeld {
  label: string;
  pad: string;
}

export interface NormSectie {
  titel: string;
  velden: NormVeld[];
}

const v = (label: string, pad: string): NormVeld => ({ label, pad });

/** Losse getallen, per sectie (energielabel, voorzieningen en WOZ staan in tabellen) */
export const NORM_SECTIES: NormSectie[] = [
  {
    titel: "Oppervlakte en verwarming",
    velden: [
      v("Per m² vertrek", "oppVertrek"),
      v("Per m² overige ruimte", "oppOverig"),
      v("Aftrek zolder zonder vaste trap", "zolderZonderTrap"),
      v("Per verwarmd vertrek", "verwVertrek"),
      v("Per verwarmde overige/verkeersruimte", "verwOverig"),
      v("Maximum overige/verkeersruimten", "verwOverigMax"),
      v("Per verkoeld vertrek", "verkoelVertrek"),
      v("Maximum verkoeling", "verkoelMax"),
    ],
  },
  {
    titel: "Keuken",
    velden: [v("Aanrecht 1 tot 2 m", "keukenKort"), v("Aanrecht langer dan 2 m", "keukenLang")],
  },
  {
    titel: "Sanitair",
    velden: [
      v("Staand toilet toiletruimte", "san.toiletStaandApart"),
      v("Hangend toilet toiletruimte", "san.toiletHangApart"),
      v("Staand toilet badkamer", "san.toiletStaandBad"),
      v("Hangend toilet badkamer", "san.toiletHangBad"),
      v("Wastafel badkamer", "san.wastafelBad"),
      v("Wastafel per andere ruimte", "san.wastafelElders"),
      v("Meerpersoonswastafel badkamer", "san.meerpersBad"),
      v("Meerpersoonswastafel per andere ruimte", "san.meerpersElders"),
      v("Douche", "san.douche"),
      v("Bad", "san.bad"),
      v("Bad met douche", "san.badDouche"),
    ],
  },
  {
    titel: "Handicap, buitenruimte, parkeren, bijzonder",
    velden: [
      v("Handicap: € per punt", "handicapPerPunt"),
      v("Privé buitenruimte aanwezig", "buitenAanwezig"),
      v("Per m² privé", "buitenPerM2"),
      v("Per m² gemeenschappelijk", "gemBuitenPerM2"),
      v("Geen buitenruimte", "geenBuiten"),
      v("Maximum buitenruimte", "buitenMax"),
      v("Parkeerplek type I", "parkeer.I"),
      v("Parkeerplek type II", "parkeer.II"),
      v("Parkeerplek type III", "parkeer.III"),
      v("Laadpaal", "laadpaal"),
      v("Zorgwoning (%)", "zorgPct"),
      v("Aanbelfunctie video/audio", "aanbel"),
    ],
  },
  {
    titel: "WOZ",
    velden: [v("Minimum WOZ-waarde (€)", "wozMinimum"), v("WOZ-cap (%)", "wozCapPct")],
  },
  {
    titel: "Opslagen op de maximale huurprijs",
    velden: [
      v("Rijksmonument (%)", "opslag.rijksPct"),
      v("Rijksmonument, contract vóór 1-7-2024 (punten)", "opslag.rijksPunten"),
      v("Gemeentelijk/provinciaal monument (%)", "opslag.gemprovPct"),
      v("Beschermd stads-/dorpsgezicht (%)", "opslag.stadsPct"),
      v("Nieuwbouw middensector (%)", "opslag.nieuwbouwPct"),
    ],
  },
  {
    titel: "Segmenten",
    velden: [v("Sociale huur t/m", "grensLaag"), v("Middenhuur t/m", "grensMidden")],
  },
];

/** Energielabel-tabel: per label [eengezins, meergezins], plus EPV */
export const ENERGIE_RIJEN: { label: string; pad: string }[] = [
  ...LABELS.map((l) => ({ label: l, pad: "energie." + l })),
  { label: "EPV", pad: "epv" },
];

/** Waarde op een pad als "san.douche" of "energie.A.0" */
export function leesPad(obj: unknown, pad: string): unknown {
  return pad
    .split(".")
    .reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), obj);
}

/** Zet een waarde op een pad (muteert obj; tussenliggende objecten moeten bestaan) */
export function zetPad(obj: object, pad: string, waarde: unknown): void {
  const ks = pad.split(".");
  let o = obj as Record<string, unknown>;
  for (const k of ks.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[ks[ks.length - 1]!] = waarde;
}

/**
 * Nieuwe normen uit het formulier: getallen via num() (komma mag), tekstvelden zoals ze zijn —
 * zoals saveNormen() in wws-site.html. Wijzigt `basis` niet.
 */
export function normenUitFormulier(
  basis: Normen,
  getallen: Record<string, string>,
  teksten: Record<string, string> = {},
): Normen {
  const n = structuredClone(basis);
  for (const [pad, waarde] of Object.entries(getallen)) zetPad(n, pad, num(waarde));
  for (const [pad, waarde] of Object.entries(teksten)) zetPad(n, pad, waarde);
  return n;
}
