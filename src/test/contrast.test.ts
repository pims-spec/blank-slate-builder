// WCAG AA-contrast van de huisstijl-tokens (src/styles.css), licht én donker: tekst op paars,
// oranje, de segmentkleuren en de gewone vlakken. Leest de oklch-waarden uit de stylesheet.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");

function tokens(blok: string): Record<string, [number, number, number]> {
  const uit: Record<string, [number, number, number]> = {};
  for (const m of blok.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g))
    uit[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])];
  return uit;
}
const licht = tokens(
  css.slice(css.indexOf(":root {"), css.indexOf("\n@media (prefers-color-scheme: dark) {")),
);
const donker = tokens(
  css.slice(css.indexOf("\n@media (prefers-color-scheme: dark) {"), css.indexOf("@layer base")),
);

/** oklch → relatieve luminantie (WCAG) */
function luminantie([L, C, H]: [number, number, number]) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) => Math.min(1, Math.max(0, x)));
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
}
function contrast(t: typeof licht, voor: string, achter: string) {
  const a = t[voor],
    b = t[achter];
  if (!a || !b) throw new Error("token ontbreekt: " + (a ? achter : voor));
  const [x, y] = [luminantie(a), luminantie(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** [tekst, achtergrond] — moeten 4,5:1 halen (normale tekst) */
const PAREN: [string, string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["primary-foreground", "primary"],
  ["primary", "background"],
  ["primary", "card"],
  ["primary", "secondary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["orange-foreground", "orange"],
  ["orange-ink", "background"],
  ["orange-ink", "card"],
  ["warn-foreground", "warn"],
  ["seg-foreground", "seg-laag"],
  ["seg-foreground", "seg-midden"],
  ["seg-foreground", "seg-hoog"],
  ["destructive", "background"],
  ["destructive", "card"],
  ["destructive-foreground", "destructive"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  ["sidebar-accent-foreground", "sidebar-accent"],
];

describe("huisstijl: WCAG AA-contrast van de tokens", () => {
  it("de bronkleuren staan erin (paars #5B41FF, oranje #FF7C3A)", () => {
    expect(css).toMatch(/--primary: oklch\([^)]+\); \/\* #5B41FF \*\//);
    expect(css).toMatch(/--orange: oklch\([^)]+\); \/\* #FF7C3A \*\//);
  });

  for (const [naam, t] of [
    ["licht", licht],
    ["donker", donker],
  ] as const)
    it.each(PAREN)(`${naam}: %s op %s haalt 4,5:1`, (voor, achter) => {
      expect(contrast(t, voor, achter)).toBeGreaterThanOrEqual(4.5);
    });

  it("wit op oranje zou niet voldoen (daarom donkere inkt op oranje)", () => {
    const wit = { wit: [1, 0, 0] as [number, number, number], ...licht };
    expect(contrast(wit, "wit", "orange")).toBeLessThan(4.5);
  });
});
