import { describe, expect, it, vi } from "vitest";
import { PortieSchema, haalPortie, vulAanPortie } from "./portefeuille.functions";

const adres = (i: number) => ({
  id: "00000000-0000-4000-8000-00000000000" + i,
  postcode: "1053ZD",
  huisnummer: i,
  huisletter: i === 2 ? "A" : "",
  toevoeging: i === 3 ? "2" : "",
});
const antwoord = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("EP-Online in porties", () => {
  it("wacht vóór elke aanvraag, vraagt met huisletter/toevoeging, en geeft per adres een resultaat", async () => {
    const fetchFn = vi
      .fn()
      .mockReturnValueOnce(antwoord(200, [{ Energieklasse: "B", Registratiedatum: "2022-01-01" }]))
      .mockReturnValueOnce(antwoord(404, null))
      .mockReturnValueOnce(
        antwoord(200, [
          { Energieklasse: "B", Registratiedatum: "2022-01-01" },
          { Energieklasse: "E", Registratiedatum: "2015-01-01" },
        ]),
      );
    const slaap = vi.fn(async () => {});
    const r = await haalPortie(
      fetchFn as unknown as typeof fetch,
      "sleutel",
      500,
      [adres(1), adres(2), adres(3)],
      slaap,
    );
    expect(slaap.mock.calls).toEqual([[500], [500], [500]]);
    const url = (i: number) => new URL(String(fetchFn.mock.calls[i]![0]));
    expect(url(1).searchParams.get("huisletter")).toBe("A");
    expect(url(2).searchParams.get("huisnummertoevoeging")).toBe("2");
    expect(fetchFn.mock.calls[0]![1].headers.Authorization).toBe("sleutel");
    expect(r.stop).toBeUndefined();
    expect(r.resultaten.map((x) => x.resultaat.status)).toEqual([
      "gevonden",
      "niet_gevonden",
      "meerdere",
    ]);
  });

  it("stopt bij te veel verzoeken; wat al binnen is komt mee", async () => {
    const fetchFn = vi
      .fn()
      .mockReturnValueOnce(antwoord(200, [{ Energieklasse: "A", Registratiedatum: "2023-01-01" }]))
      .mockReturnValueOnce(antwoord(429, null));
    const r = await haalPortie(
      fetchFn as unknown as typeof fetch,
      "s",
      0,
      [adres(1), adres(2), adres(3)],
      async () => {},
    );
    expect(r.stop).toBe("te_veel_verzoeken");
    expect(r.resultaten).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("zonder sleutel: meteen stoppen, geen aanvragen", async () => {
    const fetchFn = vi.fn();
    const r = await haalPortie(
      fetchFn as unknown as typeof fetch,
      undefined,
      0,
      [adres(1)],
      async () => {},
    );
    expect(r).toEqual({ resultaten: [], stop: "sleutel_ontbreekt" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("invoer: maximaal 10 adressen, alleen genormaliseerde velden", () => {
    expect(
      PortieSchema.safeParse({ adressen: Array.from({ length: 11 }, (_, i) => adres(i % 9)) })
        .success,
    ).toBe(false);
    expect(
      PortieSchema.safeParse({ adressen: [{ ...adres(1), postcode: "1053 zd" }] }).success,
    ).toBe(false);
    expect(PortieSchema.safeParse({ adressen: [adres(1)] }).success).toBe(true);
  });
});

describe("straat en woonplaats via PDOK", () => {
  const pdok = (straat: string, plaats: string) =>
    antwoord(200, { response: { docs: [{ straatnaam: straat, woonplaatsnaam: plaats }] } });

  it("één vraag per postcode + huisnummer, voor alle letters en toevoegingen", async () => {
    const fetchFn = vi.fn(() => pdok("  Kinker\u0000straat ", "Amsterdam"));
    const slaap = vi.fn(async () => {});
    const a = (i: number, nr: number) => ({
      id: "00000000-0000-4000-8000-00000000000" + i,
      postcode: "1053ZD",
      huisnummer: nr,
    });
    const r = await vulAanPortie(
      fetchFn as unknown as typeof fetch,
      250,
      [a(1, 49), a(2, 49), a(3, 50)],
      slaap,
    );
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(slaap.mock.calls).toEqual([[250], [250]]);
    expect(r.aangevuld).toEqual([
      { id: a(1, 49).id, straat: "Kinker straat", woonplaats: "Amsterdam" },
      { id: a(2, 49).id, straat: "Kinker straat", woonplaats: "Amsterdam" },
      { id: a(3, 50).id, straat: "Kinker straat", woonplaats: "Amsterdam" },
    ]);
    expect(r.stop).toBeUndefined();
  });

  it("niet gevonden telt per adres; te veel verzoeken stopt", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockReturnValueOnce(antwoord(200, { response: { docs: [] } }))
      .mockReturnValueOnce(antwoord(429, null));
    const a = (i: number) => ({
      id: "00000000-0000-4000-8000-00000000000" + i,
      postcode: "1053ZD",
      huisnummer: i,
    });
    const r = await vulAanPortie(
      fetchFn as unknown as typeof fetch,
      0,
      [a(1), a(2), a(3)],
      async () => {},
    );
    expect(r.nietGevonden).toEqual([a(1).id]);
    expect(r.aangevuld).toEqual([]);
    expect(r.stop).toBe("te_veel_verzoeken");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
