// Rekenkern WWS zelfstandige woonruimte — regel voor regel overgezet uit
// calc() / normalizeInput() / deriveFac() / huurVoorPunten() in wws-site.html.
// Toelichtings- en waarschuwingsteksten zijn identiek, zodat de vergelijkingstest
// (calc.vergelijk.test.ts) uitvoer exact kan vergelijken met de bron.
//
// Verschil met de bron: de geldigheid van label/index wordt getoetst tegen
// `opties.peildatum` (default: nu, net als de bron) zodat tests reproduceerbaar zijn.

import {
  ensureFac,
  eur,
  fmt,
  INDEX_KLASSEN,
  indexNaarKlasse,
  m2r,
  num,
  overigType,
  q,
  r2,
  vertrekType,
} from "./basis";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import type { CalcOpties, FacBadkamer, Rij, Segment, WwsInput, WwsResultaat } from "./types";

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

interface KeukenAgg {
  lengte: string;
  voorz: Record<string, unknown>;
  ruimte: string;
}
interface SanAgg {
  toiletStaandApart: number;
  toiletHangApart: number;
  toiletStaandBad: number;
  toiletHangBad: number;
  wastafelBad: number;
  wastafelElders: number;
  meerpersBad: number;
  meerpersElders: number;
  douche: number;
  bad: number;
  badDouche: number;
}

/** Vult ontbrekende velden aan zoals normalizeInput() (zonder de migratie van zeer oude tellingen). */
export function normaliseer(input: WwsInput): WwsInput {
  const inp = clone(input) as WwsInput & { energie: WwsInput["energie"] & { index?: unknown } };
  inp.vertrekken = inp.vertrekken || [];
  inp.overig = inp.overig || [];
  const E = inp.energie;
  if (E) {
    if (
      E.soort === "index" &&
      (E.indexKlasse === undefined || E.indexKlasse === "") &&
      num(E.index) > 0
    )
      E.indexKlasse = indexNaarKlasse(num(E.index));
    if (E.indexKlasse === undefined) E.indexKlasse = "";
  } else {
    inp.energie = { soort: "label", label: "C", indexKlasse: "", datum: "", bouwjaar: "" };
  }
  if (!inp.handicap) inp.handicap = { investering: "" };
  inp.buiten = inp.buiten || ({} as WwsInput["buiten"]);
  if (inp.buiten.gemAdressen === undefined) inp.buiten.gemAdressen = 1;
  if (!Array.isArray(inp.buiten.ruimten)) inp.buiten.ruimten = [];
  inp.buiten.ruimten.forEach((r) => {
    if ((r.soort as string) === "tuin") r.soort = "voorzijtuin";
    if (!r.soort) r.soort = "overig";
    if (r.groep !== "gem") r.groep = "priv";
  });
  inp.gem = inp.gem || ({} as WwsInput["gem"]);
  if (inp.gem.adressen === undefined) inp.gem.adressen = 1;
  if (inp.gem.voorzPunten === undefined) inp.gem.voorzPunten = "";
  if (!Array.isArray(inp.gem.vertrekken)) inp.gem.vertrekken = [];
  if (!Array.isArray(inp.gem.overig)) inp.gem.overig = [];
  if (!inp.parkeer)
    inp.parkeer = { typeI: "", typeII: "", typeIII: "", adressen: 1, laadpalen: "" };
  inp.woz = inp.woz || ({} as WwsInput["woz"]);
  if (!inp.woz.soort) inp.woz.soort = "woz";
  if (!inp.woz.jaar) inp.woz.jaar = "2026";
  if (inp.woz.nieuwbouw1519 === undefined) inp.woz.nieuwbouw1519 = false;
  if (inp.woz.kleinCorop === undefined) inp.woz.kleinCorop = false;
  if (!inp.bijz) inp.bijz = { zorgwoning: false, aanbel: false, laadpalen: "" };
  if (!inp.opslag) inp.opslag = { keuze: "geen", nieuwbouw: false };
  const O = inp.opslag;
  if (O.keuze) {
    O.monument = O.keuze.startsWith("rijks") ? "rijks" : (O.keuze as "geen" | "gemprov" | "stads");
    O.contractVoor2024 = O.keuze === "rijks_voor";
  } else {
    O.keuze =
      O.monument === "rijks"
        ? O.contractVoor2024
          ? "rijks_voor"
          : "rijks_na"
        : O.monument || "geen";
  }
  inp.vertrekken.forEach((r) => ensureFac("vertrekken", r, false));
  inp.overig.forEach((r) => ensureFac("overig", r, false));
  inp.facV = 1;
  return inp;
}

/** Telt de voorzieningen per ruimte op tot keukens + sanitair-totalen (deriveFac). */
function deriveFac(inp: WwsInput): { keukens: KeukenAgg[]; san: SanAgg } {
  const keukens: KeukenAgg[] = [];
  const agg: SanAgg = {
    toiletStaandApart: 0,
    toiletHangApart: 0,
    toiletStaandBad: 0,
    toiletHangBad: 0,
    wastafelBad: 0,
    wastafelElders: 0,
    meerpersBad: 0,
    meerpersElders: 0,
    douche: 0,
    bad: 0,
    badDouche: 0,
  };
  inp.vertrekken.forEach((r) => {
    const f = r.fac;
    if (!f) return;
    if (f.kind === "keuken")
      keukens.push({
        lengte: f.keuken.lengte,
        voorz: f.keuken.voorz || {},
        ruimte: vertrekType(r.type).l,
      });
    if (f.kind === "badkamer") {
      const b = f.san;
      agg.toiletStaandBad += num(b.toiletStaand);
      agg.toiletHangBad += num(b.toiletHang);
      agg.wastafelBad += num(b.wastafel);
      agg.meerpersBad += num(b.meerpers);
      agg.douche += num(b.douche);
      agg.bad += num(b.bad);
      agg.badDouche += num(b.badDouche);
    }
    if (f.kind === "slaap_san") {
      const b = f.san;
      agg.wastafelElders += Math.min(1, num(b.wastafel));
      agg.meerpersElders += Math.min(1, num(b.meerpers));
      agg.douche += num(b.douche);
      agg.bad += num(b.bad);
      agg.badDouche += num(b.badDouche);
    }
  });
  inp.overig.forEach((r) => {
    const f = r.fac;
    if (!f) return;
    if (f.kind === "toilet") {
      if (f.toilet.toilet === "staand") agg.toiletStaandApart++;
      if (f.toilet.toilet === "hangend") agg.toiletHangApart++;
      if (f.toilet.fontein) agg.wastafelElders++;
    }
    if (f.kind === "was" && f.was.wastafel) agg.wastafelElders++;
  });
  return { keukens, san: agg };
}

/** Maximale kale huur bij een puntentotaal (huurVoorPunten) */
export function huurVoorPunten(
  p: number,
  N: Normen = DEFAULT_NORMEN as unknown as Normen,
): number | null {
  const t = String(N.huurTabel || "")
    .split(",")
    .map(Number);
  const s = N.huurTabelStart || 40;
  if (!t.length) return null;
  if (p < s) return t[0]! / 100;
  const i = p - s;
  if (i < t.length) return t[i]! / 100;
  const last = t[t.length - 1]!,
    prev = t[t.length - 2]!;
  return (last + (i - (t.length - 1)) * (last - prev)) / 100;
}

export function calc(
  input: WwsInput,
  N: Normen = DEFAULT_NORMEN as unknown as Normen,
  opties: CalcOpties = {},
): WwsResultaat {
  const inp = normaliseer(input);
  const { keukens, san: S } = deriveFac(inp);
  const nu = opties.peildatum ?? new Date();
  const rows: Rij[] = [];
  const warn: string[] = [];
  const add = (nr: number, naam: string, p: number, t: string) => rows.push({ nr, naam, p, t });

  // Rubriek 1: vertrekken
  inp.vertrekken.forEach((r) => {
    const m = num(r.m2);
    if (m > 0 && m < N.minVertrek)
      warn.push(
        (r.naam || vertrekType(r.type).l) +
          ": een vertrek moet minimaal 4 m² zijn. Voldoet de ruimte daar niet aan, zet hem dan bij de overige ruimten.",
      );
  });
  const oppVraw = inp.vertrekken.reduce((s, r) => s + r2(num(r.m2)), 0);
  const oppV = m2r(oppVraw);
  add(1, "Vertrekken", q(oppV * N.oppVertrek), oppV + " m² × " + fmt(N.oppVertrek));

  // Rubriek 2: overige ruimten
  const ov = inp.overig.map((r) => ({ r, T: overigType(r.type), m: r2(num(r.m2)) }));
  ov.forEach((o) => {
    if (!o.T.verkeer && o.m > 0 && o.m < N.minOverig)
      warn.push(
        (o.r.naam || o.T.l) + " is kleiner dan 2 m² en krijgt geen punten voor de oppervlakte.",
      );
  });
  const telt = ov.filter((o) => !o.T.verkeer && o.m >= N.minOverig);
  const oppO = m2r(telt.reduce((s, o) => s + o.m, 0));
  let p2 = oppO * N.oppOverig;
  let aftrek = 0;
  telt
    .filter((o) => o.T.k === "zolder_notrap")
    .forEach((o) => {
      aftrek += Math.min(N.zolderZonderTrap, o.m * N.oppOverig);
    });
  p2 -= aftrek;
  add(
    2,
    "Overige ruimten",
    q(p2),
    oppO +
      " m² × " +
      fmt(N.oppOverig) +
      (aftrek ? ", aftrek zolder zonder vaste trap " + fmt(aftrek) : ""),
  );

  // Rubriek 3: verwarming en verkoeling
  const vv = inp.vertrekken
    .filter((r) => r.verwarmd)
    .reduce((s, r) => s + (vertrekType(r.type).verwVertrekken || 1), 0);
  const vk = inp.vertrekken.filter((r) => r.verwarmd && r.verkoeld).length;
  const ow = inp.overig.filter((r) => r.verwarmd).length;
  const p3 =
    vv * N.verwVertrek +
    Math.min(ow * N.verwOverig, N.verwOverigMax) +
    Math.min(vk * N.verkoelVertrek, N.verkoelMax);
  add(
    3,
    "Verwarming en verkoeling",
    q(p3),
    vv +
      " verwarmde vertrekken, " +
      ow +
      " verwarmde overige of verkeersruimten" +
      (vk ? ", " + vk + " verkoeld" : ""),
  );

  // Rubriek 4: energieprestatie
  const eg = inp.woningtype === "eengezins" ? 0 : 1;
  const E = inp.energie;
  let p4 = 0,
    t4 = "";
  let soort: string = E.soort,
    note = "";
  const dt = E.datum ? new Date(E.datum) : null;
  const naam = (
    { labelOud: "energielabel", index: "energie-index", label: "energielabel" } as Record<
      string,
      string
    >
  )[soort];
  if (naam && dt && !isNaN(dt.getTime())) {
    const exp = new Date(dt);
    exp.setFullYear(exp.getFullYear() + 10);
    if (exp < nu) {
      note = naam + " vervallen (10 jaar geldig)";
      warn.push(
        "Het " +
          naam +
          " is vervallen, want een registratie is 10 jaar geldig. De punten worden bepaald op basis van het bouwjaar.",
      );
      soort = "bouwjaar";
    } else if (soort === "labelOud" && dt >= new Date("2015-01-01"))
      warn.push(
        "Een ‘Energielabel’ (oud) is geregistreerd vóór 1 januari 2015. Kies bij een latere registratie de energie-index of het energielabel vanaf 2021.",
      );
    else if (soort === "label" && dt < new Date("2021-01-01"))
      warn.push(
        "Een energielabel vanaf 2021 (NTA 8800) is geregistreerd op of na 1 januari 2021. Controleer de registratiedatum.",
      );
    else if (soort === "index" && (dt < new Date("2015-01-01") || dt >= new Date("2021-01-01")))
      warn.push(
        "Een energie-index is geregistreerd van 1 januari 2015 tot 1 januari 2021. Controleer de registratiedatum.",
      );
  } else if (soort === "labelOud") {
    warn.push(
      "Een energielabel van vóór 2015 is 10 jaar geldig en is daardoor inmiddels vervallen. Gebruik ‘Bouwjaar’ tenzij de peildatum vóór het verlopen ligt, of vul de registratiedatum in.",
    );
  }
  if (soort === "label" || soort === "labelOud") {
    if (E.label === "EPV") {
      p4 = N.epv[eg]!;
      t4 = "energieprestatievergoeding";
    } else if (!E.label) {
      warn.push("Kies de labelklasse.");
      t4 = "geen labelklasse gekozen";
    } else {
      const e = N.energie[E.label] || [0, 0];
      p4 = e[eg];
      t4 =
        (soort === "label" ? "energielabel vanaf 2021" : "energielabel (vóór 2015)") +
        ", label " +
        E.label;
    }
  } else if (soort === "index") {
    if (E.indexKlasse === "EPV") {
      p4 = N.epv[eg];
      t4 = "energieprestatievergoeding";
    } else if (E.indexKlasse !== "" && E.indexKlasse != null) {
      const row = N.energieIndex[+E.indexKlasse]!;
      p4 = row[eg + 1]!;
      t4 = "energie-index, " + INDEX_KLASSEN[+E.indexKlasse];
    } else {
      warn.push("Kies de klasse van de energie-index.");
      t4 = "geen index gekozen";
    }
  } else {
    const bj = Math.trunc(num(E.bouwjaar)) || 0;
    const row = N.energieBouwjaar.find((x) => bj >= x[0])!;
    if (bj > 0) {
      p4 = row[eg + 1]!;
      t4 = (note || "geen geldig label") + ", bouwjaar " + bj;
    } else {
      p4 = N.energieBouwjaar[N.energieBouwjaar.length - 1]![eg + 1]!;
      t4 = "geen geldig label, bouwjaar onbekend";
      warn.push(
        "Vul het bouwjaar in; zonder geldig label of index bepaalt het bouwjaar de punten.",
      );
    }
  }
  const isMon = inp.opslag.monument === "rijks" || inp.opslag.monument === "gemprov";
  if (isMon && p4 < 0) {
    p4 = 0;
    t4 += ", monument: geen minpunten";
  }
  add(4, "Energieprestatie", q(p4), t4 + ", " + (eg ? "meergezinswoning" : "eengezinswoning"));

  // Rubriek 5: keuken (per keuken)
  let p5 = 0;
  const t5: string[] = [];
  if (!keukens.length)
    warn.push(
      "Er is geen keuken ingevuld. Kies bij de vertrekken een Keuken of Woonkamer met open keuken.",
    );
  keukens.forEach((k) => {
    const kl = k.lengte;
    const kb = kl === ">=2" ? N.keukenLang : kl === "1-2" ? N.keukenKort : 0;
    let kx = 0;
    (N.voorzKeuken || []).forEach((it) => {
      kx += num(k.voorz[it.k]) * it.p;
    });
    if (kb === 0 && kx > 0)
      warn.push(
        k.ruimte +
          ": een aanrecht korter dan 1 meter voldoet niet aan de basiseisen; de keuken en de extra voorzieningen krijgen geen punten.",
      );
    const kxc = kb ? Math.min(kx, kb) : 0;
    p5 += kb + kxc;
    t5.push(
      (keukens.length > 1 ? k.ruimte + ": " : "") +
        "aanrecht " +
        (
          { "<1": "korter dan 1 m", "1-2": "1 tot 2 m", ">=2": "langer dan 2 m" } as Record<
            string,
            string
          >
        )[kl] +
        (kxc ? ", extra " + fmt(kxc) + (kx > kxc ? " (afgetopt)" : "") : ""),
    );
  });
  add(5, "Keuken", q(p5), t5.join("; ") || "geen keuken");

  // Rubriek 6: sanitair. Aftopping van extra voorzieningen per bad-/doucheruimte (beleidsboek par. 2.6.2).
  const NS = N.san;
  const toiletP =
    S.toiletStaandApart * NS.toiletStaandApart +
    S.toiletStaandBad * NS.toiletStaandBad +
    S.toiletHangApart * NS.toiletHangApart +
    S.toiletHangBad * NS.toiletHangBad;
  const wasP =
    S.wastafelBad * NS.wastafelBad +
    S.wastafelElders * NS.wastafelElders +
    S.meerpersBad * NS.meerpersBad +
    S.meerpersElders * NS.meerpersElders;
  const dbP = S.douche * NS.douche + S.bad * NS.bad + S.badDouche * NS.badDouche;
  let sx = 0,
    sxc = 0,
    extraZonderEisen = false;
  inp.vertrekken.forEach((r) => {
    const f = r.fac;
    if (!f || f.kind !== "badkamer") return;
    const b = (f as FacBadkamer).san,
      v = (b.voorz || {}) as Record<string, unknown>;
    const any = Object.values(v).some((x) => num(x) > 0);
    if (!b.eisenOk) {
      if (any) extraZonderEisen = true;
      return;
    }
    const nWasR = num(b.wastafel) + num(b.meerpers);
    const hasBadR = num(b.bad) + num(b.badDouche) > 0,
      hasDoucheR = num(b.douche) + num(b.badDouche) > 0;
    const dbR = num(b.douche) * NS.douche + num(b.bad) * NS.bad + num(b.badDouche) * NS.badDouche;
    let sxR = 0;
    (N.voorzSan || []).forEach((it) => {
      let c = num(v[it.k]);
      if (it.k === "kastruimte") c = Math.min(c, 1);
      if (!c) return;
      if (it.need === "bad" && !hasBadR) {
        warn.push(it.l + " telt niet: er is in deze ruimte geen bad.");
        return;
      }
      if (it.need === "douche" && !hasDoucheR) {
        warn.push(it.l + " telt niet: er is in deze ruimte geen douche.");
        return;
      }
      if (it.k === "stopcontact" && c > 2 * nWasR) {
        warn.push("Stopcontacten tellen tot maximaal 2 per wastafel.");
        c = 2 * nWasR;
      }
      sxR += c * it.p;
    });
    sx += sxR;
    if (sxR > 0 && dbR === 0) {
      warn.push(
        "Extra sanitaire voorzieningen tellen alleen als er in dezelfde ruimte een douche of bad is.",
      );
      sxR = 0;
    }
    sxc += Math.min(sxR, dbR);
  });
  if (extraZonderEisen)
    warn.push(
      "Een badkamer voldoet niet aan de eisen voor extra voorzieningen; die voorzieningen tellen daarom niet.",
    );
  add(
    6,
    "Sanitair",
    q(toiletP + wasP + dbP + sxc),
    "toiletten " +
      fmt(toiletP) +
      ", wastafels " +
      fmt(wasP) +
      ", douche/bad " +
      fmt(dbP) +
      (sxc ? ", extra " + fmt(sxc) + (sx > sxc ? " (afgetopt)" : "") : ""),
  );

  // Rubriek 7: woonvoorzieningen voor personen met een handicap
  const inv = num(inp.handicap.investering);
  add(
    7,
    "Woonvoorzieningen bij een handicap",
    q(inv / N.handicapPerPunt),
    inv ? eur(inv) + " netto-investering / " + eur(N.handicapPerPunt) : "geen",
  );

  // Rubriek 8: buitenruimten (Frans balkon telt nooit mee)
  const buitenRuimten = inp.buiten.ruimten || [];
  const bp = buitenRuimten
    .filter((r) => r.groep !== "gem" && r.soort !== "fransbalkon")
    .reduce((s, r) => s + num(r.m2), 0);
  const bg = buitenRuimten
    .filter((r) => r.groep === "gem" && r.soort !== "fransbalkon")
    .reduce((s, r) => s + num(r.m2), 0);
  const ba = Math.max(1, num(inp.buiten.gemAdressen) || 1);
  let p8: number, t8: string;
  if (bp <= 0 && bg <= 0) {
    p8 = N.geenBuiten;
    t8 = "geen buitenruimte";
  } else {
    p8 =
      (bp > 0 ? N.buitenAanwezig + r2(bp) * N.buitenPerM2 : 0) +
      (bg > 0 ? (r2(bg) * N.gemBuitenPerM2) / ba : 0);
    if (p8 > N.buitenMax) {
      p8 = N.buitenMax;
      warn.push("Buitenruimten zijn begrensd op " + N.buitenMax + " punten.");
    }
    t8 = [
      bp > 0 ? fmt(bp) + " m² privé" : "",
      bg > 0 ? fmt(bg) + " m² gemeenschappelijk / " + ba + " adressen" : "",
    ]
      .filter(Boolean)
      .join(", ");
  }
  add(8, "Buitenruimten", q(p8), t8);

  // Rubriek 9: gemeenschappelijke ruimten
  const ga = Math.max(1, num(inp.gem.adressen) || 1);
  const gVraw = inp.gem.vertrekken.reduce((s, r) => s + r2(num(r.m2)), 0);
  const gOppV = m2r(gVraw);
  const gOv = inp.gem.overig.map((r) => ({ r, T: overigType(r.type), m: r2(num(r.m2)) }));
  const gTelt = gOv.filter((o) => !o.T.verkeer && o.m >= N.minOverig);
  const gOppO = m2r(gTelt.reduce((s, o) => s + o.m, 0));
  let gP = gOppV * N.oppVertrek + gOppO * N.oppOverig;
  gTelt
    .filter((o) => o.T.k === "zolder_notrap")
    .forEach((o) => {
      gP -= Math.min(N.zolderZonderTrap, o.m * N.oppOverig);
    });
  const p9 = (gP + num(inp.gem.voorzPunten)) / ga;
  add(
    9,
    "Gemeenschappelijke ruimten",
    q(p9),
    p9 ? gOppV + gOppO + " m² gedeeld door " + ga + " adressen" : "geen",
  );

  // Rubriek 10: gemeenschappelijke parkeerruimten
  const P = inp.parkeer,
    pa = Math.max(1, num(P.adressen) || 1);
  const p10 =
    (num(P.typeI) * N.parkeer.I +
      num(P.typeII) * N.parkeer.II +
      num(P.typeIII) * N.parkeer.III +
      num(P.laadpalen) * N.parkeer.laadpaal) /
    pa;
  add(
    10,
    "Gemeenschappelijke parkeerruimten",
    q(p10),
    p10 ? "gedeeld door " + pa + " adressen" : "geen",
  );

  // Rubriek 12 (eerst berekend, nodig voor de nieuwbouwdrempel)
  const p12 = (inp.bijz.aanbel ? N.aanbel : 0) + num(inp.bijz.laadpalen) * N.laadpaal;
  const r1to10 = rows.reduce((s, r) => s + r.p, 0);

  // Rubriek 11: WOZ-waarde
  const W = inp.woz;
  const kg = (N.woz[W.jaar] || N.woz["2026"])!;
  let wVal = 0,
    wT = "",
    minUsed = false;
  if (W.soort === "taxatie") {
    wVal = (num(W.waarde) * N.taxatiePct) / 100;
    wT = N.taxatiePct + "% van taxatiewaarde " + eur(num(W.waarde));
  } else if (W.soort === "minimum" || !num(W.waarde)) {
    wVal = N.wozMinimum;
    minUsed = true;
    wT = "minimum WOZ-waarde " + eur(N.wozMinimum);
    if (W.soort === "woz")
      warn.push("Er is geen WOZ-waarde ingevuld; er is gerekend met de minimum WOZ-waarde.");
  } else {
    wVal = num(W.waarde);
    wT = "WOZ " + eur(wVal) + " (beschikking " + W.jaar + ")";
  }
  const m2woz = m2r(oppV + oppO + (num(P.typeI) * N.parkeer.m2TypeI) / pa);
  const d2 = W.kleinCorop ? kg[2] : kg[1];
  let pW = q(wVal / kg[0] + (m2woz > 0 ? wVal / m2woz / d2 : 0));
  const pWstd = pW;
  let nb1519 = false;
  if (W.nieuwbouw1519 && r1to10 + p12 >= N.nieuwbouwMinPunten && pW < N.wozMinNieuwbouw) {
    pW = N.wozMinNieuwbouw;
    nb1519 = true;
  }
  wT +=
    ", " +
    m2woz +
    " m²" +
    (W.kleinCorop ? ", kengetal kleine nieuwbouw COROP" : "") +
    (nb1519 ? ", minimaal 40 punten (nieuwbouw 2015-2019)" : "");

  // Zorgwoning: +35% over rubrieken 1 t/m 11
  const pZorg = inp.bijz.zorgwoning ? ((r1to10 + pWstd) * N.zorgPct) / 100 : 0;
  // Rijksmonument met huurovereenkomst vóór 1 juli 2024: 50 punten
  const pRijks =
    inp.opslag.monument === "rijks" && inp.opslag.contractVoor2024 ? N.opslag.rijksPunten : 0;

  const other = r1to10 + p12 + pZorg + pRijks;
  let totaalExact = other + pW;
  let capNote = "",
    floor186 = false;
  if (Math.round(totaalExact) >= N.grensMidden + 1 && !minUsed && !nb1519) {
    const share = N.wozCapPct / 100;
    if (pW > share * totaalExact) {
      const wMax = Math.floor((other * share) / (1 - share) + 1e-9);
      pW = wMax;
      capNote = " (cap: maximaal " + N.wozCapPct + "% van het totaal, afgerond op hele punten)";
      totaalExact = other + pW;
      if (Math.round(totaalExact) < N.grensMidden + 1 && !W.kleinCorop) floor186 = true;
    }
  }
  add(11, "WOZ-waarde", pW, wT + capNote);
  add(
    12,
    "Bijzondere voorzieningen",
    q(p12),
    [
      inp.bijz.aanbel ? "aanbelfunctie met video en audio" : "",
      num(inp.bijz.laadpalen) ? num(inp.bijz.laadpalen) + " laadpaal/laadpalen" : "",
    ]
      .filter(Boolean)
      .join(", ") || "geen",
  );
  if (pZorg)
    add(12, "Zorgwoning (+" + N.zorgPct + "%)", r2(pZorg), N.zorgPct + "% over rubriek 1 t/m 11");
  if (pRijks) add(13, "Rijksmonument, huurovereenkomst vóór 1 juli 2024", pRijks, "50 punten");

  let totaal = Math.round(totaalExact + 1e-9);
  if (floor186) {
    totaal = N.grensMidden;
    warn.push(
      "Zonder de WOZ-cap had de woning 187 punten of meer; met de cap zakt hij eronder. Daarom geldt een waardering van " +
        N.grensMidden +
        " punten.",
    );
  }
  const seg: Segment = totaal <= N.grensLaag ? "laag" : totaal <= N.grensMidden ? "midden" : "hoog";
  const maxHuur = huurVoorPunten(totaal, N);

  // Opslagen op de maximale huurprijs
  const ops: [string, number][] = [];
  const M = inp.opslag.monument;
  if (M === "rijks" && !inp.opslag.contractVoor2024) ops.push(["Rijksmonument", N.opslag.rijksPct]);
  if (M === "gemprov") ops.push(["Gemeentelijk of provinciaal monument", N.opslag.gemprovPct]);
  if (M === "stads") ops.push(["Beschermd stads- of dorpsgezicht", N.opslag.stadsPct]);
  if (inp.opslag.nieuwbouw) {
    if (seg === "midden") ops.push(["Nieuwbouw", N.opslag.nieuwbouwPct]);
    else warn.push("De nieuwbouwopslag geldt alleen voor woningen in de middensector.");
  }
  const opslagPct = ops.reduce((s, o) => s + o[1], 0);
  const maxHuurOpslag = maxHuur != null && opslagPct ? r2(maxHuur * (1 + opslagPct / 100)) : null;

  return {
    rows,
    totaal,
    exact: r2(totaalExact),
    seg,
    maxHuur,
    opslagen: ops,
    opslagPct,
    maxHuurOpslag,
    warn,
    oppV,
    oppO,
    oppVraw,
    gOppV,
    gOppO,
    wozCapActief: !!capNote,
    wozCapFloor: floor186,
  };
}

export const SEGMENT_NAMEN: Record<Segment, string> = {
  laag: "Sociale huur",
  midden: "Middenhuur",
  hoog: "Vrije sector",
};
