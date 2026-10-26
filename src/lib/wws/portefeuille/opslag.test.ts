import { describe, expect, it } from "vitest";
import { nepDb, stap } from "../opslag/nepDb";
import { maakPortefeuilleStore } from "./opslag";

const rij = (i: number, label?: object) => ({
  id: "a" + i,
  postcode: "1053ZD",
  huisnummer: i,
  huisletter: "",
  toevoeging: "",
  label_resultaten: label ? [label] : [],
});

describe("portefeuille-opslag", () => {
  it("adressen in pagina's van 1000, met het laatste labelresultaat", async () => {
    const { db, log } = nepDb((a) => {
      const [van] = stap(a, "range") as [number, number];
      const n = van === 0 ? 1000 : 3;
      return {
        data: Array.from({ length: n }, (_, k) =>
          rij(
            van + k + 1,
            k === 0
              ? {
                  status: "gevonden",
                  energieklasse: "B",
                  registratiedatum: "2022-01-01",
                  geldig_tot: null,
                  opgehaald_op: "2026-10-16T10:00:00Z",
                }
              : undefined,
          ),
        ),
      };
    });
    const lijst = await maakPortefeuilleStore(db).adressen("p1");
    expect(lijst).toHaveLength(1003);
    expect(log.map((a) => stap(a, "range"))).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(stap(log[0], "eq")).toEqual(["portefeuille_id", "p1"]);
    expect(lijst[0]!.resultaat).toEqual({
      status: "gevonden",
      energieklasse: "B",
      registratiedatum: "2022-01-01",
      geldigTot: null,
      opgehaaldOp: "2026-10-16T10:00:00Z",
    });
    expect(lijst[1]!.resultaat).toBeNull();
  });

  it("adressen toevoegen: dubbele overslaan via de unieke sleutel, in porties", async () => {
    const { db, log } = nepDb((a) => ({
      data: (stap(a, "upsert")![0] as unknown[]).slice(0, 2).map((_, i) => ({ id: "n" + i })),
    }));
    const adressen = Array.from({ length: 600 }, (_, i) => ({
      postcode: "1053ZD",
      huisnummer: i + 1,
      huisletter: "",
      toevoeging: "",
    }));
    expect(await maakPortefeuilleStore(db).voegAdressenToe("p1", adressen)).toBe(4);
    expect(log).toHaveLength(2);
    expect(stap(log[0], "upsert")![1]).toEqual({
      onConflict: "portefeuille_id,postcode,huisnummer,huisletter,toevoeging",
      ignoreDuplicates: true,
    });
    expect((stap(log[0], "upsert")![0] as object[])[0]).toEqual({
      portefeuille_id: "p1",
      postcode: "1053ZD",
      huisnummer: 1,
      huisletter: "",
      toevoeging: "",
    });
  });

  it("resultaten opslaan met wie en wanneer", async () => {
    const { db, log } = nepDb();
    await maakPortefeuilleStore(db).slaResultatenOp("p1", "u1", [
      {
        id: "a1",
        resultaat: {
          status: "gevonden",
          energieklasse: "C",
          registratiedatum: "2019-04-25",
          geldigTot: "2029-04-25",
          opgehaaldOp: "2026-10-16T10:00:00Z",
          opnamedatum: null,
          energieIndex: 1.5,
          gebouwtype: null,
        },
      },
    ]);
    expect(stap(log[0], "upsert")).toEqual([
      [
        {
          adres_id: "a1",
          portefeuille_id: "p1",
          status: "gevonden",
          energieklasse: "C",
          registratiedatum: "2019-04-25",
          geldig_tot: "2029-04-25",
          opnamedatum: null,
          energie_index: 1.5,
          gebouwtype: null,
          opgehaald_op: "2026-10-16T10:00:00Z",
          opgehaald_door: "u1",
        },
      ],
      { onConflict: "adres_id" },
    ]);
  });

  it("verwijderen dat door RLS niets raakt geeft een duidelijke fout", async () => {
    const { db } = nepDb(() => ({ data: [] }));
    await expect(maakPortefeuilleStore(db).verwijder("p1")).rejects.toThrow(/maker|beheerder/);
    await expect(maakPortefeuilleStore(db).verwijderAnalyse("x")).rejects.toThrow(/beheerder/);
  });

  describe("gecombineerde analyse hernoemen", () => {
    it("alleen de titel, opgeschoond, met het id", async () => {
      const { db, log } = nepDb(() => ({ data: [{ id: "c1" }] }));
      const naam = await maakPortefeuilleStore(db).hernoemCombiAnalyse("c1", "  Apricot  totaal ");
      expect(naam).toBe("Apricot totaal");
      expect(log[0]!.tabel).toBe("portefeuille_combi_analyses");
      expect(stap(log[0], "update")).toEqual([{ titel: "Apricot totaal" }]);
      expect(stap(log[0], "eq")).toEqual(["id", "c1"]);
    });

    it("lege naam: niets naar de database; geen rij (geen recht) of een fout: eigen melding", async () => {
      const leeg = nepDb();
      await expect(maakPortefeuilleStore(leeg.db).hernoemCombiAnalyse("c1", " ")).rejects.toThrow(
        /1 tot 200 tekens/,
      );
      expect(leeg.log).toHaveLength(0);
      const geenRecht = nepDb(() => ({ data: [] }));
      await expect(
        maakPortefeuilleStore(geenRecht.db).hernoemCombiAnalyse("c1", "Nieuw"),
      ).rejects.toThrow(/Alleen wie de analyse heeft opgeslagen/);
      const fout = nepDb(() => ({ error: { message: "permission denied for table x" } }));
      await expect(
        maakPortefeuilleStore(fout.db).hernoemCombiAnalyse("c1", "Nieuw"),
      ).rejects.toThrow(/^De naam aanpassen lukte niet\. Probeer het opnieuw\.$/);
    });
  });
});
