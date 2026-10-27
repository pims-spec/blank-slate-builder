// Een ingelezen plattegrond overnemen in de telling — applyPlat() / applyIndPlat() in
// wws-site.html, zonder DOM: de keuzes uit het venster (per ruimte overnemen/soort/m², sanitair,
// keuken, buitenruimte, vervangen) komen als parameters binnen. De afbeelding zelf wordt apart
// opgeslagen (Storage), niet hier.
import { ensureFac, fmt, num, OVERIG_TYPES, overigType, r2, VERTREK_TYPES } from "../basis";
import { normaliseer } from "../calc";
import { bboxOk } from "../indeling";
import { facIsOnbewerkt } from "../pve";
import type { OverigeRuimte, Vertrek, WwsInput } from "../types";
import type { PlattegrondAntwoord } from "../ai/antwoorden";

export interface RuimteKeuze {
  overnemen: boolean;
  /** "v:<type>" of "o:<type>", zoals de keuzelijst in de bron */
  soort: string;
  /** zoals ingevuld (komma of punt) */
  m2: string;
}

export interface PlatKeuzes {
  ruimten: RuimteKeuze[];
  sanitair: boolean;
  keuken: boolean;
  buiten: boolean;
  /** Bestaande ruimten vervangen (anders toevoegen/aanvullen) */
  vervangen: boolean;
}

/** Voorgestelde soort per ruimte — de keuzelijst in renderPlat() */
export function voorgesteldeSoort(r: PlattegrondAntwoord["ruimten"][number]): string {
  const key = r.soort === "vertrek" ? "vertrekken" : "overig";
  const types = key === "vertrekken" ? VERTREK_TYPES : OVERIG_TYPES;
  const tk =
    r.soort === "verkeer"
      ? r.type === "overloop"
        ? "overloop"
        : "hal"
      : types.some((t) => t.k === r.type)
        ? r.type
        : r.type === "bijkeuken"
          ? "wasruimte"
          : "overig";
  return (key === "vertrekken" ? "v:" : "o:") + tk;
}

/**
 * Wat het venster bij het openen voorstelt (alles aangevinkt wat iets gevonden heeft). Bewuste
 * afwijking van de bron: het sanitair wordt niet uit de plattegrond overgenomen (dat komt uit de
 * fotobeoordeling of wordt met de hand ingevuld); van de voorzieningen alleen de aanrechtlengte.
 */
export function standaardKeuzes(R: PlattegrondAntwoord): PlatKeuzes {
  return {
    ruimten: R.ruimten.map((r) => ({
      overnemen: true,
      soort: voorgesteldeSoort(r),
      m2: r.m2 != null ? String(r.m2).replace(".", ",") : "",
    })),
    sanitair: false,
    keuken: num(R.keuken.aanrecht_m) > 0,
    buiten: R.buitenruimten.length > 0,
    vervangen: false,
  };
}

/**
 * Staat "bestaande ruimten vervangen" standaard aan? Ja als de telling al ruimten met m² heeft:
 * anders komen de ingelezen ruimten er dubbel bij. Een lege telling (of alleen soorten zonder m²)
 * wordt aangevuld, zoals de bron.
 */
export function standaardVervangen(input: WwsInput): boolean {
  return [...input.vertrekken, ...input.overig].some((r) => num(r.m2) > 0);
}

/** "1× toilet in toiletruimte, 1× douche" — of leeg als er niets gevonden is */
export function sanitairTekst(R: PlattegrondAntwoord): string {
  const S = R.sanitair as Record<string, unknown>;
  return (
    [
      ["toilet_toiletruimte", "toilet in toiletruimte"],
      ["toilet_badkamer", "toilet in badkamer"],
      ["wastafel_badkamer", "wastafel in badkamer"],
      ["fontein_toiletruimte", "fontein in toiletruimte"],
      ["douche", "douche"],
      ["bad", "bad"],
      ["bad_douche", "bad met douche"],
    ] as const
  )
    .filter((x) => num(S[x[0]]) > 0)
    .map((x) => num(S[x[0]]) + "× " + x[1])
    .join(", ");
}

type Nieuw = (Vertrek | OverigeRuimte) & { herkomst: string; bbox?: unknown; _merged?: boolean };

/**
 * applyPlat(): geeft de nieuwe invoer (de oude blijft ongewijzigd).
 *
 * Bewuste afwijkingen (tenzij `bronGetrouw`, voor de vergelijkingstest):
 * - een ingelezen ruimte met voorziening begint leeg (geen toilet, wastafel of douche, keuken
 *   korter dan 1 m); de bron vulde daar via normaliseer de standaard in. Van de voorzieningen komt
 *   alleen de aanrechtlengte uit de plattegrond.
 * - "raam" en "open_keuken" uit het antwoord gaan mee als `raam` en `openKeuken` (voor het
 *   indelingsadvies).
 * - bij vervangen houdt een ingelezen ruimte de al ingevulde voorzieningen van een bestaande
 *   ruimte met dezelfde voorziening (keuken, badkamer, toilet, …), in volgorde; de bron gooide
 *   die weg.
 */
export function platToepassen(
  input: WwsInput,
  R: PlattegrondAntwoord,
  k: PlatKeuzes,
  { bronGetrouw = false }: { bronGetrouw?: boolean } = {},
): WwsInput {
  let I = structuredClone(input);
  const newV: Nieuw[] = [],
    newO: Nieuw[] = [];
  R.ruimten.forEach((r, i) => {
    const keuze = k.ruimten[i];
    if (!keuze || !keuze.overnemen) return;
    const sel = keuze.soort.split(":");
    const m = keuze.m2;
    const herkomst =
      "Plattegrond: " +
      (r.bron || "?") +
      (r.opmerking ? " (" + String(r.opmerking).slice(0, 80) + ")" : "");
    const maten =
      num(r.lengte_m) > 0 && num(r.breedte_m) > 0
        ? [
            {
              l: String(r.lengte_m).replace(".", ","),
              b: String(r.breedte_m).replace(".", ","),
            },
          ]
        : [{ l: "", b: "" }];
    const bbox = bboxOk(r.bbox) ? { x: r.bbox.x, y: r.bbox.y, w: r.bbox.w, h: r.bbox.h } : null;
    const extra: Partial<Nieuw> = {};
    if (!bronGetrouw) {
      if (typeof r.raam === "boolean") extra.raam = r.raam;
      if (r.open_keuken === true && sel[1] === "keuken") (extra as Vertrek).openKeuken = true;
    }
    if (sel[0] === "v")
      newV.push(
        Object.assign(
          {
            type: sel[1],
            naam: r.naam || "",
            m2: m,
            maten,
            verwarmd: true,
            verkoeld: false,
            herkomst,
          },
          bbox ? { bbox } : {},
          extra,
        ) as Nieuw,
      );
    else
      newO.push(
        Object.assign(
          {
            type: sel[1],
            naam: r.naam || "",
            m2: m,
            maten,
            verwarmd: overigType(sel[1]!).verkeer === true,
            herkomst,
          },
          bbox ? { bbox } : {},
          extra,
        ) as Nieuw,
      );
  });
  if (!bronGetrouw) {
    newV.forEach((r) => ensureFac("vertrekken", r, true));
    newO.forEach((r) => ensureFac("overig", r, true));
  }
  if (k.vervangen) {
    if (!bronGetrouw) {
      const oud = [...I.vertrekken, ...I.overig]
        .map((r) => r.fac)
        .filter((f): f is NonNullable<typeof f> => !!f && !facIsOnbewerkt(f));
      [...newV, ...newO].forEach((r) => {
        const i = oud.findIndex((f) => f.kind === r.fac?.kind);
        if (i >= 0) r.fac = oud.splice(i, 1)[0];
      });
    }
    I.vertrekken = newV as Vertrek[];
    I.overig = newO as OverigeRuimte[];
  } else {
    const merge = (list: Nieuw[], add: Nieuw[]) => {
      add.forEach((n) => {
        const ex = list.find((r) => r.type === n.type && !(num(r.m2) > 0) && !r._merged);
        if (ex) {
          ex.m2 = n.m2;
          ex.maten = n.maten!;
          ex.herkomst = n.herkomst;
          ex.naam = n.naam!;
          ex._merged = true;
        } else list.push(n);
      });
      list.forEach((r) => delete r._merged);
    };
    merge(I.vertrekken as Nieuw[], newV);
    merge(I.overig as Nieuw[], newO);
  }
  const S = R.sanitair;
  I = normaliseer(I);
  if (k.sanitair) {
    const br = I.vertrekken.find((r) => r.fac && r.fac.kind === "badkamer");
    if (br && br.fac?.kind === "badkamer") {
      const b = br.fac.san;
      b.toiletStaand = num(S.toilet_badkamer);
      b.toiletHang = 0;
      b.wastafel = num(S.wastafel_badkamer);
      b.douche = num(S.douche);
      b.bad = num(S.bad);
      b.badDouche = num(S.bad_douche);
    }
    const trs = I.overig.filter((r) => r.fac && r.fac.kind === "toilet");
    let nt = num(S.toilet_toiletruimte),
      nf = num(S.fontein_toiletruimte);
    trs.forEach((tr) => {
      if (tr.fac?.kind !== "toilet") return;
      tr.fac.toilet.toilet = nt > 0 ? "staand" : "geen";
      if (nt > 0) nt--;
      tr.fac.toilet.fontein = nf > 0;
      if (nf > 0) nf--;
    });
  }
  const al = num(R.keuken.aanrecht_m);
  if (k.keuken && al > 0) {
    const kr = I.vertrekken.find((r) => r.fac && r.fac.kind === "keuken");
    if (kr && kr.fac?.kind === "keuken")
      kr.fac.keuken.lengte = al < 1 ? "<1" : al <= 2 ? "1-2" : ">=2";
  }
  if (k.buiten) {
    const t = R.buitenruimten.reduce((s, b) => s + num(b.m2), 0);
    if (t > 0)
      I.buiten.ruimten.push({
        soort: "overig",
        groep: "priv",
        m2: String(r2(t)).replace(".", ","),
        maten: [],
      });
  }
  return I;
}

/** Korte tekst per buitenruimte voor het venster */
export const buitenTekst = (R: PlattegrondAntwoord) =>
  R.buitenruimten
    .map((b) => (b.naam || "buitenruimte") + " " + (b.m2 != null ? fmt(num(b.m2)) + " m²" : "?"))
    .join(", ");
