// Meer verdiepingen inlezen: elke tekening gaat apart naar Claude (leesPlattegrond, ongewijzigd),
// met de verdieping in de toelichting. Daarna komen de antwoorden samen in één antwoord voor de
// controletabel en platToepassen. Bij meer dan één verdieping vervallen de vlakken op de tekening
// (bbox): de tekeningen staan dan onder elkaar op één afbeelding (stapelMaten).
//
// Eén verdieping verwijderen: de telling onthoudt per verdieping waar de tekening op de
// samengestelde afbeelding staat (input.plattegrond.verdiepingen) en elke ruimte zijn verdieping.
// Bij verwijderen worden de andere tekeningen uit de afbeelding geknipt en opnieuw gestapeld
// (zonderVerdieping), en desgewenst de ruimten van die verdieping uit de telling gehaald.
import * as z from "zod";
import { num } from "../basis";
import type { PlattegrondAntwoord } from "../ai/antwoorden";
import type { PlatVerdieping, WwsInput } from "../types";
import { MAX_ZIJDE } from "./beeld";

/** Hoogstens zoveel tekeningen tegelijk (elke tekening is één AI-aanroep) */
export const MAX_VERDIEPINGEN = 4;

export const VERDIEPING_NAMEN = [
  "Kelder",
  "Souterrain",
  "Begane grond",
  "1e verdieping",
  "2e verdieping",
  "3e verdieping",
  "4e verdieping",
  "Zolder",
  "Berging",
] as const;

/** Voorstel voor de verdieping: uit de bestandsnaam, anders op volgorde (begane grond, 1e, …) */
export function stelVerdiepingVoor(pad: string, volgnr: number): string {
  const n = (pad.split("/").pop() ?? pad)
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ");
  if (/kelder/.test(n)) return "Kelder";
  if (/souterrain/.test(n)) return "Souterrain";
  if (/zolder|vliering/.test(n)) return "Zolder";
  if (/berging|schuur/.test(n)) return "Berging";
  if (/begane|\bbg\b|parterre|\bgrond/.test(n)) return "Begane grond";
  const v =
    /\b([1-4])\s*(e|ste|de)?\s*(verd|verdieping|etage)/.exec(n) ?? /\bverd\w*\s*([1-4])\b/.exec(n);
  if (v) return `${v[1]}e verdieping`;
  return volgnr === 0 ? "Begane grond" : `${Math.min(volgnr, 4)}e verdieping`;
}

/** n verdiepingen hoger dan v (voor de volgende pagina's van een PDF); bovenaan blijft het daar */
export function volgendeVerdieping(v: string, n: number): string {
  const rij = [
    "Kelder",
    "Souterrain",
    "Begane grond",
    "1e verdieping",
    "2e verdieping",
    "3e verdieping",
    "4e verdieping",
    "Zolder",
  ];
  const i = rij.indexOf(v);
  if (i < 0 || n <= 0) return v;
  return rij[Math.min(rij.length - 1, i + n)]!;
}

/** De toelichting voor Claude bij meer verdiepingen: welke verdieping dit is, dan de eigen tekst */
export function verdiepingNotitie(verdieping: string, notitie: string): string {
  const v = `Deze tekening is de ${verdieping.toLowerCase()} van de woning. Neem alleen de ruimten op deze tekening op.`;
  return (notitie.trim() ? v + " " + notitie.trim() : v).slice(0, 500);
}

const metVerdieping = (naam: string, v: string) => (naam.trim() ? `${naam.trim()} (${v})` : v);

/**
 * De antwoorden per verdieping samen. Eén verdieping: ongewijzigd. Meer: alle ruimten en
 * buitenruimten met de verdieping in de naam en zonder bbox; het langste aanrecht; sanitair
 * opgeteld; maatvoering en nameten per verdieping. verdiepingen geeft per ruimte de verdieping.
 */
export function voegVerdiepingenSamen(
  delen: readonly { verdieping: string; R: PlattegrondAntwoord }[],
): {
  R: PlattegrondAntwoord;
  verdiepingen: string[];
} {
  if (delen.length === 1) {
    const { verdieping, R } = delen[0]!;
    return { R, verdiepingen: R.ruimten.map(() => verdieping) };
  }
  const ruimten: PlattegrondAntwoord["ruimten"] = [];
  const verdiepingen: string[] = [];
  const buitenruimten: PlattegrondAntwoord["buitenruimten"] = [];
  const nameten: string[] = [];
  const sanitair: Record<string, number> = {};
  let keuken: PlattegrondAntwoord["keuken"] = {};
  for (const { verdieping: v, R } of delen) {
    for (const r of R.ruimten) {
      const zonder = { ...r, naam: metVerdieping(r.naam, v) };
      delete zonder.bbox;
      ruimten.push(zonder);
      verdiepingen.push(v);
    }
    for (const b of R.buitenruimten) buitenruimten.push({ ...b, naam: metVerdieping(b.naam, v) });
    for (const n of R.nameten) nameten.push(`${v}: ${n}`);
    for (const [k, n] of Object.entries(R.sanitair)) sanitair[k] = (sanitair[k] ?? 0) + num(n);
    if (num(R.keuken.aanrecht_m) > num(keuken.aanrecht_m)) keuken = R.keuken;
  }
  return {
    R: {
      maatvoering: delen.map((d) => `${d.verdieping}: ${d.R.maatvoering || "onbekend"}`).join("; "),
      ruimten,
      keuken,
      sanitair: sanitair as PlattegrondAntwoord["sanitair"],
      buitenruimten,
      nameten,
    },
    verdiepingen,
  };
}

/** Ruimte voor de kop boven elke tekening, in px van het eindbeeld */
export const KOP_HOOGTE = 56;
/** Het samengestelde beeld wordt hoogstens zo hoog */
export const MAX_STAPEL_HOOGTE = MAX_ZIJDE * 3;

export interface StapelDeel {
  /** Linksboven van de tekening (onder de kop) en de getekende maten */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Basislijn van de kop */
  kopY: number;
}

/**
 * De tekeningen onder elkaar: allemaal even breed (de breedste, hoogstens 2200 px; kleinere worden
 * niet vergroot en staan in het midden), met een kop erboven. Te hoog → alles naar verhouding
 * kleiner.
 */
export function stapelMaten(
  maten: readonly { breedte: number; hoogte: number }[],
  max = MAX_ZIJDE,
  maxHoogte = MAX_STAPEL_HOOGTE,
): { breedte: number; hoogte: number; delen: StapelDeel[]; kop: number } {
  const W = Math.min(max, Math.max(1, ...maten.map((m) => m.breedte)));
  const geschaald = maten.map((m) => {
    const s = Math.min(1, W / Math.max(1, m.breedte));
    return { w: m.breedte * s, h: m.hoogte * s };
  });
  const totaal = geschaald.reduce((t, g) => t + KOP_HOOGTE + g.h, 0);
  const f = Math.min(1, maxHoogte / Math.max(1, totaal));
  const kop = Math.round(KOP_HOOGTE * f);
  let y = 0;
  const delen = geschaald.map((g) => {
    const w = Math.max(1, Math.round(g.w * f));
    const h = Math.max(1, Math.round(g.h * f));
    const d = { x: Math.round((W * f - w) / 2), y: y + kop, w, h, kopY: y + Math.round(kop * 0.7) };
    y += kop + h;
    return d;
  });
  return { breedte: Math.max(1, Math.round(W * f)), hoogte: Math.max(1, y), delen, kop };
}

/** De plekken van de tekeningen (zonder de kop) op het samengestelde beeld */
export function verdiepingenVan(
  maten: { delen: readonly StapelDeel[] },
  namen: readonly string[],
): PlatVerdieping[] {
  return maten.delen.map((d, i) => ({ naam: namen[i] ?? "", x: d.x, y: d.y, w: d.w, h: d.h }));
}

const PlatVerdiepingSchema = z.object({
  naam: z.string().trim().min(1).max(40),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

/**
 * De verdiepingen van een opgeslagen plattegrond (onbetrouwbare invoer): alleen als het er 2 tot 4
 * zijn, met verschillende namen en binnen de afbeelding. Anders [] (dan kan alleen alles weg).
 */
export function leesVerdiepingen(p: WwsInput["plattegrond"] | undefined): PlatVerdieping[] {
  if (!p) return [];
  const r = z.array(PlatVerdiepingSchema).min(2).max(MAX_VERDIEPINGEN).safeParse(p.verdiepingen);
  if (!r.success) return [];
  const binnen = r.data.every((v) => v.x + v.w <= num(p.breedte) && v.y + v.h <= num(p.hoogte));
  const uniek = new Set(r.data.map((v) => v.naam)).size === r.data.length;
  return binnen && uniek ? r.data : [];
}

/**
 * De nieuwe afbeelding zonder verdieping i: welke stukken (bron) waar komen (doel). Blijft er meer
 * dan één over, dan opnieuw onder elkaar met koppen (stapelMaten); blijft er één over, dan alleen
 * die tekening, zonder kop, en geen verdiepingen meer.
 */
export function zonderVerdieping(
  verdiepingen: readonly PlatVerdieping[],
  i: number,
): {
  breedte: number;
  hoogte: number;
  kop: number;
  stukken: { bron: PlatVerdieping; doel: StapelDeel }[];
  verdiepingen: PlatVerdieping[] | null;
} {
  const rest = verdiepingen.filter((_, j) => j !== i);
  if (rest.length === 1) {
    const v = rest[0]!;
    return {
      breedte: v.w,
      hoogte: v.h,
      kop: 0,
      stukken: [{ bron: v, doel: { x: 0, y: 0, w: v.w, h: v.h, kopY: 0 } }],
      verdiepingen: null,
    };
  }
  const m = stapelMaten(rest.map((v) => ({ breedte: v.w, hoogte: v.h })));
  return {
    breedte: m.breedte,
    hoogte: m.hoogte,
    kop: m.kop,
    stukken: rest.map((bron, j) => ({ bron, doel: m.delen[j]! })),
    verdiepingen: verdiepingenVan(
      m,
      rest.map((v) => v.naam),
    ),
  };
}

/** Hoeveel ruimten in de telling bij deze verdieping horen */
export const ruimtenVanVerdieping = (input: WwsInput, naam: string) =>
  [...input.vertrekken, ...input.overig].filter((r) => r.verdieping === naam).length;

/** De telling zonder de ruimten van deze verdieping (wijzigt input niet) */
export function zonderRuimtenVan(input: WwsInput, naam: string): WwsInput {
  return {
    ...input,
    vertrekken: input.vertrekken.filter((r) => r.verdieping !== naam),
    overig: input.overig.filter((r) => r.verdieping !== naam),
  };
}
