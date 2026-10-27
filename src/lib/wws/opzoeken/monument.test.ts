import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BAG_PAND_URL,
  KKG_URL,
  RCE_URL,
  kadasterQuery,
  kiesAdres,
  leesKadaster,
  leesPunt,
  monumentFoutMelding,
  monumentNummer,
  puntInVlak,
  zoekMonumentStatus,
} from "./monument";

const waarschuwingen: string[] = [];
vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
  waarschuwingen.push(a.join(" "));
});
afterEach(() => {
  waarschuwingen.length = 0;
});

// Het adrespunt en een vierkant pand eromheen (en een buurpand ernaast)
const P: [number, number] = [4.887368, 52.376403];
const vierkant = (x: number, y: number, d: number) => [
  [
    [x - d, y - d],
    [x + d, y - d],
    [x + d, y + d],
    [x - d, y + d],
    [x - d, y - d],
  ],
];
const PAND = { type: "Polygon", coordinates: vierkant(P[0], P[1], 0.00005) };
const BUURPAND = { type: "Polygon", coordinates: vierkant(P[0] + 0.0002, P[1], 0.00005) };

const locatie = (docs: unknown[] = [adresDoc()]) => ({ response: { docs } });
const adresDoc = (over: Record<string, unknown> = {}) => ({
  weergavenaam: "Keizersgracht 123, 1015CJ Amsterdam",
  nummeraanduiding_id: "0363200000161899",
  centroide_ll: `POINT(${P[0]} ${P[1]})`,
  ...over,
});
const kadaster = (...codes: string[]) => ({
  results: { bindings: codes.map((c) => ({ grondslagcode: { type: "literal", value: c } })) },
});
const features = (fs: unknown[]) => ({ type: "FeatureCollection", features: fs });
const monumentPunt = (nr: string, x: number, y: number) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [x, y] },
  properties: {
    namespace: "nlps-rijksmonumenten",
    ci_citation: "https://monumentenregister.cultureelerfgoed.nl/monumenten/" + nr,
  },
});
const gezicht = (naam: string, geometry: unknown) => ({
  type: "Feature",
  geometry,
  properties: { namespace: "nlps-stadsendorpsgezichten", text: naam },
});

interface Antwoorden {
  locatie?: unknown;
  kadaster?: unknown;
  panden?: unknown;
  vlakken?: unknown;
  punten?: unknown;
  status?: Partial<Record<"locatie" | "kadaster" | "panden" | "vlakken" | "punten", number>>;
}

/** Nagebootste PDOK, Kadaster en RCE: het antwoord hangt af van de URL */
function nepFetch(a: Antwoorden) {
  const aanroepen: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    aanroepen.push({ url, init });
    const soort = url.startsWith(KKG_URL)
      ? "kadaster"
      : url.startsWith(BAG_PAND_URL)
        ? "panden"
        : url.startsWith(RCE_URL + "/rce_inspire_polygons")
          ? "vlakken"
          : url.startsWith(RCE_URL + "/rce_inspire_points")
            ? "punten"
            : "locatie";
    const body =
      soort === "locatie"
        ? (a.locatie ?? locatie())
        : soort === "kadaster"
          ? (a.kadaster ?? kadaster())
          : soort === "panden"
            ? (a.panden ?? features([{ type: "Feature", geometry: PAND, properties: {} }]))
            : soort === "vlakken"
              ? (a.vlakken ?? features([]))
              : (a.punten ?? features([]));
    return new Response(JSON.stringify(body), { status: a.status?.[soort] ?? 200 });
  }) as unknown as typeof fetch;
  return { fn, aanroepen };
}

const vraag = { postcode: "1015 cj", huisnummer: "123" };

describe("zoekMonumentStatus", () => {
  it("rijksmonument in het pand en beschermd stadsgezicht; een monument in het buurpand telt niet", async () => {
    const { fn, aanroepen } = nepFetch({
      kadaster: kadaster("EWE"),
      panden: features([
        { type: "Feature", geometry: BUURPAND, properties: {} },
        { type: "Feature", geometry: PAND, properties: {} },
      ]),
      punten: features([
        monumentPunt("2249", P[0], P[1]),
        monumentPunt("2251", P[0] + 0.0002, P[1]),
      ]),
      vlakken: features([
        gezicht("Amsterdam - Binnen de Singelgracht", {
          type: "Polygon",
          coordinates: vierkant(P[0], P[1], 0.01),
        }),
        gezicht("Ergens anders", { type: "Polygon", coordinates: vierkant(5, 52, 0.01) }),
      ]),
    });
    const r = await zoekMonumentStatus(fn, vraag);
    expect(r).toEqual({
      ok: true,
      data: {
        adres: "Keizersgracht 123, 1015CJ Amsterdam",
        rijksmonument: true,
        rijksmonumentNummers: ["2249"],
        gemeentelijkMonument: false,
        gezichten: ["Amsterdam - Binnen de Singelgracht"],
        voorstel: "rijks",
      },
    });
    // het adres gaat naar PDOK als postcode en huisnummer, de SPARQL-vraag als POST-formulier
    expect(aanroepen[0]!.url).toContain(encodeURIComponent("postcode:1015CJ"));
    const kad = aanroepen.find((x) => x.url === KKG_URL)!;
    expect(kad.init.method).toBe("POST");
    expect(String(kad.init.body)).toContain("0363200000161899");
  });

  it("gemeentelijk monument (Kadaster GWA), zonder rijksmonument", async () => {
    const { fn } = nepFetch({ kadaster: kadaster("GWA", "HVA") });
    const r = await zoekMonumentStatus(fn, vraag);
    expect(r.ok && r.data).toMatchObject({
      rijksmonument: false,
      gemeentelijkMonument: true,
      gezichten: [],
      voorstel: "gemprov",
    });
  });

  it("alleen een stadsgezicht: voorstel stadsgezicht; niets: geen voorstel", async () => {
    const met = await zoekMonumentStatus(
      nepFetch({
        vlakken: features([
          gezicht("Kralingen - Midden", {
            type: "Polygon",
            coordinates: vierkant(P[0], P[1], 1e-3),
          }),
        ]),
      }).fn,
      vraag,
    );
    expect(met.ok && met.data.voorstel).toBe("stads");
    const niets = await zoekMonumentStatus(nepFetch({}).fn, vraag);
    expect(niets.ok && niets.data).toMatchObject({
      rijksmonument: false,
      gemeentelijkMonument: false,
      gezichten: [],
      voorstel: null,
    });
  });

  it("rijksmonument alleen volgens het Kadaster (geen RCE-punt): wel rijksmonument, geen nummer", async () => {
    const r = await zoekMonumentStatus(nepFetch({ kadaster: kadaster("EWD") }).fn, vraag);
    expect(r.ok && r.data).toMatchObject({ rijksmonument: true, rijksmonumentNummers: [] });
  });

  it("adres niet gevonden, ongeldige invoer en fouten van de diensten (zonder adres in de log)", async () => {
    expect(await zoekMonumentStatus(nepFetch({ locatie: locatie([]) }).fn, vraag)).toEqual({
      ok: false,
      fout: "niet_gevonden",
    });
    expect(await zoekMonumentStatus(nepFetch({}).fn, { postcode: "x", huisnummer: "1" })).toEqual({
      ok: false,
      fout: "ongeldige_invoer",
    });
    expect(await zoekMonumentStatus(nepFetch({ status: { kadaster: 429 } }).fn, vraag)).toEqual({
      ok: false,
      fout: "te_veel_verzoeken",
    });
    expect(await zoekMonumentStatus(nepFetch({ status: { vlakken: 500 } }).fn, vraag)).toEqual({
      ok: false,
      fout: "dienst_onbereikbaar",
    });
    expect(await zoekMonumentStatus(nepFetch({ kadaster: { onzin: true } }).fn, vraag)).toEqual({
      ok: false,
      fout: "dienst_onbereikbaar",
    });
    expect(waarschuwingen.join("\n")).not.toMatch(/1015|Keizersgracht/);
  });
});

describe("onderdelen", () => {
  it("kiesAdres: de juiste toevoeging of huisletter, anders het adres zonder", () => {
    const docs = [
      adresDoc({ weergavenaam: "49-1", huisnummertoevoeging: "1" }),
      adresDoc({ weergavenaam: "49-2", huisnummertoevoeging: "2" }),
      adresDoc({ weergavenaam: "49", huisletter: undefined }),
      adresDoc({ weergavenaam: "49A", huisletter: "A" }),
    ];
    expect(kiesAdres(docs, { huisletter: "", huisnummertoevoeging: "2" })!.weergavenaam).toBe(
      "49-2",
    );
    expect(kiesAdres(docs, { huisletter: "a", huisnummertoevoeging: "" })!.weergavenaam).toBe(
      "49A",
    );
    expect(kiesAdres(docs, { huisletter: "", huisnummertoevoeging: "" })!.weergavenaam).toBe("49");
  });

  it("leesPunt alleen in Nederland; puntInVlak houdt rekening met gaten", () => {
    expect(leesPunt("POINT(4.87 52.36)")).toEqual([4.87, 52.36]);
    expect(leesPunt("POINT(120055 486938)")).toBeNull();
    expect(leesPunt("LINESTRING(1 2, 3 4)")).toBeNull();
    const metGat = {
      type: "Polygon" as const,
      coordinates: [vierkant(5, 52, 1)[0]!, vierkant(5, 52, 0.1)[0]!] as [number, number][][],
    };
    expect(puntInVlak([5.5, 52.5], metGat)).toBe(true);
    expect(puntInVlak([5, 52], metGat)).toBe(false);
  });

  it("kadasterQuery alleen met een geldige nummeraanduiding; leesKadaster en monumentNummer", () => {
    expect(kadasterQuery("0363200000161899")).toContain("nummeraanduiding/0363200000161899>");
    expect(() => kadasterQuery('1"} . ?x ?y ?z {')).toThrow();
    expect(leesKadaster(kadaster("GG"))).toEqual({ gemeentelijk: true, rijks: false });
    expect(leesKadaster(kadaster("EWE"))).toEqual({ gemeentelijk: false, rijks: true });
    expect(leesKadaster(null)).toBeNull();
    expect(monumentNummer("https://monumentenregister.cultureelerfgoed.nl/monumenten/2249")).toBe(
      "2249",
    );
    expect(monumentNummer("https://elders.nl/monumenten/2249")).toBeNull();
    expect(monumentFoutMelding("niet_gevonden")).toMatch(/niet gevonden in de BAG/);
  });
});
