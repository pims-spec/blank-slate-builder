// Structuur van de Bloxs OData-feed uit $metadata (CSDL/EDMX, XML). Alleen NAMEN: entiteitsets,
// entiteittypen, velden, sleutels en navigatie. Geen rijen, geen waarden, geen annotaties of
// standaardwaarden. Zonder DOMParser (die is er niet op Cloudflare Workers), met een kleine
// tag-scanner; elke naam wordt gecontroleerd zodat er nooit iets anders dan een naam doorkomt.
import * as z from "zod";

/** Een OData-naam (SimpleIdentifier), eventueel met namespace-punten */
const Naam = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.]{0,127}$/);

export const StructuurSchema = z.object({
  entiteiten: z
    .array(
      z.object({
        /** Naam van de entiteitset (zoals in de URL), of van het type als er geen set is */
        naam: Naam,
        type: Naam,
        sleutel: z.array(Naam).max(20),
        velden: z.array(Naam).max(1000),
        navigatie: z.array(Naam).max(200),
      }),
    )
    .max(1000),
});
export type BloxsStructuur = z.infer<typeof StructuurSchema>;

/** Maximale grootte van $metadata die we lezen */
export const MAX_METADATA_TEKENS = 5_000_000;

const attr = (tag: string, naam: string) =>
  new RegExp("\\s" + naam + '\\s*=\\s*"([^"]*)"').exec(tag)?.[1] ??
  new RegExp("\\s" + naam + "\\s*=\\s*'([^']*)'").exec(tag)?.[1];

/** Lokale tagnaam zonder namespace-prefix: "edm:Property" → "Property" */
const lokaal = (n: string) => n.slice(n.indexOf(":") + 1);

const isNaam = (x: string | undefined): x is string => !!x && Naam.safeParse(x).success;

/**
 * Lees de structuur uit $metadata. Geeft null als het geen herkenbare CSDL is. Namen die niet
 * aan het naampatroon voldoen worden overgeslagen (nooit doorgegeven).
 */
export function leesMetadata(xml: string): BloxsStructuur | null {
  if (xml.length > MAX_METADATA_TEKENS || !/<(\w+:)?(Edmx|Schema)\b/.test(xml)) return null;

  interface Type {
    sleutel: string[];
    velden: string[];
    navigatie: string[];
  }
  const typen = new Map<string, Type>();
  const sets: { naam: string; type: string }[] = [];

  let huidig: Type | null = null;
  let inSleutel = false;
  let namespace = "";
  // alleen open-, sluit- en zelfsluitende tags; commentaar en CDATA overslaan
  const tags = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  for (const m of tags.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>/g)) {
    const sluit = m[1] === "/";
    const naam = lokaal(m[2]!);
    const tag = " " + m[3];
    if (naam === "Schema" && !sluit) namespace = attr(tag, "Namespace") ?? "";
    if (naam === "EntityType") {
      if (sluit) {
        huidig = null;
        continue;
      }
      const n = attr(tag, "Name");
      if (!isNaam(n)) {
        huidig = null;
        continue;
      }
      huidig = { sleutel: [], velden: [], navigatie: [] };
      typen.set(n, huidig);
      if (namespace) typen.set(namespace + "." + n, huidig);
      if (m[4] === "/") huidig = null;
      continue;
    }
    if (naam === "Key") {
      inSleutel = !sluit && m[4] !== "/";
      continue;
    }
    if (sluit) continue;
    if (naam === "PropertyRef" && huidig && inSleutel) {
      const n = attr(tag, "Name");
      if (isNaam(n)) huidig.sleutel.push(n);
    } else if (naam === "Property" && huidig) {
      const n = attr(tag, "Name");
      if (isNaam(n)) huidig.velden.push(n);
    } else if (naam === "NavigationProperty" && huidig) {
      const n = attr(tag, "Name");
      if (isNaam(n)) huidig.navigatie.push(n);
    } else if (naam === "EntitySet") {
      const n = attr(tag, "Name");
      const t = attr(tag, "EntityType");
      if (isNaam(n) && isNaam(t)) sets.push({ naam: n, type: t });
    }
  }

  const entiteiten: BloxsStructuur["entiteiten"] = [];
  const gebruikt = new Set<Type>();
  for (const s of sets) {
    const t = typen.get(s.type) ?? typen.get(s.type.slice(s.type.lastIndexOf(".") + 1));
    if (!t) continue;
    gebruikt.add(t);
    entiteiten.push({ naam: s.naam, type: s.type, ...t });
  }
  // typen zonder set (komt voor bij sommige feeds) toch tonen, op typenaam
  for (const [n, t] of typen) {
    if (gebruikt.has(t) || n.includes(".")) continue;
    gebruikt.add(t);
    entiteiten.push({ naam: n, type: n, ...t });
  }
  entiteiten.sort((a, b) => a.naam.localeCompare(b.naam));
  const r = StructuurSchema.safeParse({ entiteiten });
  return r.success ? r.data : null;
}
