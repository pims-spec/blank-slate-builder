import { describe, expect, it } from "vitest";
import {
  aantalGekoppeld,
  bestaatKlant,
  klantNaam,
  maakKlantenStore,
  zoekKlanten,
  type Klant,
} from "./klanten";
import { nepDb, stap } from "./nepDb";

const K = (id: string, naam: string): Klant => ({ id, naam, pves: [] });
const KLANTEN = [K("k2", "Zeta Vastgoed"), K("k1", "Amstel Wonen"), K("k3", "Ébène BV")];

describe("klanten (eigenaren): store", () => {
  it("lijst: op naam gesorteerd (Nederlands, accenten genegeerd)", async () => {
    const { db, log } = nepDb(() => ({ data: KLANTEN }));
    const lijst = await maakKlantenStore(db).lijst();
    expect(lijst.map((k) => k.naam)).toEqual(["Amstel Wonen", "Ébène BV", "Zeta Vastgoed"]);
    expect(log[0]?.tabel).toBe("klanten");
  });

  it("toevoegen: alleen de naam (created_by zet de database), getrimd", async () => {
    const { db, log } = nepDb(() => ({ data: K("k9", "Nieuw") }));
    const k = await maakKlantenStore(db).voegToe("  Nieuw ");
    expect(stap(log[0], "insert")).toEqual([{ naam: "Nieuw" }]);
    expect(k.id).toBe("k9");
  });

  it("toevoegen: lege naam of dubbele naam geeft een duidelijke melding", async () => {
    await expect(maakKlantenStore(nepDb().db).voegToe("  ")).rejects.toThrow("Vul een naam in.");
    const { db } = nepDb(() => ({ error: { code: "23505", message: "duplicate key" } }));
    await expect(maakKlantenStore(db).voegToe("Amstel Wonen")).rejects.toThrow(
      "Er bestaat al een eigenaar met deze naam.",
    );
  });

  it("hernoemen en verwijderen: 0 rijen (geen admin, RLS) is een fout", async () => {
    const leeg = nepDb(() => ({ data: [] }));
    await expect(maakKlantenStore(leeg.db).hernoem("k1", "X")).rejects.toThrow(/beheerder/);
    await expect(maakKlantenStore(leeg.db).verwijder("k1")).rejects.toThrow(/beheerder/);

    const goed = nepDb(() => ({ data: [{ id: "k1" }] }));
    await maakKlantenStore(goed.db).hernoem("k1", " Amstel ");
    expect(stap(goed.log[0], "update")).toEqual([{ naam: "Amstel" }]);
    expect(stap(goed.log[0], "eq")).toEqual(["id", "k1"]);
    await maakKlantenStore(goed.db).verwijder("k1");
    expect(stap(goed.log[1], "delete")).toEqual([]);
  });
});

describe("klanten: PvE's", () => {
  it("lijst: PvE's uit klanten.pve, ook een oud los PvE-object", async () => {
    const oud = { keuken: { actief: true, keuken: { lengte: ">=2", voorz: {} } } };
    const { db } = nepDb(() => ({
      data: [
        { id: "k1", naam: "A", pve: [{ id: "p1", naam: "Basis", toilet: { actief: true } }] },
        { id: "k2", naam: "B", pve: oud },
        { id: "k3", naam: "C", pve: null },
      ],
    }));
    const [a, b, c] = await maakKlantenStore(db).lijst();
    expect(a!.pves).toEqual([{ id: "p1", naam: "Basis", toilet: { actief: true } }]);
    expect(b!.pves).toHaveLength(1);
    expect(b!.pves[0]).toMatchObject({ naam: "Standaard", keuken: oud.keuken });
    expect(typeof b!.pves[0]!.id).toBe("string");
    expect(c!.pves).toEqual([]);
  });

  it("PvE's opslaan: update van kolom pve; 0 rijen (geen admin) is een fout", async () => {
    const pves = [{ id: "p1", naam: "Basis", indeling: { slaapkamers: "3" } }];
    const goed = nepDb(() => ({ data: [{ id: "k1" }] }));
    await maakKlantenStore(goed.db).slaPvesOp("k1", pves);
    expect(stap(goed.log[0], "update")).toEqual([{ pve: pves }]);
    expect(stap(goed.log[0], "eq")).toEqual(["id", "k1"]);
    const leeg = nepDb(() => ({ data: [] }));
    await expect(maakKlantenStore(leeg.db).slaPvesOp("k1", pves)).rejects.toThrow(/beheerder/);
  });
});

describe("klanten: hulpfuncties", () => {
  it("klantNaam: leeg bij geen of een verwijderde eigenaar", () => {
    expect(klantNaam(KLANTEN, "k1")).toBe("Amstel Wonen");
    expect(klantNaam(KLANTEN, "")).toBe("");
    expect(klantNaam(KLANTEN, "weg")).toBe("");
  });

  it("zoeken en bestaan", () => {
    expect(zoekKlanten(KLANTEN, "v").map((k) => k.id)).toEqual(["k3", "k2"]);
    expect(zoekKlanten(KLANTEN, "").length).toBe(3);
    expect(bestaatKlant(KLANTEN, " amstel wonen ")).toBe(true);
    expect(bestaatKlant(KLANTEN, "Amstel")).toBe(false);
  });

  it("aantal gekoppelde tellingen", () => {
    const t = (klantId: string) => ({ meta: { klantId } });
    expect(aantalGekoppeld([t("k1"), t("k2"), t("k1"), t("")], "k1")).toBe(2);
  });
});
