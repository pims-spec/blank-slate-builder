// Maatregelen voor het verbeteradvies — regel voor regel overgezet uit MAATREGELEN,
// energieVanOmschrijving() en volgendeLabelVoorIndexOfBouwjaar() in wws-site.html.
// Omschrijvingen en toelichtingen zijn identiek, zodat advies.vergelijk.test.ts de
// uitkomst exact kan vergelijken met de bron.

import { fmt, INDEX_KLASSEN, LABELS, num, overigType, r2, vertrekType } from "../basis";
import { calc, type SanAgg } from "../calc";
import type { Normen } from "../normen";
import type { Energie, EnergieAdviesMaatregel, Labelklasse, WwsInput } from "../types";
import type {
  AdviesBron,
  Haalbaarheid,
  Kosten,
  KostenKey,
  MaatregelKey,
  Toepassing,
} from "./types";

/** Wat een maatregel nodig heeft naast de invoer (in de bron: globals en velden op x) */
export interface GenContext {
  K: Kosten;
  N: Normen;
  /** Sanitair-totalen van de huidige invoer (x.san, door normalizeInput() gezet) */
  san: SanAgg;
  /** Label waarmee het advies begon (x._origLabel in de bron) */
  origLabel: string | undefined;
  /** yyyy-mm-dd, datum van een nieuw op te nemen label */
  vandaag: string;
  /**
   * Eenvoudsniveau van een extra voorziening ("sanExtra.kastje"); niet gezet in de brongetrouwe
   * modus, dan geldt h van de maatregel (zoals de bron).
   */
  niveau?: ((sleutel: string) => Haalbaarheid | undefined) | undefined;
  /** Niet brongetrouw: beginpunt en gekozen optie uit het geüploade energieadvies */
  start?: AdviesStart | undefined;
}

/**
 * Beginpunt van de labelmaatregel (bewuste afwijking, zie energieAdvies.ts). Geldt alleen zolang
 * het energielabel van de invoer nog dat van de huidige situatie is.
 */
export interface AdviesStart {
  energie: Energie;
  /** Beginlabel: het advieslabel na bevestiging, anders het geregistreerde (null: geen label) */
  label: string | null;
  bron: "advies" | "registratie";
  /** De gekozen optie uit het advies: dan is dat de enige labelmaatregel */
  gekozen: EnergieAdviesMaatregel | null;
}

const lIdx = (l: string) => (LABELS as readonly string[]).indexOf(l);

/** Eindlabel zetten; zonder label (index of bouwjaar) wordt het een nieuw label (NTA 8800) */
function zetLabel(y: WwsInput, naar: string, vandaag: string) {
  if (y.energie.soort === "label" || y.energie.soort === "labelOud")
    y.energie.label = naar as Labelklasse;
  else
    y.energie = {
      soort: "label",
      label: naar as Labelklasse,
      indexKlasse: "",
      bouwjaar: "",
      datum: vandaag,
    };
}

/** Een optie uit het advies als labelmaatregel, gerekend vanaf het beginlabel */
function adviesOptie(
  m: EnergieAdviesMaatregel,
  x: WwsInput,
  start: AdviesStart,
  K: Kosten,
  vandaag: string,
): GenKandidaat {
  const st = start.label ? lIdx(start.label) - lIdx(m.naarLabel) : null;
  const kost = (num(m.kostenMin) + num(m.kostenMax)) / 2 || K.labelStap * Math.max(1, st ?? 1);
  return {
    o: start.label
      ? "Energielabel " +
        start.label +
        (start.bron === "advies" ? " (volgens energieadvies)" : "") +
        " naar " +
        m.naarLabel +
        (st != null && st > 1 ? " (" + st + " stappen)" : "")
      : "Nieuw energielabel (vanaf 2021, NTA 8800) laten opnemen: " +
        energieVanOmschrijving(x.energie) +
        " naar klasse " +
        m.naarLabel,
    c: kost,
    h: st != null && st >= 3 ? "lastig" : "gemiddeld",
    hr: (m.omschrijving || []).join("; ") || "Volgens geüpload verduurzamingsadvies",
    a: (y) => zetLabel(y, m.naarLabel, vandaag),
    bron: "advies",
    omschrijving: m.omschrijving || [],
    kostenMin: num(m.kostenMin),
    kostenMax: num(m.kostenMax),
    besparingMin: num(m.besparingMin),
    besparingMax: num(m.besparingMax),
  };
}

/**
 * Labelmaatregelen vanaf een beginpunt uit het energieadvies (niet brongetrouw): de gekozen optie
 * alleen, of — met het bevestigde advieslabel als begin — de opties uit het advies plus de
 * standaardstappen vanaf dat label. null: geen bijzonder beginpunt, gewoon zoals de bron.
 */
function labelVanafStart(x: WwsInput, ctx: GenContext): GenKandidaat[] | null {
  const st = ctx.start;
  if (!st) return null;
  // ook ongewijzigd na "energielabel afmelden" (advies.ts): dan staat het advieslabel er al
  const ongewijzigd =
    (x.energie.soort === st.energie.soort && x.energie.label === st.energie.label) ||
    (st.bron === "advies" && x.energie.soort === "label" && x.energie.label === st.label);
  if (st.gekozen) return ongewijzigd ? [adviesOptie(st.gekozen, x, st, ctx.K, ctx.vandaag)] : [];
  if (!ongewijzigd || st.bron !== "advies" || !st.label) return null;
  const lab = st.label;
  const i = lIdx(lab);
  if (i <= 0) return [];
  const out: GenKandidaat[] = [];
  const doelen = new Set<number>();
  for (const m of x.energieAdvies?.maatregelen ?? []) {
    const j = lIdx(m.naarLabel);
    if (m.vanLabel !== lab || j < 0 || j >= i) continue;
    doelen.add(j);
    out.push(adviesOptie(m, x, st, ctx.K, ctx.vandaag));
  }
  for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
    if (doelen.has(j)) continue;
    const to = LABELS[j]!,
      stappen = i - j;
    out.push({
      o:
        "Energielabel " +
        lab +
        " (volgens energieadvies) naar " +
        to +
        (stappen > 1 ? " (" + stappen + " stappen)" : ""),
      c: ctx.K.labelStap * stappen,
      h: stappen >= 3 ? "lastig" : "gemiddeld",
      hr:
        stappen >= 3
          ? "Grote renovatie: gevel, dak en installatie"
          : "Isolatie, glas of installatie; nieuw label laten opnemen",
      a: (y) => zetLabel(y, to, ctx.vandaag),
    });
  }
  return out;
}

export interface GenKandidaat extends AdviesBron {
  o: string;
  c: number;
  h?: Haalbaarheid | undefined;
  hr?: string;
  nominal?: number;
  a: Toepassing;
}

export interface Maatregel {
  key: MaatregelKey;
  h: Haalbaarheid;
  hr: string;
  naam: string;
  kost: KostenKey;
  gen: (x: WwsInput, ctx: GenContext) => GenKandidaat[];
}

/** "C", "energie-index …" of "bouwjaar …" — energieVanOmschrijving() */
export function energieVanOmschrijving(e: Energie): string {
  if (e.soort === "label" || e.soort === "labelOud") return e.label;
  if (e.soort === "index")
    return "energie-index " + (INDEX_KLASSEN[Number(e.indexKlasse)] || "onbekend");
  return "bouwjaar " + (e.bouwjaar || "onbekend");
}

/** Eerste labelklasse die meer punten geeft dan de huidige index-/bouwjaarscore. */
export function volgendeLabelVoorIndexOfBouwjaar(x: WwsInput, N: Normen): Labelklasse | null {
  const eg = x.woningtype === "eengezins" ? 0 : 1;
  const r4 = calc(x, N).rows.find((r) => r.nr === 4);
  const curP4 = r4 ? r4.p : -Infinity;
  const pt = (l: string) => (N.energie[l] || [0, 0])[eg]!;
  const beter = LABELS.filter((l) => pt(l) > curP4).sort((a, b) => pt(a) - pt(b));
  return beter.length ? beter[0]! : null;
}

const typeL = (groep: "vertrekken" | "overig", t: string) =>
  (groep === "vertrekken" ? vertrekType(t) : overigType(t)).l;

export const MAATREGELEN: readonly Maatregel[] = [
  {
    key: "label",
    h: "gemiddeld",
    hr: "Isolatie, glas of installatie; nieuw label laten opnemen",
    naam: "Energielabel verbeteren (per labelstap)",
    kost: "labelStap",
    gen(x, ctx) {
      const { K, N, origLabel, vandaag } = ctx;
      const vanafStart = labelVanafStart(x, ctx);
      if (vanafStart) return vanafStart;
      // Geen energielabel (index of bouwjaar): één standaardstap, de eerstvolgende labelklasse
      // die boven de huidige score zit (zie de toelichting in wws-site.html).
      if (x.energie.soort === "index" || x.energie.soort === "bouwjaar") {
        const target = volgendeLabelVoorIndexOfBouwjaar(x, N);
        if (!target) return [];
        return [
          {
            o:
              "Nieuw energielabel (vanaf 2021, NTA 8800) laten opnemen: " +
              energieVanOmschrijving(x.energie) +
              " naar klasse " +
              target,
            c: K.labelStap,
            h: "gemiddeld",
            hr: "Energieprestatie laten opnemen via een erkende EP-adviseur (NTA 8800)",
            a: (y) => {
              y.energie = {
                soort: "label",
                label: target,
                indexKlasse: "",
                bouwjaar: "",
                datum: vandaag,
              };
            },
          },
        ];
      }
      if (x.energie.soort !== "label" && x.energie.soort !== "labelOud") return [];
      const lab = x.energie.label;
      const idx = (l: string) => (LABELS as readonly string[]).indexOf(l);
      const i = idx(lab);
      if (i <= 0) return [];
      const out: GenKandidaat[] = [];
      const EA = x.energieAdvies;
      const advTargets = new Set<number>();
      if (EA && Array.isArray(EA.maatregelen)) {
        EA.maatregelen
          .filter((m) => m.vanLabel === lab && idx(m.naarLabel) < i && idx(m.naarLabel) >= 0)
          .forEach((m) => {
            const j = idx(m.naarLabel);
            advTargets.add(j);
            const st = i - j;
            const kost = (num(m.kostenMin) + num(m.kostenMax)) / 2 || K.labelStap * st;
            out.push({
              o:
                "Energielabel " +
                lab +
                " naar " +
                m.naarLabel +
                (st > 1 ? " (" + st + " stappen)" : ""),
              c: kost,
              h: st >= 3 ? "lastig" : "gemiddeld",
              hr: (m.omschrijving || []).join("; ") || "Volgens geüpload verduurzamingsadvies",
              a: (y) => {
                y.energie.label = m.naarLabel as Labelklasse;
              },
              bron: "advies",
              omschrijving: m.omschrijving || [],
              kostenMin: num(m.kostenMin),
              kostenMax: num(m.kostenMax),
              besparingMin: num(m.besparingMin),
              besparingMax: num(m.besparingMax),
            });
          });
      }
      for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
        if (advTargets.has(j)) continue;
        const to = LABELS[j]!,
          st = i - j;
        const orig = origLabel || lab;
        const tot = idx(orig) - idx(to);
        out.push({
          o: "Energielabel " + lab + " naar " + to + (st > 1 ? " (" + st + " stappen)" : ""),
          c: K.labelStap * st,
          h: tot >= 3 ? "lastig" : "gemiddeld",
          hr:
            tot >= 3
              ? "Grote renovatie: gevel, dak en installatie"
              : "Isolatie, glas of installatie; nieuw label laten opnemen",
          a: (y) => {
            y.energie.label = to;
          },
        });
      }
      return out;
    },
  },
  {
    key: "indexKlasse",
    h: "gemiddeld",
    hr: "Isolatie, glas of installatie; nieuwe energie-index laten vaststellen",
    naam: "Energie-index verbeteren (per klasse)",
    kost: "labelStap",
    // Sinds 2021 wordt er geen energie-index meer afgegeven: geen kandidaten (zie de bron).
    gen: () => [],
  },
  {
    // Een piepklein vertrek (< 2 m²) wordt niet voorgesteld om te verwarmen.
    key: "verwVertrek",
    h: "gemiddeld",
    hr: "Radiator of vloerverwarming aanleggen",
    naam: "Vertrek verwarmen",
    kost: "verwVertrek",
    gen(x, { K }) {
      const i = x.vertrekken.findIndex((r) => !r.verwarmd && num(r.m2) >= 2);
      if (i < 0) return [];
      const r = x.vertrekken[i]!;
      return [
        {
          o: "Verwarming in " + (r.naam || typeL("vertrekken", r.type).toLowerCase()),
          c: K.verwVertrek,
          a: (y) => {
            y.vertrekken[i]!.verwarmd = true;
          },
        },
      ];
    },
  },
  {
    key: "koeling",
    h: "gemiddeld",
    hr: "Warmtepomp of vaste airco met A+-label",
    naam: "Verkoeling toevoegen (per vertrek)",
    kost: "koeling",
    gen(x, { K, N }) {
      const n = x.vertrekken.filter((r) => r.verwarmd && r.verkoeld).length;
      if (n * N.verkoelVertrek >= N.verkoelMax) return [];
      const i = x.vertrekken.findIndex((r) => r.verwarmd && !r.verkoeld);
      if (i < 0) return [];
      const r = x.vertrekken[i]!;
      return [
        {
          o: "Verkoeling in " + (r.naam || typeL("vertrekken", r.type).toLowerCase()),
          c: K.koeling,
          a: (y) => {
            y.vertrekken[i]!.verkoeld = true;
          },
        },
      ];
    },
  },
  {
    key: "verwOverig",
    h: "eenvoudig",
    hr: "Radiator bijplaatsen",
    naam: "Overige of verkeersruimte verwarmen",
    kost: "verwOverig",
    gen(x, { K, N }) {
      const n = x.overig.filter((r) => r.verwarmd).length;
      if (n * N.verwOverig >= N.verwOverigMax) return [];
      const i = x.overig.findIndex((r) => !r.verwarmd);
      if (i < 0) return [];
      const r = x.overig[i]!;
      return [
        {
          o: "Verwarming in " + (r.naam || typeL("overig", r.type).toLowerCase()),
          c: K.verwOverig,
          a: (y) => {
            y.overig[i]!.verwarmd = true;
          },
        },
      ];
    },
  },
  {
    key: "aanrecht",
    h: "gemiddeld",
    hr: "Vraagt ruimte in de keuken",
    naam: "Aanrecht langer dan 2 meter",
    kost: "aanrecht",
    gen(x, { K }) {
      const i = x.vertrekken.findIndex(
        (r) => r.fac && r.fac.kind === "keuken" && r.fac.keuken.lengte !== ">=2",
      );
      if (i < 0) return [];
      return [
        {
          o:
            "Aanrecht verlengen tot meer dan 2 meter (" +
            typeL("vertrekken", x.vertrekken[i]!.type).toLowerCase() +
            ")",
          c: K.aanrecht,
          a: (y) => {
            const f = y.vertrekken[i]!.fac;
            if (f?.kind !== "keuken") throw new Error("geen keuken");
            f.keuken.lengte = ">=2";
          },
        },
      ];
    },
  },
  {
    key: "keukenExtra",
    h: "eenvoudig",
    hr: "Inbouwapparatuur of kraan plaatsen",
    naam: "Extra keukenvoorzieningen (kosten per punt)",
    kost: "keukenPunt",
    gen(x, { K, N, niveau }) {
      const i = x.vertrekken.findIndex(
        (r) => r.fac && r.fac.kind === "keuken" && r.fac.keuken.lengte !== "<1",
      );
      if (i < 0) return [];
      const f = x.vertrekken[i]!.fac;
      if (f?.kind !== "keuken") return [];
      const v = f.keuken.voorz as Record<string, unknown>;
      const hasG = (g: string) => (N.voorzKeuken || []).some((z) => z.g === g && num(v[z.k]));
      return (N.voorzKeuken || [])
        .filter((it) => (it.n ? num(v[it.k]) < 4 : !num(v[it.k]) && !(it.g && hasG(it.g))))
        .map((it) => ({
          o: it.l + " (keuken)",
          c: K.keukenPunt * it.p,
          h: niveau?.("keukenExtra." + it.k),
          nominal: it.p,
          a: (y) => {
            const fy = y.vertrekken[i]!.fac;
            if (fy?.kind !== "keuken") throw new Error("geen keuken");
            const vv = fy.keuken.voorz as Record<string, unknown>;
            vv[it.k] = it.n ? num(vv[it.k]) + 1 : true;
          },
        }));
    },
  },
  {
    key: "bad",
    h: "lastig",
    hr: "Vraagt ruimte voor een bad in de badkamer",
    naam: "Douche vervangen door bad met douche",
    kost: "bad",
    gen(x, { K }) {
      const i = x.vertrekken.findIndex(
        (r) => r.fac && r.fac.kind === "badkamer" && num(r.fac.san.douche) > 0,
      );
      if (i < 0) return [];
      return [
        {
          o: "Douche vervangen door bad met douche",
          c: K.bad,
          a: (y) => {
            const f = y.vertrekken[i]!.fac;
            if (f?.kind !== "badkamer") throw new Error("geen badkamer");
            const b = f.san;
            b.douche = num(b.douche) - 1;
            b.badDouche = num(b.badDouche) + 1;
          },
        },
      ];
    },
  },
  {
    key: "toiletHang",
    h: "gemiddeld",
    hr: "Voorzetwand met inbouwreservoir",
    naam: "Staand toilet vervangen door hangend toilet",
    kost: "toiletHang",
    gen(x, { K }) {
      const out: GenKandidaat[] = [];
      x.overig.forEach((r, i) => {
        if (r.fac && r.fac.kind === "toilet" && r.fac.toilet.toilet === "staand")
          out.push({
            o: "Hangend toilet in toiletruimte",
            c: K.toiletHang,
            a: (y) => {
              const f = y.overig[i]!.fac;
              if (f?.kind !== "toilet") throw new Error("geen toilet");
              f.toilet.toilet = "hangend";
            },
          });
      });
      x.vertrekken.forEach((r, i) => {
        if (r.fac && r.fac.kind === "badkamer" && num(r.fac.san.toiletStaand) > 0)
          out.push({
            o: "Hangend toilet in badkamer",
            c: K.toiletHang,
            a: (y) => {
              const f = y.vertrekken[i]!.fac;
              if (f?.kind !== "badkamer") throw new Error("geen badkamer");
              const b = f.san;
              b.toiletStaand = num(b.toiletStaand) - 1;
              b.toiletHang = num(b.toiletHang) + 1;
            },
          });
      });
      return out.slice(0, 2);
    },
  },
  {
    key: "toilet",
    h: "lastig",
    hr: "Nieuwe toiletruimte kost woonoppervlak en vraagt leidingwerk",
    naam: "Extra toilet (tot 2 in totaal)",
    kost: "toilet",
    gen(x, { K, san: S }) {
      if (
        num(S.toiletStaandApart) +
          num(S.toiletStaandBad) +
          num(S.toiletHangApart) +
          num(S.toiletHangBad) >=
        2
      )
        return [];
      const i = x.overig.findIndex(
        (r) => r.fac && r.fac.kind === "toilet" && r.fac.toilet.toilet === "geen",
      );
      return [
        {
          o:
            i >= 0
              ? "Hangend toilet plaatsen in toiletruimte"
              : "Extra toiletruimte met hangend toilet (1,2 m² van het grootste vertrek)",
          h: i >= 0 ? "gemiddeld" : "lastig",
          c: K.toilet,
          a: (y) => {
            if (i >= 0) {
              const f = y.overig[i]!.fac;
              if (f?.kind !== "toilet") throw new Error("geen toilet");
              f.toilet.toilet = "hangend";
            } else {
              y.overig.push({
                type: "toilet",
                naam: "",
                m2: "1,2",
                maten: [{ l: "1,20", b: "1,00" }],
                verwarmd: false,
                fac: { kind: "toilet", toilet: { toilet: "hangend", fontein: false } },
              });
              // de ruimte gaat af van het grootste vertrek
              let bi = -1,
                bm = 0;
              y.vertrekken.forEach((r, n) => {
                const m = num(r.m2);
                if (m > bm) {
                  bm = m;
                  bi = n;
                }
              });
              if (bi >= 0) {
                const r = y.vertrekken[bi]!;
                if (r.maten && r.maten.some((mm) => num(mm.l) && num(mm.b))) {
                  r.maten.push({ l: "-1,20", b: "1,00" });
                }
                r.m2 = String(r2(Math.max(0, bm - 1.2))).replace(".", ",");
              }
            }
          },
        },
      ];
    },
  },
  {
    key: "wastafel",
    h: "gemiddeld",
    hr: "Water- en rioolaansluiting in het toilet",
    naam: "Fontein in de toiletruimte",
    kost: "wastafel",
    gen(x, { K }) {
      const i = x.overig.findIndex(
        (r) => r.fac && r.fac.kind === "toilet" && !r.fac.toilet.fontein,
      );
      if (i < 0) return [];
      return [
        {
          o: "Fontein in de toiletruimte",
          c: K.wastafel,
          a: (y) => {
            const f = y.overig[i]!.fac;
            if (f?.kind !== "toilet") throw new Error("geen toilet");
            f.toilet.fontein = true;
          },
        },
      ];
    },
  },
  {
    key: "sanExtra",
    h: "eenvoudig",
    hr: "Accessoires en kranen in de badkamer",
    naam: "Extra sanitaire voorzieningen (kosten per punt)",
    kost: "sanPunt",
    gen(x, { K, N, niveau }) {
      const i = x.vertrekken.findIndex(
        (r) => r.fac && r.fac.kind === "badkamer" && r.fac.san.eisenOk,
      );
      if (i < 0) return [];
      const f = x.vertrekken[i]!.fac;
      if (f?.kind !== "badkamer") return [];
      const b = f.san;
      const v = (b.voorz || {}) as Record<string, unknown>;
      const hasBad = num(b.bad) + num(b.badDouche) > 0,
        hasD = num(b.douche) + num(b.badDouche) > 0;
      const nW = num(b.wastafel) + num(b.meerpers);
      const nDB = num(b.douche) + num(b.bad) + num(b.badDouche);
      const lim: Record<string, number> = {
        handdoekrad: 2,
        kastje: Math.max(1, nW),
        stopcontact: 2 * nW,
        kraan_een: nW,
        kraan_thermo: nDB,
      };
      return (N.voorzSan || [])
        .filter((it) => {
          if (it.need === "bad" && !hasBad) return false;
          if (it.need === "douche" && !hasD) return false;
          return it.n ? num(v[it.k]) < (lim[it.k] || 1) : !num(v[it.k]);
        })
        .map((it) => ({
          o: it.l,
          c: K.sanPunt * it.p,
          h: niveau?.("sanExtra." + it.k),
          nominal: it.p,
          a: (y) => {
            const fy = y.vertrekken[i]!.fac;
            if (fy?.kind !== "badkamer") throw new Error("geen badkamer");
            const vv = fy.san.voorz as Record<string, unknown>;
            vv[it.k] = it.n ? num(vv[it.k]) + 1 : true;
          },
        }));
    },
  },
  {
    key: "balkon",
    h: "lastig",
    hr: "Constructief, vaak vergunning of VvE-besluit nodig",
    naam: "Buitenruimte toevoegen (balkon)",
    kost: "balkon",
    gen(x, { K }) {
      if ((x.buiten.ruimten || []).some((r) => r.soort !== "fransbalkon" && num(r.m2) > 0))
        return [];
      return [
        {
          o: "Balkon van " + fmt(K.balkonM2) + " m² toevoegen",
          c: K.balkon,
          a: (y) => {
            y.buiten.ruimten = y.buiten.ruimten || [];
            y.buiten.ruimten.push({
              soort: "balkon",
              groep: "priv",
              m2: String(K.balkonM2),
              maten: [],
            });
          },
        },
      ];
    },
  },
  {
    key: "aanbel",
    h: "eenvoudig",
    hr: "Video-intercom plaatsen",
    naam: "Aanbelfunctie met video en audio",
    kost: "aanbel",
    gen(x, { K }) {
      if (x.bijz.aanbel) return [];
      return [
        {
          o: "Aanbelfunctie met video en audio",
          c: K.aanbel,
          a: (y) => {
            y.bijz.aanbel = true;
          },
        },
      ];
    },
  },
  {
    key: "laadpaal",
    h: "gemiddeld",
    hr: "Alleen bij eigen parkeerplek; aansluiting nodig",
    naam: "Privé laadpaal",
    kost: "laadpaal",
    gen(x, { K }) {
      if (num(x.bijz.laadpalen) >= 1) return [];
      return [
        {
          o: "Privé laadpaal",
          c: K.laadpaal,
          a: (y) => {
            y.bijz.laadpalen = num(y.bijz.laadpalen) + 1;
          },
        },
      ];
    },
  },
];
