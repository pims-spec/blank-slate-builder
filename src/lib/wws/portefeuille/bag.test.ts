import { describe, expect, it, vi } from "vitest";
import { BAG_URL, haalBagPortie, vboUrl, type BagVraag } from "./bag";

const PAND = BAG_URL + "/pand/items/";
const vbo = (props: Record<string, unknown>[]) => ({
  type: "FeatureCollection",
  features: props.map((p) => ({ properties: { huisletter: null, toevoeging: null, ...p } })),
});
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

describe("BAG ophalen", () => {
  it("kiest op huisletter en toevoeging, en vraagt het bouwjaar één keer per pand", async () => {
    const fetchFn = vi.fn((url: string) => {
      if (url.startsWith(PAND)) return antwoord(200, { properties: { bouwjaar: 1932 } });
      return antwoord(
        200,
        vbo([
          { oppervlakte: 62, gebruiksdoel: "woonfunctie", "pand.href": [PAND + "p1"] },
          {
            oppervlakte: 48,
            gebruiksdoel: "woonfunctie",
            huisletter: "A",
            "pand.href": [PAND + "p1"],
          },
          { oppervlakte: 70, toevoeging: "2", "pand.href": [PAND + "p1"] },
        ]),
      );
    });
    const slaap = vi.fn(geenSlaap);
    const r = await haalBagPortie(
      fetchFn as unknown as typeof fetch,
      250,
      [vraag("a", 12), vraag("b", 12, "a"), vraag("c", 12, "", "2"), vraag("d", 12, "", "9")],
      slaap,
    );
    expect(r.stop).toBeUndefined();
    expect(r.resultaten).toEqual([
      {
        id: "a",
        resultaat: {
          status: "gevonden",
          oppervlakte: 62,
          bouwjaar: 1932,
          gebruiksdoel: "woonfunctie",
        },
      },
      {
        id: "b",
        resultaat: {
          status: "gevonden",
          oppervlakte: 48,
          bouwjaar: 1932,
          gebruiksdoel: "woonfunctie",
        },
      },
      {
        id: "c",
        resultaat: { status: "gevonden", oppervlakte: 70, bouwjaar: 1932, gebruiksdoel: null },
      },
      {
        id: "d",
        resultaat: {
          status: "niet_gevonden",
          oppervlakte: null,
          bouwjaar: null,
          gebruiksdoel: null,
        },
      },
    ]);
    // één vraag voor het nummer, één voor het pand
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0]![0]).toBe(vboUrl("1053ZD", 12));
    expect(slaap.mock.calls).toEqual([[250], [250]]);
  });

  it("negeert pand-links naar een andere site en vreemde velden", async () => {
    const fetchFn = vi.fn(() =>
      antwoord(
        200,
        vbo([
          {
            oppervlakte: 55,
            geheim: "x",
            "pand.href": ["https://evil.example/pand/items/p1"],
          },
        ]),
      ),
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
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("meerdere treffers, ongeldig antwoord en 404 gelden per adres", async () => {
    const fetchFn = vi
      .fn()
      .mockReturnValueOnce(antwoord(200, vbo([{ oppervlakte: 40 }, { oppervlakte: 41 }])))
      .mockReturnValueOnce(antwoord(200, { features: "geen lijst" }))
      .mockReturnValueOnce(antwoord(404, null));
    const r = await haalBagPortie(
      fetchFn as unknown as typeof fetch,
      0,
      [vraag("a", 1), vraag("b", 2), vraag("c", 3)],
      geenSlaap,
    );
    expect(r.stop).toBeUndefined();
    expect(r.resultaten.map((x) => x.resultaat.status)).toEqual(["meerdere", "fout", "fout"]);
  });

  it("stopt bij te veel verzoeken of een storing; wat binnen is komt mee", async () => {
    const fetchFn = vi
      .fn()
      .mockReturnValueOnce(antwoord(200, vbo([{ oppervlakte: 40 }])))
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
