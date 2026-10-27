// Willekeurige tellingen voor de vergelijkingstests met wws-site.html
// (calc.vergelijk.test.ts en advies/advies.vergelijk.test.ts). Alleen voor tests.
import {
  BUITEN_SOORTEN,
  OVERIG_TYPES,
  VERTREK_TYPES,
  ensureFac,
  facDefault,
  LABELS,
  num,
  overigType,
} from "./basis";
import type { Fac, OverigeRuimte, Vertrek, WwsInput } from "./types";

// ---------- deterministische willekeur ----------
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genereer(seed: number): WwsInput {
  const R = rng(seed);
  const kies = <T>(a: readonly T[]): T => a[Math.floor(R() * a.length)]!;
  const int = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const kans = (p: number) => R() < p;
  // m² soms als getal, soms als invoer-string met komma, soms leeg
  const m2 = (max: number) => {
    const v = Math.round(R() * max * 100) / 100;
    return kans(0.1) ? "" : kans(0.4) ? String(v).replace(".", ",") : v;
  };
  const cnt = (max: number) => (kans(0.5) ? 0 : int(0, max));

  const vulFac = (f: Fac) => {
    if (f.kind === "keuken") {
      f.keuken.lengte = kies(["<1", "1-2", ">=2"] as const);
      for (const k of [
        "afzuig",
        "kook_ind",
        "kook_kera",
        "kook_gas",
        "koelkast",
        "vriezer",
        "oven",
        "oven_gas",
        "magnetron",
        "vaatwasser",
        "kraan_een",
        "kraan_thermo",
        "kokend",
      ] as const)
        if (kans(0.3)) f.keuken.voorz[k] = true;
      if (kans(0.3)) f.keuken.voorz.kast = String(int(1, 5));
    }
    if (f.kind === "badkamer") {
      const s = f.san;
      s.toiletStaand = cnt(1);
      s.toiletHang = cnt(1);
      s.wastafel = int(0, 2);
      s.meerpers = cnt(1);
      s.douche = cnt(2);
      s.bad = cnt(1);
      s.badDouche = cnt(1);
      s.eisenOk = kans(0.8);
      for (const k of ["bubbel", "afscheiding", "kastruimte"] as const)
        if (kans(0.4)) s.voorz[k] = kans(0.8) ? true : 2;
      for (const k of [
        "handdoekrad",
        "kastje",
        "stopcontact",
        "kraan_een",
        "kraan_thermo",
      ] as const)
        if (kans(0.4)) s.voorz[k] = String(int(1, 6));
    }
    if (f.kind === "slaap_san") {
      f.san.wastafel = cnt(2);
      f.san.meerpers = cnt(1);
      f.san.douche = cnt(1);
      f.san.bad = cnt(1);
      f.san.badDouche = cnt(1);
    }
    if (f.kind === "toilet") {
      f.toilet.toilet = kies(["geen", "staand", "hangend"] as const);
      f.toilet.fontein = kans(0.5);
    }
    if (f.kind === "was") f.was.wastafel = kans(0.5);
  };

  const inp: WwsInput = {
    woningtype: kies(["eengezins", "meergezins"] as const),
    facV: 1,
    vertrekken: Array.from({ length: int(0, 7) }, () => {
      const r: Vertrek = {
        type: kies(VERTREK_TYPES).k,
        naam: kans(0.3) ? "Kamer " + int(1, 9) : "",
        m2: m2(35),
        verwarmd: kans(0.7),
        verkoeld: kans(0.2),
      };
      ensureFac("vertrekken", r, kans(0.5));
      if (r.fac) vulFac(r.fac);
      return r;
    }),
    overig: Array.from({ length: int(0, 6) }, () => {
      const r: OverigeRuimte = {
        type: kies(OVERIG_TYPES).k,
        naam: "",
        m2: m2(15),
        verwarmd: kans(0.3),
      };
      ensureFac("overig", r, kans(0.5));
      if (r.fac) vulFac(r.fac);
      return r;
    }),
    energie: {
      soort: kies(["label", "labelOud", "index", "bouwjaar"] as const),
      label: kans(0.1) ? "" : kies([...LABELS, "EPV"] as const),
      indexKlasse: kans(0.15) ? "" : kans(0.1) ? "EPV" : String(int(0, 8)),
      datum: kans(0.2)
        ? ""
        : `${int(2005, 2026)}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
      bouwjaar: kans(0.15) ? "" : int(1900, 2025),
    },
    handicap: { investering: kans(0.85) ? "" : int(0, 20000) },
    buiten: {
      gemAdressen: kans(0.5) ? 1 : int(0, 40),
      ruimten: Array.from({ length: int(0, 3) }, () => ({
        soort: kies(BUITEN_SOORTEN)[0],
        groep: kans(0.75) ? ("priv" as const) : ("gem" as const),
        m2: m2(60),
      })),
    },
    gem: {
      adressen: int(0, 30),
      vertrekken: Array.from({ length: cnt(2) }, () => ({
        type: kies(VERTREK_TYPES).k,
        m2: m2(40),
      })),
      overig: Array.from({ length: cnt(2) }, () => ({ type: kies(OVERIG_TYPES).k, m2: m2(20) })),
      voorzPunten: kans(0.8) ? "" : String(int(0, 12)),
    },
    parkeer: {
      typeI: cnt(2),
      typeII: cnt(2),
      typeIII: cnt(2),
      adressen: int(0, 20),
      laadpalen: cnt(3),
    },
    woz: {
      soort: kies(["woz", "woz", "taxatie", "minimum"] as const),
      waarde: kans(0.1) ? "" : kans(0.3) ? int(400_000, 2_500_000) : int(90_000, 450_000),
      jaar: kies(["2026", "2025", "2024", "2023", "2022"]),
      nieuwbouw1519: kans(0.2),
      kleinCorop: kans(0.15),
    },
    bijz: { zorgwoning: kans(0.15), aanbel: kans(0.3), laadpalen: cnt(2) },
    opslag: {
      keuze: kies(["geen", "geen", "gemprov", "stads", "rijks_voor", "rijks_na"] as const),
      nieuwbouw: kans(0.2),
    },
  };
  // Bewuste afwijking van de bron: een overige ruimte kleiner dan 2 m² telt in de app niet voor
  // verwarming (verwarmingTelt). Zulke ruimten maakt de generator daarom 2 m², zodat de
  // vergelijkingen met wws-site.html blijven kloppen; calc.test.ts test de afwijking zelf.
  for (const r of inp.overig) {
    const m = num(r.m2);
    if (!overigType(r.type).verkeer && r.type !== "toilet" && m > 0 && m < 2) r.m2 = 2;
  }
  return inp;
}

/**
 * Voor de vergelijkingen met wws-site.html: een ruimte die precies op de lege standaard staat, iets
 * invullen. Bewuste afwijking: in de app telt een lege ruimte als onbewerkt (nieuwe ruimtes
 * beginnen leeg, het PvE moet er dan nog op kunnen); in de bron niet. Muteert en geeft x terug.
 */
export function zonderLegeStandaard<
  T extends { vertrekken: { fac?: Fac }[]; overig: { fac?: Fac }[] },
>(x: T): T {
  for (const r of [...x.vertrekken, ...x.overig]) {
    const f = r.fac;
    if (!f || JSON.stringify(f) !== JSON.stringify(facDefault(f.kind, true))) continue;
    if (f.kind === "keuken") f.keuken.voorz = { afzuig: true };
    else if (f.kind === "badkamer") f.san.bad = 1;
    else if (f.kind === "toilet") f.toilet.fontein = true;
  }
  return x;
}
