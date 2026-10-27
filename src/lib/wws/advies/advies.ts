// Verbeteradvies — regel voor regel overgezet uit candidates(), runAdvies(),
// selectieResultaat() en berekenRouteVoorDoel() in wws-site.html.
//
// Verschillen met de bron (bewust, zonder ander resultaat):
// - geen globale state: invoer, normen en instellingen gaan erin, de uitkomst komt eruit;
// - de invoer wordt nooit gewijzigd. De bron werkt op normalizeInput(clone(...)) en leest
//   daarna bijwerkingen daarvan (x.san, fac per ruimte, energie, opslag.monument); hier werkt
//   elke stap op normaliseer(...) en komt x.san uit deriveFac();
// - x._origLabel is een parameter in plaats van een veld op de invoer;
// - "vandaag" (datum van een nieuw label) is een optie, default: nu.
// advies.vergelijk.test.ts vergelijkt de uitkomst met de originele code.

import { INDEX_KLASSEN, LABELS, num, r2 } from "../basis";
import { calc, deriveFac, normaliseer } from "../calc";
import { AFMELD_KOSTEN_STANDAARD, DEFAULT_NORMEN, type Normen } from "../normen";
import type { Labelklasse, WwsInput } from "../types";
import { beginlabel, gekozenOptie } from "./energieAdvies";
import {
  energieVanOmschrijving,
  MAATREGELEN,
  volgendeLabelVoorIndexOfBouwjaar,
  type AdviesStart,
} from "./maatregelen";
import { niveauVan } from "./niveaus";
import type {
  AdviesBron,
  AdviesInstellingen,
  AdviesResultaat,
  AdviesStap,
  Haalbaarheid,
  Kandidaat,
  Kosten,
  MaatregelKey,
  RouteResultaat,
  SelectieResultaat,
  Toepassing,
} from "./types";

export const H_FACTOR: Record<Haalbaarheid, number> = { eenvoudig: 1, gemiddeld: 1.3, lastig: 2.5 };
const RANK: Record<Haalbaarheid, number> = { eenvoudig: 0, gemiddeld: 1, lastig: 2 };

const labelIndex = (l: string) => (LABELS as readonly string[]).indexOf(l);

/** Standaardinstellingen, zoals openAdvies(): kosten uit de normen, laadpaal uit. */
export function standaardInstellingen(N: Normen): AdviesInstellingen {
  return {
    kosten: {
      afmelden: AFMELD_KOSTEN_STANDAARD,
      ...(DEFAULT_NORMEN.kosten as unknown as Omit<Kosten, "afmelden">),
      ...(N.kosten as Partial<Kosten>),
    },
    uit: { laadpaal: true },
    marge: 0,
    labelsprong: false,
    lastig: false,
    forced: [],
  };
}

export interface AdviesOpties {
  /** yyyy-mm-dd voor een nieuw op te nemen label; default: vandaag */
  vandaag?: string;
  /**
   * Precies als de bron (voor de vergelijkingstests): kosten per punt gewogen met de
   * haalbaarheid, zonder eenvoudsniveau per voorziening. Standaard: eenvoudigste eerst.
   */
  brongetrouw?: boolean;
  /**
   * Labelstappen tellen nooit als lastig (ook niet bij 3 of meer stappen), zoals de
   * GoHome-adviesrapporten. De route in het adviesvenster (berekenAdvies) doet dit altijd; voor
   * berekenRoute geeft opties.ts het mee.
   */
  labelNietLastig?: boolean;
}

const vandaagVan = (o: AdviesOpties) => o.vandaag ?? new Date().toISOString().slice(0, 10);

/** safeApply(): maatregel toepassen; een fout laat de invoer ongewijzigd. Geeft genormaliseerde invoer terug. */
function pasToe(f: Toepassing, x: WwsInput): WwsInput {
  const y = structuredClone(x);
  try {
    f(y);
    return normaliseer(y);
  } catch {
    // zoals safeApply(): de bron vangt de fout af; wat vóór de fout al gewijzigd was blijft
    return normaliseer(y);
  }
}

/**
 * Alle maatregelen die vanuit x punten opleveren. Brongetrouw: goedkoopst (per punt, gewogen met
 * de haalbaarheid) eerst. Anders (bewuste afwijking): eerst de eenvoudigste, daarbinnen goedkoopst
 * per punt; een lastigere maatregel komt pas als er geen eenvoudigere meer is.
 */
export function kandidaten(
  x0: WwsInput,
  N: Normen,
  inst: Pick<AdviesInstellingen, "kosten" | "uit" | "lastig">,
  alles: boolean,
  origLabel: string | undefined,
  vandaag: string,
  brongetrouw = false,
  /** Niet brongetrouw: beginpunt en gekozen optie uit het energieadvies (adviesStart()) */
  start?: AdviesStart,
  /** Labelstappen niet als lastig overslaan (AdviesOpties.labelNietLastig) */
  labelNietLastig = false,
): Kandidaat[] {
  const x = normaliseer(x0);
  const base = calc(x, N).exact;
  const ctx = {
    K: inst.kosten,
    N,
    san: deriveFac(x).san,
    origLabel,
    vandaag,
    niveau: brongetrouw ? undefined : (k: string) => niveauVan(N, k),
    start: brongetrouw ? undefined : start,
  };
  const out: Kandidaat[] = [];
  for (const m of MAATREGELEN) {
    if (inst.uit[m.key]) continue;
    const mh = brongetrouw ? m.h : (niveauVan(N, m.key) ?? m.h);
    for (const c of m.gen(x, ctx)) {
      const h = c.h || mh || "gemiddeld";
      if (!alles && h === "lastig" && !inst.lastig && !(labelNietLastig && m.key === "label"))
        continue;
      const y = pasToe(c.a, x);
      const g = r2(calc(y, N).exact - base);
      if (g > 0.009)
        out.push({
          key: m.key,
          o: c.o,
          c: c.c,
          g,
          nominal: c.nominal,
          h,
          hr: c.hr || m.hr || "",
          ratio: c.c / g,
          score: (c.c / g) * H_FACTOR[h],
          apply: c.a,
          bron: c.bron,
          omschrijving: c.omschrijving,
          kostenMin: c.kostenMin,
          kostenMax: c.kostenMax,
          besparingMin: c.besparingMin,
          besparingMax: c.besparingMax,
        });
    }
  }
  return brongetrouw
    ? out.sort((a, b) => a.score - b.score)
    : out.sort((a, b) => RANK[a.h] - RANK[b.h] || a.score - b.score);
}

/**
 * Beginpunt van de labelmaatregel uit het energieadvies (bewuste afwijking): het bevestigde
 * advieslabel en/of de gekozen optie. undefined: geen advies, of niets bijzonders (zoals de bron).
 */
export function adviesStart(x: WwsInput): AdviesStart | undefined {
  if (!x.energieAdvies) return undefined;
  const b = beginlabel(x);
  const gekozen = gekozenOptie(x.energieAdvies);
  if (b.bron !== "advies" && !gekozen) return undefined;
  return { energie: structuredClone(x.energie), label: b.label, bron: b.bron, gekozen };
}

/**
 * De stap "energielabel afmelden" naar het advieslabel, als die punten oplevert; anders null
 * (dan geldt de waarschuwing van terugvalBijAfmelden()).
 */
function afmeldStap(
  x: WwsInput,
  N: Normen,
  K: Kosten,
  advieslabel: string,
  vandaag: string,
): Omit<Stap, "tot"> | null {
  const van =
    x.energie.soort === "label" || x.energie.soort === "labelOud"
      ? "label " + x.energie.label
      : energieVanOmschrijving(x.energie);
  const apply: Toepassing = (y) => {
    y.energie = {
      soort: "label",
      label: advieslabel as WwsInput["energie"]["label"],
      indexKlasse: "",
      bouwjaar: "",
      datum: vandaag,
    };
  };
  const g = r2(calc(pasToe(apply, x), N).exact - calc(x, N).exact);
  if (g <= 0.009) return null;
  return {
    key: "afmelden",
    o: "Energielabel afmelden: " + van + " naar label " + advieslabel + " (zonder werkzaamheden)",
    g,
    c: K.afmelden ?? AFMELD_KOSTEN_STANDAARD,
    h: "eenvoudig",
    hr: "Nieuw label laten registreren zoals het energieadvies de huidige situatie beoordeelt",
    apply,
  };
}

/** Losse maatregel in de route, vóór het samenvoegen per soort */
interface Stap extends AdviesBron {
  key: MaatregelKey;
  forced?: true;
  o: string;
  g: number;
  c: number;
  h: Haalbaarheid;
  hr: string;
  tot: number;
  apply: Toepassing;
}

const bronVan = (c: AdviesBron): AdviesBron => ({
  bron: c.bron,
  omschrijving: c.omschrijving,
  kostenMin: c.kostenMin,
  kostenMax: c.kostenMax,
  besparingMin: c.besparingMin,
  besparingMax: c.besparingMax,
});

interface KernOpties {
  doel: number;
  /** berekenRouteVoorDoel: de stappen van optie 1 gaan vast voorop */
  baseOptie?: { stappen: AdviesStap[] } | undefined;
  /** berekenRouteVoorDoel zet g.naarLabel bij de labelstap */
  metNaarLabel: boolean;
  vandaag: string;
  brongetrouw: boolean;
  labelNietLastig?: boolean;
}

/** Het gedeelde deel van runAdvies() en berekenRouteVoorDoel(). */
function routeKern(input: WwsInput, N: Normen, inst: AdviesInstellingen, o: KernOpties) {
  const { doel, baseOptie, vandaag, brongetrouw } = o;
  const K = inst.kosten,
    uit = inst.uit;
  const begin = normaliseer(input);
  let x = begin;
  const aStart = brongetrouw ? undefined : adviesStart(begin);
  // met een bevestigd advieslabel telt de labelafstand vanaf dat label
  const vanAdvies = aStart?.bron === "advies" && !!aStart.label;
  const origLabel = vanAdvies ? aStart.label! : x.energie.label;
  const start = calc(x, N);
  const stappen: Stap[] = [];
  let guard = 0;
  const labelNietLastig = !brongetrouw && !!o.labelNietLastig;
  const eerste = kandidaten(
    begin,
    N,
    inst,
    true,
    undefined,
    vandaag,
    brongetrouw,
    aStart,
    labelNietLastig,
  );

  // Optie 2 bouwt voort op optie 1: die maatregelen gaan eerst en blijven staan.
  if (baseOptie) {
    baseOptie.stappen.forEach((g) =>
      g.applies.forEach((f) => {
        const b = calc(x, N).exact;
        x = pasToe(f, x);
        const R = calc(x, N);
        const n = g.applies.length;
        stappen.push({
          key: g.key,
          forced: true,
          o: g.o,
          g: r2(R.exact - b),
          c: g.c / n,
          h: g.h!,
          hr: g.hr!,
          tot: R.totaal,
          apply: f,
          bron: g.bron,
          omschrijving: g.omschrijving,
          kostenMin: g.kostenMin / n,
          kostenMax: g.kostenMax / n,
          besparingMin: g.besparingMin / n,
          besparingMax: g.besparingMax / n,
        });
      }),
    );
  }
  // Energielabel afmelden (bewuste afwijking): met een bevestigd advieslabel dat punten oplevert,
  // eerst het label laten registreren zoals het advies de huidige situatie beoordeelt, zonder
  // werkzaamheden. Daarna gaan de labelstappen verder vanaf dat label.
  if (!brongetrouw && !baseOptie && vanAdvies && !uit.afmelden && start.totaal < doel) {
    const af = afmeldStap(x, N, K, aStart.label!, vandaag);
    if (af) {
      x = pasToe(af.apply, x);
      stappen.push({ ...af, tot: calc(x, N).totaal });
    }
  }
  // De gekozen optie uit het energieadvies is de labelmaatregel en gaat altijd mee
  const gekozenKandidaat =
    aStart?.gekozen && !baseOptie && !inst.forced.some((f) => f.startsWith("label|"))
      ? eerste.find((z) => z.key === "label")
      : undefined;
  const forcedKeys = gekozenKandidaat
    ? ["label|" + gekozenKandidaat.o, ...inst.forced]
    : inst.forced;
  // Zelf gekozen maatregelen uit "Alle maatregelen" gaan altijd mee
  forcedKeys.forEach((fk) => {
    const c = eerste.find((z) => z.key + "|" + z.o === fk);
    if (!c) return;
    const b = calc(x, N).exact;
    x = pasToe(c.apply, x);
    const R = calc(x, N);
    stappen.push({
      key: c.key,
      forced: true,
      o: c.o,
      g: r2(R.exact - b),
      c: c.c,
      h: c.h,
      hr: c.hr,
      tot: R.totaal,
      apply: c.apply,
      ...bronVan(c),
    });
  });
  // "1 labelsprong": precies één stap verbetering van het energielabel (niet opnieuw bij optie 2)
  if (inst.labelsprong && !baseOptie && aStart?.gekozen) {
    // de gekozen optie uit het energieadvies is al de labelsprong
  } else if (
    inst.labelsprong &&
    !baseOptie &&
    (vanAdvies || x.energie.soort === "label" || x.energie.soort === "labelOud")
  ) {
    const i0 = labelIndex(vanAdvies ? aStart.label! : x.energie.label);
    const naar = (target: Labelklasse): Toepassing =>
      vanAdvies
        ? (y) => {
            if (y.energie.soort === "label" || y.energie.soort === "labelOud")
              y.energie.label = target;
            else
              y.energie = {
                soort: "label",
                label: target,
                indexKlasse: "",
                bouwjaar: "",
                datum: vandaag,
              };
          }
        : (y) => {
            y.energie.label = target;
          };
    // Bewuste afwijking van de bron (die altijd precies één klasse nam): de sprong gaat naar het
    // eerste label dat punten oplevert. Levert de volgende klasse niets op (bijv. B en A tellen
    // even zwaar), dan zou die stap alleen geld kosten.
    let j = i0 - 1;
    if (!brongetrouw && i0 > 0) {
      const b0 = calc(x, N).exact;
      const levertOp = (k: number) => calc(pasToe(naar(LABELS[k]!), x), N).exact - b0 > 0.009;
      while (j >= 0 && !levertOp(j)) j--;
    }
    if (i0 > 0 && j >= 0) {
      const target = LABELS[j]!;
      const st = i0 - j;
      const applyFn = naar(target);
      const b = calc(x, N).exact;
      x = pasToe(applyFn, x);
      const R = calc(x, N);
      stappen.push({
        key: "label",
        forced: true,
        o:
          "Energielabel " +
          LABELS[i0] +
          (vanAdvies ? " (volgens energieadvies)" : "") +
          " naar " +
          target +
          (st > 1 ? " (" + st + " stappen)" : ""),
        g: r2(R.exact - b),
        c: K.labelStap * st,
        h: "gemiddeld",
        hr: "Isolatie, glas of installatie; nieuw label laten opnemen",
        tot: R.totaal,
        apply: applyFn,
      });
    }
  } else if (
    inst.labelsprong &&
    !baseOptie &&
    (x.energie.soort === "index" || x.energie.soort === "bouwjaar")
  ) {
    const target = volgendeLabelVoorIndexOfBouwjaar(x, N);
    if (target) {
      const van = energieVanOmschrijving(x.energie);
      const applyFn: Toepassing = (y) => {
        y.energie = {
          soort: "label",
          label: target,
          indexKlasse: "",
          bouwjaar: "",
          datum: vandaag,
        };
      };
      const b = calc(x, N).exact;
      x = pasToe(applyFn, x);
      const R = calc(x, N);
      stappen.push({
        key: "label",
        forced: true,
        o:
          "Nieuw energielabel (vanaf 2021, NTA 8800) laten opnemen: " +
          van +
          " naar klasse " +
          target,
        g: r2(R.exact - b),
        c: K.labelStap,
        h: "gemiddeld",
        hr: "Energieprestatie laten opnemen via een erkende EP-adviseur (NTA 8800)",
        tot: R.totaal,
        apply: applyFn,
      });
    }
  }

  // Overbodige maatregelen schrappen, duurste eerst (niet brongetrouw: lastigste eerst, dan duurste)
  const schrap = (lijst: Stap[]): Stap[] => {
    const order = lijst
      .map((_st, i) => i)
      .filter((i) => !lijst[i]!.forced)
      .sort((a, b) =>
        brongetrouw
          ? lijst[b]!.c - lijst[a]!.c
          : RANK[lijst[b]!.h] - RANK[lijst[a]!.h] || lijst[b]!.c - lijst[a]!.c,
      );
    const keep = new Set(lijst.map((_st, i) => i));
    for (const i of order) {
      keep.delete(i);
      let y = begin;
      lijst.forEach((st, k) => {
        if (keep.has(k)) y = pasToe(st.apply, y);
      });
      if (calc(y, N).totaal < doel) keep.add(i);
    }
    return lijst.filter((_st, k) => keep.has(k));
  };
  // De kosten zoals de route ze uiteindelijk toont (zie het samenvoegen hieronder): de labelstappen
  // samen kosten de labelafstand vanaf het beginlabel; vanaf index of bouwjaar de losse stappen.
  const vanLabelKern = vanAdvies ? aStart.label! : begin.energie.label;
  const labelBegin =
    vanAdvies || begin.energie.soort === "label" || begin.energie.soort === "labelOud";
  const kostenVan = (lijst: Stap[]) => {
    let y = begin;
    for (const st of lijst) y = pasToe(st.apply, y);
    const label = lijst.filter((st) => st.key === "label");
    const overig = lijst.filter((st) => st.key !== "label").reduce((t, st) => t + st.c, 0);
    if (!label.length) return overig;
    if (labelBegin && !label.some((st) => st.bron === "advies"))
      return (
        overig + Math.max(0, labelIndex(vanLabelKern) - labelIndex(y.energie.label)) * K.labelStap
      );
    return overig + label.reduce((t, st) => t + st.c, 0);
  };
  const stapVan = (z: Kandidaat, y: WwsInput): Stap => ({
    key: z.key,
    o: z.o,
    g: z.g,
    c: z.c,
    h: z.h,
    hr: z.hr,
    tot: calc(pasToe(z.apply, y), N).totaal,
    apply: z.apply,
    ...bronVan(z),
  });

  while (calc(x, N).totaal < doel && guard++ < 40) {
    const c = kandidaten(
      x,
      N,
      inst,
      false,
      origLabel,
      vandaag,
      brongetrouw,
      aStart,
      labelNietLastig,
    );
    if (!c.length) break;
    let best = c[0]!;
    // Het laatste stuk (bewuste afwijking van de bron): haalt de goedkoopste-per-punt het doel, kies
    // dan van de even eenvoudige maatregelen die het doel ook halen degene met de laagste totale
    // routekosten na het schrappen. Bij gelijke kosten blijft de goedkoopste-per-punt.
    if (!brongetrouw && calc(pasToe(best.apply, x), N).totaal >= doel) {
      let beste = kostenVan(schrap([...stappen, stapVan(best, x)]));
      for (const z of c) {
        if (z === best || z.h !== best.h || calc(pasToe(z.apply, x), N).totaal < doel) continue;
        const k = kostenVan(schrap([...stappen, stapVan(z, x)]));
        if (k < beste) {
          beste = k;
          best = z;
        }
      }
    }
    x = pasToe(best.apply, x);
    const R = calc(x, N);
    stappen.push({
      key: best.key,
      o: best.o,
      g: best.g,
      c: best.c,
      h: best.h,
      hr: best.hr,
      tot: R.totaal,
      apply: best.apply,
      ...bronVan(best),
    });
  }
  let route = stappen;
  if (calc(x, N).totaal >= doel) {
    route = schrap(stappen);
    x = begin;
    let prev = calc(x, N).exact;
    for (const st of route) {
      x = pasToe(st.apply, x);
      const R = calc(x, N);
      st.g = r2(R.exact - prev);
      prev = R.exact;
      st.tot = R.totaal;
    }
  }
  // Samenvoegen per soort maatregel
  const groep: AdviesStap[] = [];
  for (const st of route) {
    let g = groep.find((q) => q.key === st.key);
    if (!g) {
      g = {
        key: st.key,
        o: "",
        c: 0,
        g: 0,
        tot: 0,
        applies: [],
        delen: [],
        forced: false,
        omschrijving: [],
        kostenMin: 0,
        kostenMax: 0,
        besparingMin: 0,
        besparingMax: 0,
      };
      groep.push(g);
    }
    if (st.forced) g.forced = true;
    if (!g.h || RANK[st.h] > RANK[g.h]) {
      g.h = st.h;
      g.hr = st.hr;
    }
    g.c += st.c;
    g.applies.push(st.apply);
    if (!g.delen.includes(st.o)) {
      g.delen.push(st.o);
      if (!brongetrouw) (g.delenH ??= []).push(st.h);
    }
    if (st.bron) g.bron = st.bron;
    (st.omschrijving || []).forEach((oms) => {
      if (!g.omschrijving.includes(oms)) g.omschrijving.push(oms);
    });
    g.kostenMin += num(st.kostenMin);
    g.kostenMax += num(st.kostenMax);
    g.besparingMin += num(st.besparingMin);
    g.besparingMax += num(st.besparingMax);
  }
  // met een bevestigd advieslabel: de route begint bij dat label (als een gewoon label)
  const origSoort =
    vanAdvies && begin.energie.soort !== "label" && begin.energie.soort !== "labelOud"
      ? "label"
      : begin.energie.soort;
  const vanLabel = vanAdvies ? aStart.label! : begin.energie.label;
  const vanOmschrijving = energieVanOmschrijving(begin.energie);
  x = begin;
  let prevE = calc(x, N).exact;
  for (const g of groep) {
    g.applies.forEach((f) => {
      x = pasToe(f, x);
    });
    const R = calc(x, N);
    g.g = r2(R.exact - prevE);
    prevE = R.exact;
    g.tot = R.totaal;
    if (g.key === "label") {
      if (o.metNaarLabel) g.naarLabel = x.energie.label;
      if (origSoort === "label" || origSoort === "labelOud") {
        g.o =
          "Energielabel " +
          vanLabel +
          (vanAdvies ? " (volgens energieadvies)" : "") +
          " naar " +
          x.energie.label;
        const d = labelIndex(vanLabel) - labelIndex(x.energie.label);
        g.h = d >= 3 ? "lastig" : "gemiddeld";
        g.hr =
          g.bron === "advies" && g.omschrijving.length
            ? g.omschrijving.join("; ")
            : d >= 3
              ? "Grote renovatie: gevel, dak en installatie"
              : "Isolatie, glas of installatie; nieuw label laten opnemen";
        if (g.bron !== "advies") g.c = Math.max(0, d) * K.labelStap;
      } else {
        // Startpunt was energie-index of bouwjaar: de kosten van de losse stappen laten staan
        // (geen "labelafstand" om op te herberekenen).
        g.o =
          "Nieuw energielabel (vanaf 2021, NTA 8800) laten opnemen: " +
          vanOmschrijving +
          " naar label " +
          x.energie.label;
        g.h = "gemiddeld";
        g.hr = "Energieprestatie laten opnemen via een erkende EP-adviseur (NTA 8800)";
      }
    } else if (g.key === "indexKlasse") {
      // (de maatregel "indexKlasse" levert sinds 2021 geen kandidaten meer; letterlijk overgenomen)
      const vanIndex = Number(begin.energie.indexKlasse);
      g.o =
        "Energie-index " +
        INDEX_KLASSEN[vanIndex] +
        " naar " +
        INDEX_KLASSEN[Number(x.energie.indexKlasse)];
      const d = vanIndex - Number(x.energie.indexKlasse);
      g.h = d >= 3 ? "lastig" : "gemiddeld";
      g.hr =
        d >= 3
          ? "Grote renovatie: gevel, dak en installatie"
          : "Isolatie, glas of installatie; nieuwe energie-index laten vaststellen";
      g.c = Math.max(0, d) * K.labelStap;
    } else g.o = g.delen.join("; ");
  }
  return {
    begin,
    start,
    eerste,
    groep,
    x,
    eind: calc(x, N),
    uit,
    origSoort,
    vanLabel,
    vanOmschrijving,
  };
}

/**
 * Goedkoopste route naar de vrije sector (plus marge) — runAdvies() in wws-site.html.
 * Doel: N.grensMidden + 1 + marge.
 */
export function berekenAdvies(
  input: WwsInput,
  N: Normen,
  inst: AdviesInstellingen,
  opties: AdviesOpties = {},
): AdviesResultaat {
  const vandaag = vandaagVan(opties);
  const doel = N.grensMidden + 1 + (inst.marge || 0);
  const brongetrouw = !!opties.brongetrouw;
  // labelstappen tellen nooit als lastig, net als in de adviesopties (bewuste afwijking van de bron)
  const k = routeKern(input, N, inst, {
    doel,
    metNaarLabel: false,
    vandaag,
    brongetrouw,
    labelNietLastig: true,
  });
  // Absoluut plafond: wat is maximaal haalbaar, ook met de lastige maatregelen?
  let xMax = k.begin;
  let guardMax = 0;
  while (calc(xMax, N).totaal < doel && guardMax++ < 40) {
    const c = kandidaten(
      xMax,
      N,
      inst,
      true,
      undefined,
      vandaag,
      brongetrouw,
      adviesStart(k.begin),
    );
    if (!c.length) break;
    xMax = pasToe(c[0]!.apply, xMax);
  }
  return {
    start: k.start,
    eind: k.eind,
    stappen: k.groep,
    los: k.eerste,
    input: k.x,
    doel,
    gehaald: k.eind.totaal >= doel,
    maxHaalbaar: calc(xMax, N).totaal,
  };
}

/**
 * Route naar een gegeven doel, eventueel voortbouwend op een eerdere route (optie 2 bouwt
 * voort op optie 1) — berekenRouteVoorDoel() in wws-site.html, voor het adviesrapport.
 */
export function berekenRoute(
  input: WwsInput,
  N: Normen,
  inst: AdviesInstellingen,
  doel: number,
  baseOptie?: RouteResultaat,
  opties: AdviesOpties = {},
): RouteResultaat {
  const k = routeKern(input, N, inst, {
    doel,
    baseOptie,
    metNaarLabel: true,
    vandaag: vandaagVan(opties),
    brongetrouw: !!opties.brongetrouw,
    labelNietLastig: !!opties.labelNietLastig,
  });
  return {
    start: k.start,
    eind: k.eind,
    stappen: k.groep,
    doel,
    gehaald: k.eind.totaal >= doel,
    kosten: k.groep.reduce((s, g) => s + g.c, 0),
    input: k.x,
    vanLabel: k.vanLabel,
    vanOmschrijving: k.vanOmschrijving,
    origSoort: k.origSoort,
  };
}

/** De route met alleen de aangevinkte stappen (overslaan[k] = true: stap k niet) — selectieResultaat(). */
export function selectieResultaat(
  input: WwsInput,
  N: Normen,
  advies: Pick<AdviesResultaat, "stappen">,
  overslaan: Readonly<Record<number, boolean>> = {},
): SelectieResultaat {
  let y = normaliseer(input);
  let c = 0,
    n = 0;
  advies.stappen.forEach((g, k) => {
    if (overslaan[k]) return;
    g.applies.forEach((f) => {
      y = pasToe(f, y);
    });
    c += g.c;
    n++;
  });
  return { input: y, R: calc(y, N), kosten: c, n };
}
