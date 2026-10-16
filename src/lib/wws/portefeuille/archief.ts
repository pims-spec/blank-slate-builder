// Portefeuille-analyses in het archief: eigenaarnamen erbij en zoeken (op titel, portefeuilles,
// eigenaar en wie hem maakte).
import type { ArchiefAnalyse } from "./opslag";

export function eigenaarNamen(a: ArchiefAnalyse, klanten: ReadonlyMap<string, string>): string[] {
  return a.klantIds.map((id) => klanten.get(id)).filter((n): n is string => !!n);
}

export function zoekAnalyses(
  rijen: readonly ArchiefAnalyse[],
  zoek: string,
  klanten: ReadonlyMap<string, string>,
): ArchiefAnalyse[] {
  const woorden = zoek.toLowerCase().split(/\s+/).filter(Boolean);
  if (!woorden.length) return [...rijen];
  return rijen.filter((a) => {
    const tekst = [
      a.titel,
      ...a.portefeuilleNamen,
      ...eigenaarNamen(a, klanten),
      a.gemaaktDoorNaam ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return woorden.every((w) => tekst.includes(w));
  });
}
