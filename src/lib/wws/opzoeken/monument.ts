// Monumentstatus van een adres opzoeken (rubriek 13) uit open overheidsbronnen, zonder sleutel:
// 1. PDOK Locatieserver: het adres → BAG-nummeraanduiding en het adrespunt;
// 2. Kadaster Knowledge Graph (SPARQL): de publiekrechtelijke beperkingen op dat adres, waaronder
//    "Aanwijzing gemeentelijk monument" (GWA/GG) en rijksmonument (EWE/EWD). Een beperking telt
//    alleen als het adrespunt binnen het beperkingsgebied ligt;
// 3. PDOK BAG: het pand waarin het adrespunt ligt;
// 4. PDOK RCE (Beschermde Gebieden – Cultuurhistorie): rijksmonumenten in dat pand (nummer en link
//    naar het register) en de rijksbeschermde stads- en dorpsgezichten rond het adrespunt.
// Provinciale monumenten en door de gemeente beschermde stadsgezichten staan in geen van deze
// bronnen. Alle antwoorden zijn onbetrouwbare data: alleen wat door zod komt, wordt gebruikt.
// Draait alleen op de server (opzoeken.functions.ts); fetch wordt meegegeven voor de tests.
import * as z from "zod";
import {
  haalJson,
  logFout,
  type OpzoekFout,
  type Opzoeking,
  type EpVraag,
  EpVraagSchema,
} from "./dienst";
import { PDOK_URL } from "./pdok";

export const KKG_URL = "https://data.kkg.kadaster.nl/service/sparql";
export const BAG_PAND_URL = "https://api.pdok.nl/kadaster/bag/ogc/v2/collections/pand/items";
export const RCE_URL =
  "https://api.pdok.nl/rce/beschermde-gebieden-cultuurhistorie/ogc/v1/collections";

export type MonumentSoort = "rijks" | "gemprov" | "stads";

export interface MonumentStatus {
  /** Zoals PDOK het adres noemt, bijv. "Keizersgracht 123, 1015CJ Amsterdam" */
  adres: string;
  /** Rijksmonument volgens het Kadaster of de RCE */
  rijksmonument: boolean;
  /** Monumentnummers in het register van de RCE (kan leeg zijn als alleen het Kadaster het weet) */
  rijksmonumentNummers: string[];
  /** Gemeentelijk monument volgens het Kadaster */
  gemeentelijkMonument: boolean;
  /** Namen van de rijksbeschermde stads- en dorpsgezichten waarin het adres ligt */
  gezichten: string[];
  /** Voorstel voor de keuze in de telling (de hoogste waardering); null = niets gevonden */
  voorstel: MonumentSoort | null;
}

// ---------- 1. adres ----------

const LocatieSchema = z.object({
  response: z.object({
    docs: z
      .array(
        z.object({
          weergavenaam: z.string().max(200),
          nummeraanduiding_id: z.string().regex(/^\d{16}$/),
          centroide_ll: z.string().max(100),
          huisletter: z.string().max(5).optional(),
          huisnummertoevoeging: z.string().max(10).optional(),
        }),
      )
      .max(20),
  }),
});

/** "POINT(4.88 52.37)" → [lon, lat] (WGS84), of null */
export function leesPunt(wkt: string): [number, number] | null {
  const m = /^POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/.exec(wkt.trim());
  if (!m) return null;
  const lon = Number(m[1]),
    lat = Number(m[2]);
  // Nederland, ruim
  if (!(lon > 2 && lon < 8 && lat > 50 && lat < 54)) return null;
  return [lon, lat];
}

function locatieUrl(v: z.infer<typeof EpVraagSchema>): string {
  const q = `postcode:${v.postcode} and huisnummer:${v.huisnummer} and type:adres`;
  return (
    PDOK_URL +
    "?" +
    new URLSearchParams({
      q,
      rows: "20",
      fl: "weergavenaam,nummeraanduiding_id,centroide_ll,huisletter,huisnummertoevoeging",
    })
  );
}

/** Het adres dat bij de huisletter of toevoeging past (anders het adres zonder, of het eerste) */
export function kiesAdres<
  T extends { huisletter?: string | undefined; huisnummertoevoeging?: string | undefined },
>(
  docs: T[],
  v: Pick<z.infer<typeof EpVraagSchema>, "huisletter" | "huisnummertoevoeging">,
): T | undefined {
  const norm = (s: string | undefined) => (s ?? "").replace(/[\s-]/g, "").toUpperCase();
  const letter = norm(v.huisletter),
    toev = norm(v.huisnummertoevoeging);
  return (
    docs.find((d) => norm(d.huisletter) === letter && norm(d.huisnummertoevoeging) === toev) ??
    (letter || toev
      ? // toevoeging soms als letter ingevuld of andersom
        docs.find((d) => norm(d.huisletter) + norm(d.huisnummertoevoeging) === letter + toev)
      : undefined) ??
    docs[0]
  );
}

// ---------- 2. Kadaster ----------

/** De SPARQL-vraag voor één nummeraanduiding (16 cijfers, gecontroleerd) */
export function kadasterQuery(nummeraanduiding: string): string {
  if (!/^\d{16}$/.test(nummeraanduiding)) throw new Error("ongeldige nummeraanduiding");
  return `PREFIX imx: <http://modellen.geostandaarden.nl/def/imx-geo#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
SELECT DISTINCT ?grondslagcode WHERE {
  ?adres a imx:Adres ;
    prov:wasDerivedFrom <https://bag.basisregistraties.overheid.nl/id/nummeraanduiding/${nummeraanduiding}> ;
    geo:hasGeometry/geo:asWKT ?adresWKT .
  ?gebouw a imx:Gebouw ; imx:heeftAlsAdres ?adres ; imx:bevindtZichOpPerceel ?perceel .
  ?beperking imx:isBeperkingOpPerceel ?perceel ; imx:grondslagcode ?grondslagcode ;
    geo:hasGeometry/geo:asWKT ?beperkingWKT .
  FILTER(geof:sfWithin(?adresWKT, ?beperkingWKT))
  VALUES ?grondslagcode { "GG" "GWA" "EWE" "EWD" }
}`;
}

const SparqlSchema = z.object({
  results: z.object({
    bindings: z
      .array(z.object({ grondslagcode: z.object({ value: z.string().max(10) }) }))
      .max(100),
  }),
});

/** Gemeentelijk monument (GG, GWA) en rijksmonument (EWE, EWD) uit de grondslagcodes */
export function leesKadaster(json: unknown): { gemeentelijk: boolean; rijks: boolean } | null {
  const r = SparqlSchema.safeParse(json);
  if (!r.success) return null;
  const codes = new Set(r.data.results.bindings.map((b) => b.grondslagcode.value));
  return {
    gemeentelijk: codes.has("GG") || codes.has("GWA"),
    rijks: codes.has("EWE") || codes.has("EWD"),
  };
}

// ---------- 3 en 4. pand en RCE ----------

type Ring = [number, number][];
const Coord = z.tuple([z.number(), z.number()]).rest(z.number());
const RingSchema = z.array(Coord).min(4).max(100_000);
const GeometrieSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: Coord }),
  z.object({ type: z.literal("Polygon"), coordinates: z.array(RingSchema).min(1).max(500) }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(RingSchema).min(1).max(500)).min(1).max(5000),
  }),
]);
type Geometrie = z.infer<typeof GeometrieSchema>;

const FeaturesSchema = z.object({
  features: z
    .array(
      z.object({
        geometry: GeometrieSchema.nullable(),
        properties: z.record(z.string(), z.unknown()).nullable(),
      }),
    )
    .max(500),
});

/** Ligt het punt in de ring (ray casting)? */
function inRing(p: [number, number], ring: readonly (readonly number[])[]): boolean {
  let binnen = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
      binnen = !binnen;
  }
  return binnen;
}

/** Ligt het punt in het (multi)polygoon, buiten de gaten? */
export function puntInVlak(p: [number, number], g: Geometrie | null): boolean {
  if (!g || g.type === "Point") return false;
  const vlakken = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return vlakken.some(
    (rings) => inRing(p, rings[0]!) && !rings.slice(1).some((gat) => inRing(p, gat)),
  );
}

const bbox = (p: [number, number], d: number) =>
  [p[0] - d, p[1] - d, p[0] + d, p[1] + d].map((n) => n.toFixed(7)).join(",");

/** Omhullende rechthoek van een (multi)polygoon, als bbox-tekst */
function omhulling(g: Geometrie): string {
  const pts = (g.type === "Polygon"
    ? g.coordinates
    : g.type === "MultiPolygon"
      ? g.coordinates.flat()
      : [[g.coordinates]]
  ).flat() as unknown as Ring;
  const xs = pts.map((c) => c[0]),
    ys = pts.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    .map((n) => n.toFixed(7))
    .join(",");
}

const tekst = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** Monumentnummer uit een registerlink van de RCE, of null */
export function monumentNummer(link: string): string | null {
  const m = /^https:\/\/monumentenregister\.cultureelerfgoed\.nl\/monumenten\/(\d{1,8})$/.exec(
    link,
  );
  return m ? m[1]! : null;
}

/** De keuze met de hoogste waardering: rijksmonument, dan gemeentelijk, dan stadsgezicht */
export function monumentVoorstel(
  s: Omit<MonumentStatus, "voorstel" | "adres">,
): MonumentSoort | null {
  if (s.rijksmonument) return "rijks";
  if (s.gemeentelijkMonument) return "gemprov";
  if (s.gezichten.length) return "stads";
  return null;
}

export async function haal(
  fetchFn: typeof fetch,
  dienst: string,
  url: string,
  init: RequestInit = {},
) {
  const r = await haalJson(fetchFn, url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers as Record<string, string>) },
  });
  if (r.status === 200) return { ok: true as const, json: r.json };
  const fout: OpzoekFout =
    r.status === 0
      ? "dienst_onbereikbaar"
      : r.status === 429
        ? "te_veel_verzoeken"
        : "dienst_onbereikbaar";
  logFout(dienst, fout, r.status || undefined);
  return { ok: false as const, fout };
}

/** De monumentstatus van een adres; zie de toelichting bovenaan */
export async function zoekMonumentStatus(
  fetchFn: typeof fetch,
  vraag: EpVraag,
): Promise<Opzoeking<MonumentStatus>> {
  const v = EpVraagSchema.safeParse(vraag);
  if (!v.success) return { ok: false, fout: "ongeldige_invoer" };

  // 1. adres
  const a = await haal(fetchFn, "PDOK", locatieUrl(v.data));
  if (!a.ok) return a;
  const loc = LocatieSchema.safeParse(a.json);
  const doc = loc.success ? kiesAdres(loc.data.response.docs, v.data) : undefined;
  const punt = doc ? leesPunt(doc.centroide_ll) : null;
  if (!doc || !punt) return { ok: false, fout: "niet_gevonden" };

  // 2. Kadaster, en tegelijk 3. pand en het stadsgezicht
  const [k, p, gz] = await Promise.all([
    haal(fetchFn, "Kadaster", KKG_URL, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query: kadasterQuery(doc.nummeraanduiding_id) }).toString(),
    }),
    haal(fetchFn, "BAG", `${BAG_PAND_URL}?f=json&limit=10&bbox=${bbox(punt, 0.00003)}`),
    haal(
      fetchFn,
      "RCE",
      `${RCE_URL}/rce_inspire_polygons/items?f=json&limit=50&bbox=${bbox(punt, 0.00003)}`,
    ),
  ]);
  if (!k.ok) return k;
  if (!p.ok) return p;
  if (!gz.ok) return gz;
  const kad = leesKadaster(k.json);
  const panden = FeaturesSchema.safeParse(p.json);
  const vlakken = FeaturesSchema.safeParse(gz.json);
  if (!kad || !panden.success || !vlakken.success) {
    logFout("monument", "dienst_onbereikbaar");
    return { ok: false, fout: "dienst_onbereikbaar" };
  }
  const gezichten = [
    ...new Set(
      vlakken.data.features
        .filter(
          (f) =>
            tekst(f.properties?.["namespace"]) === "nlps-stadsendorpsgezichten" &&
            puntInVlak(punt, f.geometry),
        )
        .map((f) => tekst(f.properties?.["text"]))
        .filter(Boolean),
    ),
  ];

  // 4. rijksmonumenten in het pand
  const pand = panden.data.features.find((f) => puntInVlak(punt, f.geometry));
  let nummers: string[] = [];
  if (pand?.geometry) {
    const m = await haal(
      fetchFn,
      "RCE",
      `${RCE_URL}/rce_inspire_points/items?f=json&limit=100&bbox=${omhulling(pand.geometry)}`,
    );
    if (!m.ok) return m;
    const punten = FeaturesSchema.safeParse(m.json);
    if (!punten.success) return { ok: false, fout: "dienst_onbereikbaar" };
    nummers = [
      ...new Set(
        punten.data.features
          .filter(
            (f) =>
              tekst(f.properties?.["namespace"]) === "nlps-rijksmonumenten" &&
              f.geometry?.type === "Point" &&
              puntInVlak([f.geometry.coordinates[0], f.geometry.coordinates[1]], pand.geometry),
          )
          .map((f) => monumentNummer(tekst(f.properties?.["ci_citation"])))
          .filter((n): n is string => !!n),
      ),
    ].sort((x, y) => Number(x) - Number(y));
  }

  const s = {
    rijksmonument: kad.rijks || nummers.length > 0,
    rijksmonumentNummers: nummers,
    gemeentelijkMonument: kad.gemeentelijk,
    gezichten,
  };
  return { ok: true, data: { adres: doc.weergavenaam, ...s, voorstel: monumentVoorstel(s) } };
}

/** Nederlandse melding per foutcode */
export function monumentFoutMelding(fout: OpzoekFout | "geen_verbinding"): string {
  switch (fout) {
    case "niet_gevonden":
      return "Dit adres is niet gevonden in de BAG. Controleer postcode en huisnummer.";
    case "ongeldige_invoer":
      return "Vul eerst een geldige postcode en huisnummer in.";
    case "te_veel_verzoeken":
      return "Even te veel verzoeken bij het Kadaster of PDOK. Probeer het over een minuut opnieuw.";
    case "geen_verbinding":
      return "Kon geen verbinding maken met de server.";
    default:
      return "Het Kadaster of PDOK is op dit moment niet bereikbaar. Probeer het later opnieuw.";
  }
}
