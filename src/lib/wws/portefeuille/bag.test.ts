import { describe, expect, it, vi } from "vitest";
import { BAG_URL, LOCATIESERVER_URL, haalBagPortie, vboUrl, zoekUrl, type BagVraag } from "./bag";

const PAND = BAG_URL + "/pand/items/";
const ID = (n: number) => "036301000000000" + n; // 16 cijfers
const zoek = (docs: Record<string, unknown>[]) => ({ response: { docs } });
const vbo = (props: Record<string, unknown>) => ({ features: [{ properties: props }] });
const antwoord = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const vraag = (id: string, hn: number, huisletter = "", toevoeging = ""): BagVraag => ({
  id,
  postcode: "1053ZD",
  huisnummer: hn,
  huisletter,
  toevoeging,
});
const geenSlaap = async () => {};

/** Nep-PDOK: zoekvraag → docs, verblijfsobject op id → props, pand → bouwjaar */
function nepPdok(
  docs: Record<string, unknown>[],
  vbos: Record<string, Record<string, unknown>>,
  bouwjaar = 1932,
) {
  return vi.fn((url: string) => {
    if (url.startsWith(LOCATIESERVER_URL)) return antwoord(200, zoek(docs));
    if (url.startsWith(PAND)) return antwoord(200, { properties: { bouwjaar } });
    const id = new URL(url).searchParams.get("identificatie")!;
    return vbos[id] ? antwoord(200, vbo(vbos[id]!)) : antwoord(200, { features: [] });
  });
}

describe("BAG ophalen (Locatieserver → verblijfsobject op id → pand)", () => {
  it("kiest op huisletter en toevoeging; één zoekvraag per nummer, bouwjaar één keer per pand", async () => {
    const fetchFn = nepPdok(
      [
        { adresseerbaarobject_id: ID(1), huisletter: null, huisnummertoevoeging: null },
        { adresseerbaarobject_id: ID(2), huisletter: "A", huisnummertoevoeging: null },
        { adresseerbaarobject_id: ID(3), huisletter: null, huisnummertoevoeging: "2" },
      ],
      {
        [ID(1)]: { oppervlakte: 62, gebruiksdoel: "woonfunctie", "pand.href": [PAND + "p1"] },
        [ID(2)]: { oppervlakte: 48, gebruiksdoel: "woonfunctie", "pand.href": [PAND + "p1"] },
        [ID(3)]: { oppervlakte: 70, "pand.href": [PAND + "p1"] },
      },
    );
    const slaap = vi.fn(geenSlaap);
    const r = await haalBagPortie(
      fetchFn as unknown as typeof fetch,
      100,
      [vraag("a", 12), vraag("b", 12, "a"), vraag("c", 12, "", "2"), vraag("d", 12, "", "9")],
      slaap,
    );
    expect(r.stop).toBeUndefined();
    expect(r.resultaten.map((x) => [x.id, x.resultaat])).toEqual([
      ["a", { status: "gevonden", oppervlakte: 62, bouwjaar: 1932, gebruiksdoel: "woonfunctie" }],
      ["b", { status: "gevonden", oppervlakte: 48, bouwjaar: 1932, gebruiksdoel: "woonfunctie" }],
      ["c", { status: "gevonden", oppervlakte: 70, bouwjaar: 1932, gebruiksdoel: null }],
      ["d", { status: "niet_gevonden", oppervlakte: null, bouwjaar: null, gebruiksdoel: null }],
    ]);
    // 1 zoekvraag + 3 verblijfsobjecten + 1 pand
    const urls = fetchFn.mock.calls.map((c) => c[0]);
    expect(urls[0]).toBe(zoekUrl("1053ZD", 12));
    expect(urls.filter((u) => u.startsWith(PAND))).toHaveLength(1);
    expect(urls).toContain(vboUrl(ID(1)));
    expect(fetchFn).toHaveBeenCalledTimes(5);
    expect(slaap.mock.calls.every((c) => (c as unknown[])[0] === 100)).toBe(true);
  });

  it("negeert pand-links naar een andere site, vreemde velden en ids die geen BAG-id zijn", async () => {
    const fetchFn = nepPdok(
      [{ adresseerbaarobject_id: ID(1), huisletter: null, huisnummertoevoeging: null, x: "y" }],
      {
        [ID(1)]: {
          oppervlakte: 55,
          geheim: "x",
          "pand.href": ["https://evil.example/pand/items/p1"],
        },
      },
    );
    const r = await haalBagPortie(
      fetchFn as unknown as typeof fetch,
      0,
      [vraag("a", 1)],
      geenSlaap,
    );
    expect(r.resultaten[0]!.resultaat).toEqual({
      status: "gevonden",
      oppervlakte: 55,
      bouwjaar: null,
      gebruiksdoel: null,
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const vreemd = nepPdok([{ adresseerbaarobject_id: "../../x", huisletter: null }], {});
    const r2 = await haalBagPortie(
      vreemd as unknown as typeof fetch,
      0,
      [vraag("a", 1)],
      geenSlaap,
    );
    expect(r2.resultaten[0]!.resultaat.status).toBe("fout");
    expect(vreemd).toHaveBeenCalledTimes(1);
  });

  it("meerdere ids op één adres, geen verblijfsobject of 404 gelden per adres", async () => {
    const twee = nepPdok(
      [
        { adresseerbaarobject_id: ID(1), huisletter: null },
        { adresseerbaarobject_id: ID(2), huisletter: null },
      ],
      {},
    );
    const r = await haalBagPortie(twee as unknown as typeof fetch, 0, [vraag("a", 1)], geenSlaap);
    expect(r.resultaten[0]!.resultaat.status).toBe("meerdere");

    const zonderVbo = nepPdok([{ adresseerbaarobject_id: ID(1), huisletter: null }], {});
    const r2 = await haalBagPortie(
      zonderVbo as unknown as typeof fetch,
      0,
      [vraag("a", 1)],
      geenSlaap,
    );
    expect(r2.resultaten[0]!.resultaat.status).toBe("fout");

    const nietGevonden = vi.fn(() => antwoord(404, null));
    const r3 = await haalBagPortie(
      nietGevonden as unknown as typeof fetch,
      0,
      [vraag("a", 1)],
      geenSlaap,
    );
    expect(r3.stop).toBeUndefined();
    expect(r3.resultaten[0]!.resultaat.status).toBe("fout");
  });

  it("stopt bij te veel verzoeken of een storing; wat binnen is komt mee", async () => {
    const fetchFn = vi
      .fn()
      .mockReturnValueOnce(antwoord(200, zoek([{ adresseerbaarobject_id: ID(1) }])))
      .mockReturnValueOnce(antwoord(200, vbo({ oppervlakte: 40 })))
      .mockReturnValueOnce(antwoord(429, null));
    const r = await haalBagPortie(
      fetchFn as unknown as typeof fetch,
      0,
      [vraag("a", 1), vraag("b", 2), vraag("c", 3)],
      geenSlaap,
    );
    expect(r.stop).toBe("te_veel_verzoeken");
    expect(r.resultaten.map((x) => x.id)).toEqual(["a"]);

    const kapot = vi.fn(() => Promise.reject(new Error("netwerk")));
    const r2 = await haalBagPortie(kapot as unknown as typeof fetch, 0, [vraag("a", 1)], geenSlaap);
    expect(r2).toEqual({ resultaten: [], stop: "dienst_onbereikbaar" });
  });

  it("volgt geen doorverwijzing (manual) en telt die als fout per adres", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response(null, { status: 302 })));
    const r = await haalBagPortie(
      fetchFn as unknown as typeof fetch,
      0,
      [vraag("a", 1)],
      geenSlaap,
    );
    expect(r.stop).toBeUndefined();
    expect(r.resultaten[0]!.resultaat.status).toBe("fout");
    expect((fetchFn.mock.calls[0] as unknown[])[1]).toMatchObject({ redirect: "manual" });
  });
});
