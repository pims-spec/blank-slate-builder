import { describe, expect, it, vi } from "vitest";
import { BAG_URL } from "../portefeuille/bag";
import { zoekCoropGegevens } from "./corop";
import { PDOK_URL } from "./pdok";

vi.spyOn(console, "warn").mockImplementation(() => {});

const VBO = "0344010000069727";
const PAND = BAG_URL + "/pand/items/0344100000012345";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Nep-PDOK: Locatieserver → docs, verblijfsobject → pand-link, pand → bouwjaar */
function nep(docs: unknown[], bouwjaar: number | null, pandStatus = 200) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.startsWith(PDOK_URL)) return json({ response: { docs } });
    if (u.includes("/verblijfsobject/items"))
      return json({
        features: [
          { properties: { oppervlakte: 30, gebruiksdoel: "woonfunctie", "pand.href": [PAND] } },
        ],
      });
    if (u.startsWith(PAND)) return json({ properties: { bouwjaar } }, pandStatus);
    return json({}, 404);
  }) as unknown as typeof fetch;
}
const doc = (over: Record<string, unknown> = {}) => ({
  gemeentecode: "0344",
  gemeentenaam: "Utrecht",
  adresseerbaarobject_id: VBO,
  ...over,
});
const vraag = { postcode: "3511 ab", huisnummer: "1" };

describe("gemeente en bouwjaar ophalen (PDOK en BAG)", () => {
  it("geeft gemeentecode, gemeente en het bouwjaar van het pand", async () => {
    const r = await zoekCoropGegevens(nep([doc()], 2020), vraag);
    expect(r).toEqual({
      ok: true,
      data: { gemeentecode: "0344", gemeente: "Utrecht", bouwjaar: 2020 },
    });
  });

  it("kiest het adres met de juiste huisletter", async () => {
    const r = await zoekCoropGegevens(
      nep([doc({ gemeentenaam: "Fout" }), doc({ huisletter: "A", gemeentenaam: "Goed" })], 2019),
      { ...vraag, huisletter: "a" },
    );
    expect(r.ok && r.data.gemeente).toBe("Goed");
  });

  it("zonder BAG-pand: bouwjaar null; bij te veel verzoeken een foutcode", async () => {
    const r = await zoekCoropGegevens(nep([doc()], null, 404), vraag);
    expect(r.ok && r.data.bouwjaar).toBeNull();
    const s = await zoekCoropGegevens(nep([doc()], 2020, 429), vraag);
    expect(s).toEqual({ ok: false, fout: "te_veel_verzoeken" });
  });

  it("onbruikbaar antwoord of geen adres: niet gevonden; ongeldige invoer gaat niet naar PDOK", async () => {
    expect(await zoekCoropGegevens(nep([doc({ gemeentecode: "GM0344" })], 2020), vraag)).toEqual({
      ok: false,
      fout: "niet_gevonden",
    });
    expect(await zoekCoropGegevens(nep([], 2020), vraag)).toEqual({
      ok: false,
      fout: "niet_gevonden",
    });
    const f = nep([doc()], 2020);
    expect(await zoekCoropGegevens(f, { postcode: "x", huisnummer: "1" })).toEqual({
      ok: false,
      fout: "ongeldige_invoer",
    });
    expect(f).not.toHaveBeenCalled();
  });
});
