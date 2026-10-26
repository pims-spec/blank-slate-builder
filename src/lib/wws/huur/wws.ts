// Huurprijsindicator: de WWS-check. Uit de opgezochte en ingevulde gegevens maken we een globale
// telling in twee scenario's (laag en hoog) en rekenen die met de bestaande rekenkern. De uitkomst
// is dus een bandbreedte in punten, geen exact puntenaantal. Bij een grensgeval is een volledige
// telling nodig.
import { facDefault, LABELS } from "../basis";
import { calc, huurVoorPunten } from "../calc";
import { legeInput } from "../legeInput";
import type { Normen } from "../normen";
import type { Fac, Labelklasse, Segment, WwsInput } from "../types";
import type { HuurAntwoorden, HuurWoning } from "./model";
import type { HuurNormen, Staat } from "./normen";

type Scenario = "laag" | "hoog";

/** Keukenvoorzieningen per staat, voor het lage en het hoge scenario */
const KEUKEN: Record<Staat, Record<Scenario, Extract<Fac, { kind: "keuken" }>["keuken"]>> = {
  gedateerd: {
    laag: { lengte: "1-2", voorz: {} },
    hoog: { lengte: "1-2", voorz: { kook_kera: true, afzuig: true } },
  },
  modern: {
    laag: { lengte: "1-2", voorz: { kook_kera: true, afzuig: true, koelkast: true } },
    hoog: { lengte: ">=2", voorz: { kook_ind: true, afzuig: true, koelkast: true, oven: true } },
  },
  nieuw: {
    laag: { lengte: ">=2", voorz: { kook_ind: true, afzuig: true, koelkast: true, oven: true } },
    hoog: {
      lengte: ">=2",
      voorz: {
        kook_ind: true,
        afzuig: true,
        koelkast: true,
        oven: true,
        vaatwasser: true,
        magnetron: true,
        kraan_een: true,
      },
    },
  },
};

/** Extra's in de badkamer per staat (wastafel en douche zijn er altijd) */
const BADKAMER_EXTRA: Record<Staat, Record<Scenario, Record<string, boolean | number>>> = {
  gedateerd: { laag: {}, hoog: { kraan_een: 1 } },
  modern: {
    laag: { kraan_thermo: 1, afscheiding: true },
    hoog: { kraan_thermo: 1, afscheiding: true, kastje: 1, kastruimte: true },
  },
  nieuw: {
    laag: { kraan_thermo: 1, afscheiding: true, kastje: 1, kastruimte: true },
    hoog: {
      kraan_thermo: 1,
      afscheiding: true,
      kastje: 1,
      kastruimte: true,
      handdoekrad: 1,
      stopcontact: 2,
    },
  },
};

const BUITEN_STANDAARD_M2 = { balkon: 5, tuin: 30, dakterras: 15 } as const;

/** Een globale telling voor één scenario (alleen voor de WWS-check, niet om op te slaan) */
export function globaleTelling(
  w: HuurWoning,
  a: HuurAntwoorden,
  H: HuurNormen,
  N: Normen,
  s: Scenario,
): WwsInput {
  const x = legeInput();
  const app = a.woningtype === "appartement" || a.woningtype === "studio";
  x.woningtype = app ? "meergezins" : "eengezins";
  const aandeel = s === "laag" ? H.wws.vertrekAandeelLaag : H.wws.vertrekAandeelHoog;
  const opp = Math.max(10, a.oppervlakte);
  const vertrek = opp * Math.min(0.95, Math.max(0.5, aandeel));

  const keukenM2 = a.woningtype === "studio" ? 0 : 7;
  const badM2 = 4;
  const rest = Math.max(8, vertrek - keukenM2 - badM2);
  const n = a.woningtype === "studio" ? 0 : Math.max(0, Math.round(a.slaapkamers));
  const woon = n ? rest * 0.45 : rest;
  const slaap = n ? (rest - woon) / n : 0;
  const r2 = (v: number) => Math.round(v * 100) / 100;

  const keuken: Fac = { kind: "keuken", keuken: structuredClone(KEUKEN[a.keuken][s]) };
  const bad = facDefault("badkamer", false);
  if (bad.kind === "badkamer")
    bad.san.voorz = structuredClone(BADKAMER_EXTRA[a.badkamer][s]) as typeof bad.san.voorz;

  if (a.woningtype === "studio")
    x.vertrekken.push({
      type: "woonslaap_ok",
      m2: r2(rest),
      verwarmd: true,
      fac: keuken,
    });
  else {
    x.vertrekken.push({ type: "woonkamer", m2: r2(woon), verwarmd: true });
    x.vertrekken.push({ type: "keuken", m2: keukenM2, verwarmd: true, fac: keuken });
    for (let i = 0; i < n; i++)
      x.vertrekken.push({ type: "slaapkamer", m2: r2(slaap), verwarmd: true });
  }
  x.vertrekken.push({ type: "badkamer", m2: badM2, verwarmd: true, fac: bad });
  x.overig.push({
    type: "toilet",
    m2: 1.2,
    verwarmd: false,
    fac: { kind: "toilet", toilet: { toilet: "staand", fontein: s === "hoog" } },
  });
  const overig = Math.max(0, opp - vertrek - 1.2);
  if (overig > 0) x.overig.push({ type: "hal", m2: r2(overig), verwarmd: true });
  if (a.parkeren === "garage") x.overig.push({ type: "garage", m2: 15, verwarmd: false });

  if (a.buiten !== "geen") {
    const m2 = a.buitenM2 > 0 ? a.buitenM2 : BUITEN_STANDAARD_M2[a.buiten];
    x.buiten.ruimten.push({
      soort: a.buiten === "tuin" ? "achtertuin" : a.buiten,
      groep: "priv",
      m2,
    });
  }

  // energie: het label als dat bekend is, anders het bouwjaar
  if (a.label && LABELS.includes(a.label as never)) {
    const datum = w.labelDatum ?? "";
    x.energie = {
      soort: datum && datum < "2021-01-01" ? "labelOud" : "label",
      label: a.label as Labelklasse,
      indexKlasse: "",
      datum,
      bouwjaar: w.bouwjaar ?? "",
    };
  } else
    x.energie = {
      soort: "bouwjaar",
      label: "",
      indexKlasse: "",
      datum: "",
      bouwjaar: w.bouwjaar ?? "",
    };

  const jaren = Object.keys(N.woz).sort();
  x.woz = {
    ...x.woz,
    jaar: jaren.at(-1) ?? x.woz.jaar,
    ...(a.woz && a.woz > 0 ? { soort: "woz", waarde: a.woz } : { soort: "minimum", waarde: "" }),
  };
  return x;
}

export interface WwsCheck {
  puntenLaag: number;
  puntenHoog: number;
  segLaag: Segment;
  segHoog: Segment;
  /** De twee scenario's vallen in een ander segment: volledige telling nodig */
  grensgeval: boolean;
  /** Wettelijke maximale kale huur bij de lage en de hoge puntenschatting */
  maxHuurLaag: number;
  maxHuurHoog: number;
  /** Zonder WOZ: vanaf welke WOZ-waarde komt de woning (in beide scenario's) in de vrije sector */
  wozVrijeSector: { laag: number | null; hoog: number | null } | null;
  /** De globale telling (hoog scenario), om een volledige telling mee te beginnen */
  invoer: WwsInput;
}

/**
 * Laagste WOZ-waarde (op € 1.000) waarbij het scenario 187 punten of meer haalt; 0 = al met de
 * minimum-WOZ, null = nooit
 */
export function wozVoorVrijeSector(x: WwsInput, N: Normen): number | null {
  const met = (woz: number) =>
    calc({ ...x, woz: { ...x.woz, soort: "woz", waarde: woz } }, N).totaal;
  const grens = N.grensMidden + 1;
  if (calc({ ...x, woz: { ...x.woz, soort: "minimum", waarde: "" } }, N).totaal >= grens) return 0;
  let hoog = 3_000_000;
  if (met(hoog) < grens) return null;
  let laag = 0;
  while (hoog - laag > 1000) {
    const m = Math.floor((laag + hoog) / 2 / 1000) * 1000;
    if (m <= laag) break;
    if (met(m) >= grens) hoog = m;
    else laag = m;
  }
  return hoog;
}

/** De WWS-check als bandbreedte */
export function wwsCheck(w: HuurWoning, a: HuurAntwoorden, H: HuurNormen, N: Normen): WwsCheck {
  const xl = globaleTelling(w, a, H, N, "laag");
  const xh = globaleTelling(w, a, H, N, "hoog");
  const [rl, rh] = [calc(xl, N), calc(xh, N)];
  const puntenLaag = Math.min(rl.totaal, rh.totaal);
  const puntenHoog = Math.max(rl.totaal, rh.totaal);
  const segLaag = puntenLaag === rl.totaal ? rl.seg : rh.seg;
  const segHoog = puntenHoog === rh.totaal ? rh.seg : rl.seg;
  return {
    puntenLaag,
    puntenHoog,
    segLaag,
    segHoog,
    grensgeval: segLaag !== segHoog,
    maxHuurLaag: huurVoorPunten(puntenLaag, N) ?? 0,
    maxHuurHoog: huurVoorPunten(puntenHoog, N) ?? 0,
    wozVrijeSector:
      a.woz && a.woz > 0
        ? null
        : { laag: wozVoorVrijeSector(xh, N), hoog: wozVoorVrijeSector(xl, N) },
    invoer: xh,
  };
}

/**
 * De uitleg bij een WWS-check zonder WOZ-waarde, voor scherm en PDF. Het segment bepaalt of de
 * woning al vrije sector is, zodat ook oudere opgeslagen indicaties (toen nog met een zoekuitkomst
 * van ca. € 1.000) de goede tekst krijgen. null = er is een WOZ-waarde ingevuld.
 */
export function wozTekst(
  c: Pick<WwsCheck, "segLaag" | "segHoog" | "wozVrijeSector">,
  grens: number,
): string | null {
  const w = c.wozVrijeSector;
  if (!w) return null;
  const begin = "Zonder WOZ-waarde gerekend met de minimum-WOZ. ";
  if (c.segLaag === "hoog")
    return (
      begin +
      `Ook daarmee komt de woning naar verwachting al op ${grens} punten of meer; de WOZ-waarde verandert het segment niet.`
    );
  if (c.segHoog === "hoog")
    return (
      begin +
      `In het hoge scenario komt de woning al op ${grens} punten of meer; ` +
      (w.hoog != null
        ? `in het lage scenario vanaf een WOZ-waarde van ca. ${eurTekst(w.hoog)}.`
        : `in het lage scenario ook met een hoge WOZ-waarde niet.`)
    );
  if (w.laag == null)
    return (
      begin + `Ook met een hoge WOZ-waarde komt de woning naar verwachting niet op ${grens} punten.`
    );
  const bereik =
    w.hoog != null && w.hoog !== w.laag
      ? `${eurTekst(w.laag)}–${eurTekst(w.hoog)}`
      : eurTekst(w.laag);
  return (
    begin +
    `Vanaf een WOZ-waarde van ca. ${bereik} komt de woning naar verwachting op ${grens} punten of meer.`
  );
}

export interface HuurAdvies {
  bedrag: number;
  /** Welke grens het advies bepaalt */
  grond: "markthuur" | "maximale_huur";
  reden: string;
  volledigeTellingNodig: boolean;
}

const eurTekst = (x: number) =>
  "€ " + x.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/**
 * Het advies: altijd de laagste van markthuur en wettelijke maximale huur. Bij een
 * puntenbandbreedte geldt (voorzichtig) de maximale huur bij de lage puntenschatting.
 */
export function huurAdvies(markthuur: number, c: WwsCheck, N: Normen): HuurAdvies {
  const grens = N.grensMidden + 1;
  if (c.segLaag === "hoog") {
    return {
      bedrag: markthuur,
      grond: "markthuur",
      reden: `Naar verwachting ${c.puntenLaag}–${c.puntenHoog} punten: vanaf ${grens} punten (vrije sector) geldt geen wettelijke maximale huur. Het advies is de verwachte markthuur.`,
      volledigeTellingNodig: false,
    };
  }
  // hele euro's naar beneden, zodat het advies nooit boven het wettelijke maximum uitkomt
  const max = Math.floor(c.maxHuurLaag);
  const lager = markthuur <= max;
  return {
    bedrag: Math.min(markthuur, max),
    grond: lager ? "markthuur" : "maximale_huur",
    reden:
      (c.grensgeval
        ? `Grensgeval: naar verwachting ${c.puntenLaag}–${c.puntenHoog} punten, zowel onder als boven ${grens}. Een volledige telling is nodig. Tot die tijd geldt voorzichtig de maximale huur bij ${c.puntenLaag} punten (${eurTekst(max)}). `
        : `Naar verwachting ${c.puntenLaag}–${c.puntenHoog} punten: onder ${grens} punten geldt een wettelijke maximale huur (${eurTekst(max)}–${eurTekst(Math.floor(c.maxHuurHoog))}; we gaan uit van de laagste). `) +
      (lager
        ? `De markthuur (${eurTekst(markthuur)}) ligt daaronder, dus het advies is de markthuur.`
        : `De markthuur (${eurTekst(markthuur)}) ligt hoger, dus het advies is de wettelijke maximale huur.`),
    volledigeTellingNodig: c.grensgeval,
  };
}
