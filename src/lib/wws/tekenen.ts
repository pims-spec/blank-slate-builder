// Tekenen op de plattegrond in het indelingsadvies: de rekenkant van indelingPlatPointerMove(),
// indelingClipPath(), indelingSchatM2VoorBbox() en indelingCycleStatus() uit wws-site.html,
// zonder DOM. Alles in fracties (0–1) van de hele plattegrond.
import { r2 } from "./basis";
import type { Bbox, IndelingStatus, Notches } from "./indeling";

export type Hoek = keyof Notches;
export const HOEKEN: Hoek[] = ["tl", "tr", "bl", "br"];

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Vlak verplaatsen; blijft binnen de tekening */
export function verplaats(b: Bbox, dx: number, dy: number): Bbox {
  const nb = { x: clamp01(b.x + dx), y: clamp01(b.y + dy), w: b.w, h: b.h };
  nb.x = Math.min(nb.x, 1 - nb.w);
  nb.y = Math.min(nb.y, 1 - nb.h);
  return nb;
}

/** Formaat aanpassen aan één hoek; de tegenoverliggende hoek blijft staan */
export function vergroot(b: Bbox, hoek: Hoek, dx: number, dy: number): Bbox {
  let x0 = b.x,
    y0 = b.y,
    x1 = b.x + b.w,
    y1 = b.y + b.h;
  if (hoek === "tl" || hoek === "bl") x0 = clamp01(Math.min(b.x + dx, x1 - 0.02));
  else x1 = clamp01(Math.max(b.x + b.w + dx, x0 + 0.02));
  if (hoek === "tl" || hoek === "tr") y0 = clamp01(Math.min(b.y + dy, y1 - 0.02));
  else y1 = clamp01(Math.max(b.y + b.h + dy, y0 + 0.02));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Nieuw oppervlak evenredig met het vlak; null als er niets te schalen valt */
export function m2NaVergroten(startM2: number, oud: Bbox, nieuw: Bbox): number | null {
  const oudOpp = oud.w * oud.h,
    nieuwOpp = nieuw.w * nieuw.h;
  if (!(oudOpp > 0 && startM2 > 0)) return null;
  return Math.max(0.1, r2(startM2 * (nieuwOpp / oudOpp)));
}

/** "Plattegrond: berekend" → "Plattegrond, aangepast (formaat aangepast)" (eenmalig) */
export function herkomstAangepast(h: string | undefined): string | undefined {
  if (!h || /aangepast/.test(h)) return h;
  return h.replace(/^Plattegrond: [^ (]+/, "Plattegrond, aangepast") + " (formaat aangepast)";
}

/**
 * Inkeping aan een hoek: slepen naar het midden van het vlak maakt hem groter (max 45%).
 * dx/dy in fracties van de hele tekening; kleiner dan 4% verdwijnt de inkeping.
 */
export function inkeping(
  start: { w: number; h: number },
  hoek: Hoek,
  b: Bbox,
  dx: number,
  dy: number,
): { w: number; h: number } | null {
  const dxBox = b.w > 0 ? dx / b.w : 0,
    dyBox = b.h > 0 ? dy / b.h : 0;
  const dxIn = hoek === "tr" || hoek === "br" ? -dxBox : dxBox;
  const dyIn = hoek === "bl" || hoek === "br" ? -dyBox : dyBox;
  const nw = Math.min(0.45, Math.max(0, start.w + dxIn));
  const nh = Math.min(0.45, Math.max(0, start.h + dyIn));
  return nw > 0.04 && nh > 0.04 ? { w: nw, h: nh } : null;
}

export const notchLeeg = (n: Notches | null | undefined) => !n || HOEKEN.every((h) => !n[h]);

/** CSS clip-path voor de inkepingen — indelingClipPath() */
export function clipPath(n: Notches): string | undefined {
  if (notchLeeg(n)) return undefined;
  const g = (h: Hoek) => n[h] || { w: 0, h: 0 };
  const tl = g("tl"),
    tr = g("tr"),
    bl = g("bl"),
    br = g("br");
  const pc = (v: number) => Math.max(0, Math.min(100, v * 100)).toFixed(2) + "%";
  const P = (x: string, y: string) => x + " " + y;
  return (
    "polygon(" +
    [
      P(pc(tl.w), "0%"),
      P(pc(1 - tr.w), "0%"),
      P(pc(1 - tr.w), pc(tr.h)),
      P("100%", pc(tr.h)),
      P("100%", pc(1 - br.h)),
      P(pc(1 - br.w), pc(1 - br.h)),
      P(pc(1 - br.w), "100%"),
      P(pc(bl.w), "100%"),
      P(pc(bl.w), pc(1 - bl.h)),
      P("0%", pc(1 - bl.h)),
      P("0%", pc(tl.h)),
      P(pc(tl.w), pc(tl.h)),
    ].join(",") +
    ")"
  );
}

/** Geschat oppervlak van een nieuw ingetekend vlak, naar verhouding van de bekende vlakken */
export function schatM2VoorBbox(
  rooms: readonly { bbox: Bbox | null; m2: number }[],
  f: Bbox | null,
): string {
  const bekende = rooms.filter((r) => r.bbox && r.m2 > 0);
  if (!bekende.length || !f) return "";
  const totM2 = bekende.reduce((s, r) => s + r.m2, 0);
  const totArea = bekende.reduce((s, r) => s + r.bbox!.w * r.bbox!.h, 0);
  if (totArea <= 0) return "";
  const schatting = ((f.w * f.h) / totArea) * totM2;
  return schatting > 0 ? String(r2(schatting)).replace(".", ",") : "";
}

/** Vrij → vast → vervalt → vrij — indelingCycleStatus() */
export function volgendeStatus(s: IndelingStatus): IndelingStatus {
  const volgorde: IndelingStatus[] = ["vrij", "vast", "negeren"];
  return volgorde[(volgorde.indexOf(s) + 1) % volgorde.length]!;
}

/** Het kleinste vlak bovenop, zodat het klikbaar blijft */
export function zVolgorde(rooms: readonly { bbox: Bbox | null }[]): Map<number, number> {
  const indices = rooms.map((_r, i) => i).filter((i) => rooms[i]!.bbox);
  const volgorde = indices
    .slice()
    .sort((a, b) => rooms[b]!.bbox!.w * rooms[b]!.bbox!.h - rooms[a]!.bbox!.w * rooms[a]!.bbox!.h);
  return new Map(volgorde.map((i, rank) => [i, rank + 1]));
}

/** Nieuw vlak tijdens het slepen (vanaf startpunt naar huidig punt) */
export const nieuwVlak = (start: { x: number; y: number }, x1: number, y1: number): Bbox => ({
  x: Math.min(start.x, x1),
  y: Math.min(start.y, y1),
  w: Math.abs(x1 - start.x),
  h: Math.abs(y1 - start.y),
});
/** Groot genoeg om als nieuwe ruimte te tellen */
export const grootGenoeg = (f: Bbox | null | undefined) => !!f && f.w > 0.015 && f.h > 0.015;
