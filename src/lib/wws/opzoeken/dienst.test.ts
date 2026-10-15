import { afterEach, describe, expect, it, vi } from "vitest";
import { EP_URL, zoekAdresBijPdok, zoekEnergielabelBijEpOnline } from "./dienst";
import { leesEpAntwoord } from "./eponline";
import { adresOpzoekenNodig, adresToepassen, leesPdokAntwoord } from "./pdok";
import { legeMeta } from "../opslag/doc";

/** Nep-fetch die één antwoord geeft en de aanroepen bewaart */
function nepFetch(status: number, body: unknown, gooit = false) {
  const aanroepen: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    aanroepen.push({ url, init });
    if (gooit) throw new Error("netwerk: geheim detail");
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, aanroepen };
}

const waarschuwingen: string[] = [];
vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
  waarschuwingen.push(a.join(" "));
});
afterEach(() => {
  waarschuwingen.length = 0;
});

describe("PDOK", () => {
  it("leest straat en plaats en negeert de rest", async () => {
    const { fn, aanroepen } = nepFetch(200, {
      response: {
        numFound: 1,
        docs: [{ straatnaam: "Damrak", woonplaatsnaam: "Amsterdam", extra: "x" }],
      },
    });
    const r = await zoekAdresBijPdok(fn, { postcode: "1012 lg", huisnummer: "1" });
    expect(r).toEqual({ ok: true, data: { straat: "Damrak", plaats: "Amsterdam" } });
    const u = new URL(aanroepen[0]!.url);
    expect(u.host).toBe("api.pdok.nl");
    expect(u.searchParams.get("q")).toBe("postcode:1012LG and huisnummer:1 and type:adres");
  });

  it("ongeldige invoer gaat niet naar buiten", async () => {
    const { fn, aanroepen } = nepFetch(200, {});
    for (const v of [
      { postcode: "0123AB", huisnummer: "1" },
      { postcode: "1234AB", huisnummer: "1 or 1=1" },
      { postcode: "1234AB) or (x", huisnummer: "1" },
    ])
      expect(await zoekAdresBijPdok(fn, v)).toEqual({ ok: false, fout: "ongeldige_invoer" });
    expect(aanroepen).toHaveLength(0);
  });

  it("foutcodes, zonder doorgeven of loggen van de foutdetails", async () => {
    const geheim = "interne fout bij 1234AB 12";
    expect(
      await zoekAdresBijPdok(nepFetch(429, geheim).fn, { postcode: "1234AB", huisnummer: "12" }),
    ).toEqual({
      ok: false,
      fout: "te_veel_verzoeken",
    });
    expect(
      await zoekAdresBijPdok(nepFetch(503, geheim).fn, { postcode: "1234AB", huisnummer: "12" }),
    ).toEqual({
      ok: false,
      fout: "dienst_onbereikbaar",
    });
    expect(
      await zoekAdresBijPdok(nepFetch(0, null, true).fn, { postcode: "1234AB", huisnummer: "12" }),
    ).toEqual({
      ok: false,
      fout: "dienst_onbereikbaar",
    });
    expect(
      await zoekAdresBijPdok(nepFetch(200, { response: { docs: [] } }).fn, {
        postcode: "1234AB",
        huisnummer: "12",
      }),
    ).toEqual({
      ok: false,
      fout: "niet_gevonden",
    });
    expect(waarschuwingen.join("\n")).not.toMatch(/geheim|interne|1234AB/);
  });

  it("leesPdokAntwoord weigert vreemde vormen en te lange teksten", () => {
    expect(leesPdokAntwoord(null)).toBeNull();
    expect(leesPdokAntwoord({ response: { docs: "x" } })).toBeNull();
    expect(leesPdokAntwoord({ response: { docs: [{ straatnaam: 5 }] } })).toBeNull();
    expect(leesPdokAntwoord({ response: { docs: [{ straatnaam: "x".repeat(201) }] } })).toBeNull();
  });

  it("adresToepassen vult alleen lege velden en een lege naam", () => {
    const meta = { ...legeMeta(), postcode: "1012LG", huisnummer: "1" };
    expect(adresOpzoekenNodig(meta)).toBe(true);
    const m = adresToepassen(meta, { straat: "Damrak", plaats: "Amsterdam" })!;
    expect(m).toMatchObject({ adres: "Damrak", plaats: "Amsterdam", naam: "Damrak 1, Amsterdam" });
    expect(m["auto"]).toEqual({ adres: true, plaats: true });
    expect(meta.adres).toBe(""); // origineel ongewijzigd
    expect(adresOpzoekenNodig(m)).toBe(false);
    expect(adresToepassen(m, { straat: "Anders", plaats: "Elders" })).toBeNull();
    const metNaam = adresToepassen(
      { ...meta, naam: "Mijn woning" },
      { straat: "Damrak", plaats: "" },
    )!;
    expect(metNaam.naam).toBe("Mijn woning");
  });
});

describe("EP-Online", () => {
  const vraag = { postcode: "1234ab", huisnummer: "12", huisletter: "a", huisnummertoevoeging: "" };

  it("zonder sleutel: geen aanroep", async () => {
    const { fn, aanroepen } = nepFetch(200, []);
    expect(await zoekEnergielabelBijEpOnline(fn, undefined, vraag)).toEqual({
      ok: false,
      fout: "sleutel_ontbreekt",
    });
    expect(await zoekEnergielabelBijEpOnline(fn, "", vraag)).toEqual({
      ok: false,
      fout: "sleutel_ontbreekt",
    });
    expect(aanroepen).toHaveLength(0);
  });

  it("stuurt de sleutel kaal mee en leest alleen de bekende velden", async () => {
    const { fn, aanroepen } = nepFetch(200, [
      {
        Energieklasse: "B",
        Registratiedatum: "2022-05-01T00:00:00",
        Bouwjaar: 1975,
        Postcode: "1234AB",
        Geheim: "x",
      },
    ]);
    const r = await zoekEnergielabelBijEpOnline(fn, "SLEUTEL", vraag);
    expect(r).toEqual({
      ok: true,
      data: { Energieklasse: "B", Registratiedatum: "2022-05-01T00:00:00", Bouwjaar: 1975 },
    });
    const { url, init } = aanroepen[0]!;
    expect(url.startsWith(EP_URL + "?")).toBe(true);
    const qs = new URL(url).searchParams;
    expect([qs.get("postcode"), qs.get("huisnummer"), qs.get("huisletter")]).toEqual([
      "1234AB",
      "12",
      "A",
    ]);
    expect(qs.has("huisnummertoevoeging")).toBe(false);
    expect(new Headers(init.headers).get("Authorization")).toBe("SLEUTEL");
  });

  it("foutcodes per status, zonder sleutel of details in de log", async () => {
    const cases: [number, string][] = [
      [401, "sleutel_ongeldig"],
      [403, "sleutel_ongeldig"],
      [404, "niet_gevonden"],
      [429, "te_veel_verzoeken"],
      [500, "dienst_onbereikbaar"],
    ];
    for (const [status, fout] of cases)
      expect(
        await zoekEnergielabelBijEpOnline(nepFetch(status, "detail 1234AB").fn, "SLEUTEL", vraag),
      ).toEqual({
        ok: false,
        fout,
      });
    expect(await zoekEnergielabelBijEpOnline(nepFetch(200, []).fn, "SLEUTEL", vraag)).toEqual({
      ok: false,
      fout: "niet_gevonden",
    });
    expect(waarschuwingen.join("\n")).not.toMatch(/SLEUTEL|detail|1234AB/);
  });

  it("leesEpAntwoord: alleen een lijst, slaat ongeldige items over", () => {
    expect(leesEpAntwoord({ Energieklasse: "A" })).toBeNull();
    expect(leesEpAntwoord([{ Energieklasse: { x: 1 } }, { Energieklasse: "C" }])).toEqual({
      Energieklasse: "C",
    });
    expect(leesEpAntwoord([{ Gebouwtype: "x".repeat(101) }])).toBeNull();
    expect(leesEpAntwoord(Array(51).fill({ Energieklasse: "A" }))).toBeNull();
  });
});

describe("venster Nieuwe telling (nieuweTellingDoorgaan)", () => {
  it("zelfde validatie en opmaak als de bron", async () => {
    const { nieuweTellingAdres } = await import("./pdok");
    expect(nieuweTellingAdres("1234ab", " 12 A ")).toEqual({
      postcode: "1234 AB",
      huisnummer: "12 A",
    });
    expect(nieuweTellingAdres("1234 AB", "12-2")).toEqual({
      postcode: "1234 AB",
      huisnummer: "12-2",
    });
    expect(nieuweTellingAdres("1234 A", "12")).toBeNull();
    expect(nieuweTellingAdres("123456", "12")).toBeNull();
    expect(nieuweTellingAdres("1234AB", "A12")).toBeNull();
    expect(nieuweTellingAdres("1234AB", "")).toBeNull();
    // de bron accepteert ook 0123: alleen \d{4}[A-Z]{2}
    expect(nieuweTellingAdres("0123AB", "1")).toEqual({ postcode: "0123 AB", huisnummer: "1" });
  });
});
