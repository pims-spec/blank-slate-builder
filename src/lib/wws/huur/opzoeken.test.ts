import { describe, expect, it, vi } from "vitest";
import { BAG_URL, LOCATIESERVER_URL } from "../portefeuille/bag";
import { EP_URL } from "../opzoeken/dienst";
import { zoekHuurWoning } from "./opzoeken";

const ID = (n: number) => "036301000000000" + n;
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const DOCS = [
  {
    adresseerbaarobject_id: ID(1),
    huisletter: null,
    huisnummertoevoeging: null,
    straatnaam: "Teststraat",
    woonplaatsnaam: "Utrecht",
    gemeentenaam: "Utrecht",
    provincienaam: "Utrecht",
    geheim: "mag niet mee",
  },
];

function nep(opties: { docs?: unknown[]; adresStatus?: number; ep?: number } = {}) {
  return vi.fn((url: string) => {
    if (url.startsWith(LOCATIESERVER_URL))
      return json(opties.adresStatus ?? 200, { response: { docs: opties.docs ?? DOCS } });
    if (url.startsWith(BAG_URL + "/pand/items/"))
      return json(200, { properties: { bouwjaar: 1968 } });
    if (url.startsWith(BAG_URL))
      return json(200, {
        features: [
          {
            properties: {
              oppervlakte: 72,
              gebruiksdoel: "woonfunctie",
              "pand.href": [BAG_URL + "/pand/items/0363100012345678"],
            },
          },
        ],
      });
    if (url.startsWith(EP_URL))
      return opties.ep
        ? json(opties.ep, { fout: "x" })
        : json(200, [
            {
              Energieklasse: "B",
              Registratiedatum: "2023-03-01T00:00:00",
              Gebouwtype: "Appartement",
            },
          ]);
    return json(404, {});
  });
}

describe("woning opzoeken voor de huurprijsindicator", () => {
  it("adres, gemeente, provincie, BAG en label; onbekende velden gaan niet mee", async () => {
    const r = await zoekHuurWoning(nep() as unknown as typeof fetch, "sleutel", {
      postcode: "3511 aa",
      huisnummer: "12",
    });
    expect(r).toEqual({
      ok: true,
      meldingen: [],
      woning: {
        postcode: "3511AA",
        huisnummer: "12",
        straat: "Teststraat",
        plaats: "Utrecht",
        gemeente: "Utrecht",
        provincie: "Utrecht",
        bagOppervlakte: 72,
        bouwjaar: 1968,
        gebruiksdoel: "woonfunctie",
        label: "B",
        labelDatum: "2023-03-01",
        gebouwtype: "Appartement",
      },
    });
  });

  it("meerdere woningen op dit nummer: keuzes voor letter of toevoeging", async () => {
    const docs = [
      { ...DOCS[0], huisletter: "A" },
      { ...DOCS[0], adresseerbaarobject_id: ID(2), huisletter: "B" },
    ];
    const r = await zoekHuurWoning(nep({ docs }) as unknown as typeof fetch, "s", {
      postcode: "3511AA",
      huisnummer: "12",
    });
    expect(r).toEqual({ ok: false, fout: "meerdere", keuzes: ["A", "B"] });
    const b = await zoekHuurWoning(nep({ docs }) as unknown as typeof fetch, "s", {
      postcode: "3511AA",
      huisnummer: "12",
      huisletter: "b",
    });
    expect(b.ok && b.woning.huisnummer).toBe("12 B");
  });

  it("zonder label of sleutel gaat het door, met een melding; PDOK-storing is een eigen code", async () => {
    const r = await zoekHuurWoning(nep({ ep: 404 }) as unknown as typeof fetch, "s", {
      postcode: "3511AA",
      huisnummer: "12",
    });
    expect(r.ok && r.woning.label).toBeNull();
    expect(r.ok && r.meldingen).toEqual(["Geen geregistreerd energielabel gevonden (EP-Online)."]);
    const s = await zoekHuurWoning(nep() as unknown as typeof fetch, undefined, {
      postcode: "3511AA",
      huisnummer: "12",
    });
    expect(s.ok && s.meldingen[0]).toMatch(/kon niet worden opgehaald/);
    expect(
      await zoekHuurWoning(nep({ adresStatus: 503 }) as unknown as typeof fetch, "s", {
        postcode: "3511AA",
        huisnummer: "12",
      }),
    ).toEqual({ ok: false, fout: "dienst_onbereikbaar" });
    expect(
      await zoekHuurWoning(nep() as unknown as typeof fetch, "s", {
        postcode: "x",
        huisnummer: "1",
      }),
    ).toEqual({ ok: false, fout: "ongeldige_invoer" });
  });
});
