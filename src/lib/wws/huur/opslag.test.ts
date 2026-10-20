import { describe, expect, it } from "vitest";
import { nepDb, stap, type Aanroep } from "../opslag/nepDb";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { standaardAntwoorden, type HuurWoning } from "./model";
import { huurNormen } from "./normen";
import { maakHuurIndicatie, maakHuurStore } from "./opslag";

const N = DEFAULT_NORMEN as unknown as Normen;
const W: HuurWoning = {
  postcode: "3511AA",
  huisnummer: "12 A",
  straat: "Teststraat",
  plaats: "Utrecht",
  gemeente: "Utrecht",
  provincie: "Utrecht",
  bagOppervlakte: 70,
  bouwjaar: 1968,
  gebruiksdoel: "woonfunctie",
  label: "C",
  labelDatum: "2023-03-01",
  gebouwtype: "Appartement",
};
const D = maakHuurIndicatie(W, standaardAntwoorden(W), huurNormen(null), N, "Test", "2026-10-20");

describe("huurindicaties opslaan", () => {
  it("snapshot: alleen de gebruikte bronregel, de factoren en de normversie", () => {
    expect(D.snapshot.normen.regels).toHaveLength(1);
    expect(D.snapshot.normen.regels[0]!.id).toBe("gem-utrecht");
    expect(D.snapshot.normen.factoren.label.bron).toMatch(/^GoHome-inschatting/);
    expect(D.snapshot.normenVersie).toBe(N.versie);
    expect("invoer" in D.wws).toBe(false);
    expect(JSON.stringify(D).length).toBeLessThan(200_000);
  });

  it("bewaar: adresvelden en data; de eigenaar komt uit de database (auth.uid())", async () => {
    const { db, log } = nepDb((a: Aanroep) => (stap(a, "insert") ? { data: { id: "x1" } } : {}));
    expect(await maakHuurStore(db).bewaar(D, "k1")).toBe("x1");
    const [rij] = stap(log[0], "insert") as [Record<string, unknown>];
    expect(rij).toMatchObject({
      postcode: "3511AA",
      huisnummer: "12 A",
      straat: "Teststraat",
      plaats: "Utrecht",
      klant_id: "k1",
    });
    expect("owner_id" in rij).toBe(false);
  });

  it("lijst: onbekende vormen worden overgeslagen; verwijderen zonder rechten geeft een fout", async () => {
    const rij = (data: unknown) => ({
      id: "i",
      owner_id: "u",
      klant_id: null,
      telling_id: null,
      created_at: "2026-10-20T10:00:00Z",
      data,
      eigenaar: { display_name: "Anna", email: null },
    });
    const { db } = nepDb(() => ({ data: [rij(D), rij({ versie: 9 })] }));
    const lijst = await maakHuurStore(db).lijst();
    expect(lijst).toHaveLength(1);
    expect(lijst[0]!.ownerNaam).toBe("Anna");
    const { db: leeg } = nepDb(() => ({ data: [] }));
    await expect(maakHuurStore(leeg).verwijder("i")).rejects.toThrow("geen_rechten");
  });
});
