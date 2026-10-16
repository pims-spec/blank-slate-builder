// Welke eigenaar in GoHome hoort bij een eigenaar uit Bloxs? In deze volgorde:
// 1. een eerdere portefeuille van dezelfde Bloxs-eigenaar die al een GoHome-eigenaar heeft;
// 2. een GoHome-eigenaar met precies dezelfde naam (hoofdletters en spaties tellen niet);
// 3. anders een nieuwe eigenaar in GoHome met de naam uit Bloxs.

export type EigenaarKeuze =
  { soort: "bestaand"; klantId: string } | { soort: "nieuw"; naam: string };

/** Naam vergelijken zoals de unieke index op klanten (lower(btrim(naam))), plus enkele spaties */
export const naamSleutel = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase();

export function kiesGohomeEigenaar(
  bloxs: { id: string | number; naam: string },
  portefeuilles: readonly {
    bron: string;
    bloxsEigenaarRef: string | null;
    klantId: string | null;
  }[],
  klanten: readonly { id: string; naam: string }[],
): EigenaarKeuze {
  const bestaat = new Set(klanten.map((k) => k.id));
  const eerder = portefeuilles.find(
    (p) =>
      p.bron === "bloxs" &&
      p.bloxsEigenaarRef === String(bloxs.id) &&
      p.klantId &&
      bestaat.has(p.klantId),
  );
  if (eerder?.klantId) return { soort: "bestaand", klantId: eerder.klantId };
  const zelfde = klanten.find((k) => naamSleutel(k.naam) === naamSleutel(bloxs.naam));
  if (zelfde) return { soort: "bestaand", klantId: zelfde.id };
  return { soort: "nieuw", naam: bloxs.naam.trim().replace(/\s+/g, " ") };
}
