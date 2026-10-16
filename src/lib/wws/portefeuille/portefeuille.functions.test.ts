import { describe, expect, it, vi } from "vitest";
import { PortieSchema, haalPortie } from "./portefeuille.functions";

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
