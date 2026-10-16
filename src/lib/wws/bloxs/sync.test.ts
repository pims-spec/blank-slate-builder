import { describe, expect, it, vi } from "vitest";
import {
  PAGINA,
  haalAdressen,
  haalEigenaren,
  haalObjectenPagina,
  testFuncties,
  testToegang,
  type Omgeving,
} from "./sync";
import { adresIds, complexen, idUitTekst, maakSyncPlan } from "./syncPlan";

const BASIS = "https://klant.bloxs.io/odatafeed";

/** Een nep-feed: per aanvraag een antwoord; telt de aanvragen */
function omgeving(antwoord: (url: URL) => Response | Promise<Response>) {
  const urls: URL[] = [];
  const fetchFn = vi.fn(async (u: string) => {
    const url = new URL(u);
    urls.push(url);
    return antwoord(url);
  });
  const slaap = vi.fn(async () => {});
  const o: Omgeving = {
    fetchFn: fetchFn as unknown as typeof fetch,
    cfg: { basis: BASIS, authorization: "Basic eA==" },
    wacht: 1000,
    slaap,
  };
  return { o, urls, slaap };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("testFuncties ($top=0)", () => {
  it("werkt: één aanvraag, zonder rijen, na wachten", async () => {
    const { o, urls, slaap } = omgeving(() => json({ value: [] }));
    expect(await testFuncties(o)).toEqual({ ok: true, data: true, aanvragen: 1 });
    expect(urls[0]!.searchParams.get("$top")).toBe("0");
    expect(urls[0]!.searchParams.get("$select")).toBe("OwnerId");
    expect(slaap).toHaveBeenCalledWith(1000);
  });

  it.each([
    [json({ error: "x" }, 400), "functie_niet_ondersteund"],
    [json({ error: "x" }, 501), "functie_niet_ondersteund"],
    [json({ value: [{ OwnerId: 1 }] }), "functie_niet_ondersteund"],
    [json({}, 401), "geweigerd"],
    [json({}, 429), "te_veel_verzoeken"],
  ])("anders: stoppen (%#)", async (res, fout) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { o } = omgeving(() => res);
    const r = await testFuncties(o);
    expect(r).toMatchObject({ ok: false, fout, aanvragen: 1 });
    // alleen het getal van de HTTP-status, nooit de inhoud van het antwoord
    expect(Object.keys(r).sort()).toEqual(
      res.status === 200 ? ["aanvragen", "fout", "ok"] : ["aanvragen", "fout", "ok", "status"],
    );
  });
});

describe("haalEigenaren", () => {
  it("pagineert met $skip, geeft alleen id, referentie en naam, gesorteerd", async () => {
    const eerste = Array.from({ length: PAGINA }, (_, i) => ({
      OwnerId: i + 10,
      Reference: "R" + i,
      DisplayName: "Eigenaar " + String(i).padStart(3, "0"),
      ArchiveDate: null,
    }));
    const { o, urls } = omgeving((u) =>
      json({
        value:
          u.searchParams.get("$skip") === String(PAGINA)
            ? [{ OwnerId: 1, Reference: null, DisplayName: " Aa\tWonen ", ArchiveDate: null }]
            : eerste,
      }),
    );
    const r = await haalEigenaren(o);
    expect(r.ok && r.data.length).toBe(PAGINA + 1);
    expect(r.ok && r.data[0]).toEqual({ id: 1, referentie: null, naam: "Aa Wonen" });
    expect(r.aanvragen).toBe(2);
    expect(urls[0]!.searchParams.get("$filter")).toBe("ArchiveDate eq null");
    expect(JSON.stringify(r)).not.toContain("ArchiveDate");
  });

  it("extra velden (zoals e-mail) → stoppen, niets terug", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { o } = omgeving(() =>
      json({ value: [{ OwnerId: 1, DisplayName: "X", Email: "a@b.nl", ArchiveDate: null }] }),
    );
    const r = await haalEigenaren(o);
    expect(r).toEqual({ ok: false, fout: "select_genegeerd", aanvragen: 1 });
    expect(JSON.stringify(r)).not.toContain("a@b.nl");
  });

  it("gearchiveerde eigenaar in het antwoord → filter genegeerd", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { o } = omgeving(() =>
      json({ value: [{ OwnerId: 1, DisplayName: "X", ArchiveDate: "2020-01-01" }] }),
    );
    expect(await haalEigenaren(o)).toMatchObject({ ok: false, fout: "filter_genegeerd" });
  });
});

describe("haalObjectenPagina", () => {
  const unit = (id: number, extra: Record<string, unknown> = {}) => ({
    RealEstateObjectId: id,
    Reference: "U" + id,
    OwnerId: 7,
    ComplexId: 3,
    ComplexName: "Complex Oost",
    AddressId: 100 + id,
    SalesDate: null,
    ...extra,
  });

  it("filtert op eigenaar (en complex), slaat verkochte objecten over", async () => {
    const { o, urls } = omgeving(() =>
      json({ value: [unit(1), unit(2, { SalesDate: "2020-05-01T00:00:00Z" }), unit(3)] }),
    );
    const r = await haalObjectenPagina(o, {
      soort: "unit",
      eigenaar: 7,
      complex: 3,
      cursor: { skip: 0 },
    });
    expect(urls[0]!.searchParams.get("$filter")).toBe("OwnerId eq 7 and ComplexId eq 3");
    expect(r.ok && r.data.objecten.map((x) => x.ref)).toEqual(["1", "3"]);
    expect(r.ok && r.data.objecten[0]).toEqual({
      ref: "1",
      soort: "unit",
      referentie: "U1",
      complexId: 3,
      complexNaam: "Complex Oost",
      adresId: 101,
    });
    expect(r.ok && r.data.volgende).toBeNull();
  });

  it("volle pagina → volgende $skip; nextLink van de feed gaat voor", async () => {
    const vol = Array.from({ length: PAGINA }, (_, i) => unit(i + 1));
    const a = omgeving(() => json({ value: vol }));
    const r1 = await haalObjectenPagina(a.o, {
      soort: "unit",
      eigenaar: 7,
      complex: null,
      cursor: { skip: 0 },
    });
    expect(r1.ok && r1.data.volgende).toEqual({ skip: PAGINA });
    const b = omgeving(() => json({ value: [unit(1)], "@odata.nextLink": BASIS + "/Units?x=1" }));
    const r2 = await haalObjectenPagina(b.o, {
      soort: "unit",
      eigenaar: 7,
      complex: null,
      cursor: { skip: 0 },
    });
    expect(r2.ok && r2.data.volgende).toEqual({ link: BASIS + "/Units?x=1" });
  });

  it("een link uit de browser naar elders: geweigerd zonder aanvraag", async () => {
    const { o, urls } = omgeving(() => json({ value: [] }));
    const r = await haalObjectenPagina(o, {
      soort: "unit",
      eigenaar: 7,
      complex: null,
      cursor: { link: BASIS + "/Persons" },
    });
    expect(r).toEqual({ ok: false, fout: "volgende_link_ongeldig", aanvragen: 0 });
    expect(urls).toHaveLength(0);
  });

  it("buildings vragen geen complexvelden; huurder-id nooit", async () => {
    const { o, urls } = omgeving(() => json({ value: [] }));
    await haalObjectenPagina(o, {
      soort: "building",
      eigenaar: "AB",
      complex: null,
      cursor: { skip: 0 },
    });
    expect(urls[0]!.pathname).toBe("/odatafeed/Buildings");
    expect(urls[0]!.searchParams.get("$select")).toBe(
      "RealEstateObjectId,Reference,OwnerId,AddressId,SalesDate",
    );
    expect(urls[0]!.searchParams.get("$filter")).toBe("OwnerId eq 'AB'");
  });
});

describe("haalAdressen", () => {
  it("alleen de gevraagde ids; huisnummer gesplitst; niet te splitsen → ruw", async () => {
    const { o, urls } = omgeving(() =>
      json({
        value: [
          {
            AddressId: 1,
            PostalCode: "1053 zd",
            HouseNumber: "49A-2",
            Street: "Kinkerstraat",
            City: "Amsterdam",
          },
          { AddressId: 2, PostalCode: "1053ZD", HouseNumber: 12, Street: null, City: null },
          {
            AddressId: 3,
            PostalCode: "1053ZD",
            HouseNumber: "bij de kerk",
            Street: "X",
            City: "Y",
          },
        ],
      }),
    );
    const r = await haalAdressen(o, [1, 2, 3]);
    expect(urls[0]!.searchParams.get("$filter")).toBe(
      "(AddressId eq 1 or AddressId eq 2 or AddressId eq 3)",
    );
    expect(r.ok && r.data).toEqual([
      {
        adresId: "1",
        ok: true,
        postcode: "1053ZD",
        huisnummer: 49,
        huisletter: "A",
        toevoeging: "2",
        straat: "Kinkerstraat",
        woonplaats: "Amsterdam",
      },
      {
        adresId: "2",
        ok: true,
        postcode: "1053ZD",
        huisnummer: 12,
        huisletter: "",
        toevoeging: "",
        straat: null,
        woonplaats: null,
      },
      { adresId: "3", ok: false, ruw: "1053ZD bij de kerk" },
    ]);
  });

  it("een adres dat niet gevraagd is → filter genegeerd, niets terug", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { o } = omgeving(() =>
      json({
        value: [{ AddressId: 99, PostalCode: "1053ZD", HouseNumber: "1", Street: "P", City: "Q" }],
      }),
    );
    expect(await haalAdressen(o, [1])).toEqual({
      ok: false,
      fout: "filter_genegeerd",
      aanvragen: 1,
    });
  });

  it("te veel of geen ids: geen aanvraag", async () => {
    const { o, urls } = omgeving(() => json({ value: [] }));
    expect((await haalAdressen(o, [])).aanvragen).toBe(0);
    expect(
      (
        await haalAdressen(
          o,
          Array.from({ length: 51 }, (_, i) => i),
        )
      ).aanvragen,
    ).toBe(0);
    expect(urls).toHaveLength(0);
  });
});

describe("syncPlan", () => {
  const obj = (ref: string, adresId: number | null, soort: "unit" | "building" = "unit") => ({
    ref,
    soort,
    referentie: "R" + ref,
    complexId: soort === "unit" ? 3 : null,
    complexNaam: soort === "unit" ? "Oost" : null,
    adresId,
  });
  const adres = (id: string, hn: number, letter = "") => ({
    adresId: id,
    ok: true as const,
    postcode: "1053ZD",
    huisnummer: hn,
    huisletter: letter,
    toevoeging: "",
    straat: "Kinkerstraat",
    woonplaats: "Amsterdam",
  });

  it("gedeelde adressen één keer; zonder adres en niet te splitsen apart", () => {
    const objecten = [
      obj("1", 10),
      obj("2", 10),
      obj("3", 11),
      obj("4", null),
      obj("5", 12, "building"),
    ];
    expect(adresIds(objecten)).toEqual([10, 11, 12]);
    const plan = maakSyncPlan(objecten, [
      adres("10", 1),
      adres("11", 1),
      { adresId: "12", ok: false, ruw: "1053ZD ?" },
    ]);
    expect(plan.adressen).toHaveLength(1); // 10 en 11 zijn hetzelfde adres
    expect(plan.gedeeld).toBe(3);
    expect(plan.objecten.map((o) => o.adresSleutel)).toEqual([
      "1053ZD|1||",
      "1053ZD|1||",
      "1053ZD|1||",
      null,
      null,
    ]);
    expect(plan.zonderAdres).toEqual([
      { referentie: "R4", reden: "geen_adres" },
      { referentie: "R5", reden: "niet_te_splitsen", ruw: "1053ZD ?" },
    ]);
  });

  it("complexen en ids", () => {
    expect(complexen([obj("1", 1), obj("2", 2), obj("3", 3, "building")])).toEqual([
      { id: 3, naam: "Oost", aantal: 2 },
    ]);
    expect(idUitTekst("123")).toBe(123);
    expect(idUitTekst("AB-1")).toBe("AB-1");
  });
});

describe("testToegang (diagnose)", () => {
  it("per entiteit één vraag met $top=0; status bij weigering", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { o, urls } = omgeving((u) =>
      u.pathname.endsWith("/owners") ? json({}, 403) : json({ value: [] }),
    );
    const r = await testToegang(o);
    expect(urls.map((u) => [u.pathname.split("/").pop(), u.searchParams.get("$top")])).toEqual([
      ["owners", "0"],
      ["Units", "0"],
      ["Buildings", "0"],
      ["Addresses", "0"],
    ]);
    expect(r).toEqual([
      { entiteit: "owners", ok: false, fout: "geweigerd", status: 403 },
      { entiteit: "Units", ok: true },
      { entiteit: "Buildings", ok: true },
      { entiteit: "Addresses", ok: true },
    ]);
  });
});
