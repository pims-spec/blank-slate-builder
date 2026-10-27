import { describe, expect, it } from "vitest";
import { ALLOWLIST, leesPagina, literal, volgendeLinkOk, vraagUrl } from "./odata";

const BASIS = "https://klant.bloxs.io/odatafeed";

describe("allowlist", () => {
  it("bevat alleen de afgesproken entiteiten en velden", () => {
    expect(ALLOWLIST).toEqual({
      owners: ["OwnerId", "Reference", "DisplayName", "ArchiveDate"],
      Units: [
        "RealEstateObjectId",
        "Reference",
        "OwnerId",
        "ComplexId",
        "ComplexName",
        "AddressId",
        "SalesDate",
        "CategoryName",
      ],
      Buildings: [
        "RealEstateObjectId",
        "Reference",
        "OwnerId",
        "AddressId",
        "SalesDate",
        "CategoryName",
      ],
      Addresses: ["AddressId", "PostalCode", "HouseNumber", "Street", "City"],
    });
  });

  it("weigert andere entiteiten en velden", () => {
    expect(() =>
      vraagUrl(BASIS, { entiteit: "Persons" as "owners", velden: ["OwnerId"], top: 1 }),
    ).toThrow("entiteit_niet_toegestaan");
    expect(() =>
      vraagUrl(BASIS, { entiteit: "owners", velden: ["Email" as "OwnerId"], top: 1 }),
    ).toThrow("veld_niet_toegestaan");
    expect(() =>
      vraagUrl(BASIS, {
        entiteit: "Units",
        velden: ["RealEstateObjectId"],
        filter: [{ veld: "ActiveContractRentTenantId", is: 1 }],
        top: 1,
      }),
    ).toThrow("veld_niet_toegestaan");
    expect(() =>
      vraagUrl(BASIS, { entiteit: "toString" as "owners", velden: ["OwnerId"], top: 1 }),
    ).toThrow("entiteit_niet_toegestaan");
  });
});

describe("vraagUrl en literal", () => {
  it("$select, $filter, $top en $skip", () => {
    const u = new URL(
      vraagUrl(BASIS, {
        entiteit: "Units",
        velden: ["RealEstateObjectId", "AddressId"],
        filter: [
          { veld: "OwnerId", is: 12 },
          { veld: "ComplexId", is: "C-7" },
        ],
        top: 500,
        skip: 1000,
      }),
    );
    expect(u.pathname).toBe("/odatafeed/Units");
    expect(u.searchParams.get("$select")).toBe("RealEstateObjectId,AddressId");
    expect(u.searchParams.get("$filter")).toBe("OwnerId eq 12 and ComplexId eq 'C-7'");
    expect(u.searchParams.get("$top")).toBe("500");
    expect(u.searchParams.get("$skip")).toBe("1000");
  });

  it("eenVan als or-keten; null-filter", () => {
    const u = new URL(
      vraagUrl(BASIS, {
        entiteit: "Addresses",
        velden: ["AddressId"],
        filter: [{ veld: "AddressId", eenVan: [1, 2] }],
        top: 2,
      }),
    );
    expect(u.searchParams.get("$filter")).toBe("(AddressId eq 1 or AddressId eq 2)");
    const o = new URL(
      vraagUrl(BASIS, {
        entiteit: "owners",
        velden: ["OwnerId"],
        filter: [{ veld: "ArchiveDate", isLeeg: true }],
        top: 0,
      }),
    );
    expect(o.searchParams.get("$filter")).toBe("ArchiveDate eq null");
  });

  it("literal: getal, GUID kaal, codes tussen aanhalingstekens; geen injectie", () => {
    expect(literal(42)).toBe("42");
    expect(literal("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    );
    expect(literal("AB-12")).toBe("'AB-12'");
    expect(() => literal("1' or 1 eq 1")).toThrow();
    expect(() => literal(1.5)).toThrow();
  });
});

describe("volgendeLinkOk", () => {
  it("alleen dezelfde feed en entiteit", () => {
    expect(volgendeLinkOk(BASIS, "Units", BASIS + "/Units?$skiptoken=5")).toBe(true);
    expect(volgendeLinkOk(BASIS, "Units", "Units?$skiptoken=5")).toBe(true);
    expect(volgendeLinkOk(BASIS, "Units", BASIS + "/Persons?$skiptoken=5")).toBe(false);
    expect(volgendeLinkOk(BASIS, "Units", "https://ander.example/odatafeed/Units")).toBe(false);
    expect(volgendeLinkOk(BASIS, "Units", "http://klant.bloxs.io/odatafeed/Units")).toBe(false);
    expect(volgendeLinkOk(BASIS, "Units", "https://x:y@klant.bloxs.io/odatafeed/Units")).toBe(
      false,
    );
  });
});

describe("leesPagina", () => {
  const v = { entiteit: "Units" as const, velden: ["RealEstateObjectId", "OwnerId"] as const };
  const alles = () => true;

  it("geeft alleen de gevraagde velden; @odata-annotaties mogen", () => {
    const t = JSON.stringify({
      "@odata.context": "x",
      value: [{ "@odata.etag": "e", RealEstateObjectId: 1, OwnerId: 9 }],
    });
    expect(leesPagina(t, BASIS, v, alles)).toEqual({
      ok: true,
      rijen: [{ RealEstateObjectId: 1, OwnerId: 9 }],
      volgende: null,
    });
  });

  it("$select genegeerd → stoppen", () => {
    const t = JSON.stringify({
      value: [{ RealEstateObjectId: 1, OwnerId: 9, ActiveContractRentTenantId: 5 }],
    });
    expect(leesPagina(t, BASIS, v, alles)).toEqual({ ok: false, fout: "select_genegeerd" });
  });

  it("$filter genegeerd → stoppen", () => {
    const t = JSON.stringify({ value: [{ RealEstateObjectId: 1, OwnerId: 8 }] });
    expect(leesPagina(t, BASIS, v, (r) => r["OwnerId"] === 9)).toEqual({
      ok: false,
      fout: "filter_genegeerd",
    });
  });

  it("volgende link: naar onze feed wel, elders niet", () => {
    const goed = JSON.stringify({ value: [], "@odata.nextLink": BASIS + "/Units?$skip=500" });
    expect(leesPagina(goed, BASIS, v, alles)).toMatchObject({
      ok: true,
      volgende: BASIS + "/Units?$skip=500",
    });
    const fout = JSON.stringify({ value: [], "@odata.nextLink": "https://elders.nl/Units" });
    expect(leesPagina(fout, BASIS, v, alles)).toEqual({
      ok: false,
      fout: "volgende_link_ongeldig",
    });
  });

  it("geen JSON of geen value-lijst → onverwacht", () => {
    expect(leesPagina("<html/>", BASIS, v, alles)).toEqual({
      ok: false,
      fout: "onverwacht_antwoord",
    });
    expect(leesPagina('{"d":{"results":[]}}', BASIS, v, alles)).toEqual({
      ok: false,
      fout: "onverwacht_antwoord",
    });
  });
});
