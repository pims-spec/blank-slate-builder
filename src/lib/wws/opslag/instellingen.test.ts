import { describe, expect, it } from "vitest";
import { DEFAULT_NORMEN, NORMEN_VERSIE, mergeNormen } from "../normen";
import { controleStatus, maakInstellingenStore, NORMEN_KEY } from "./instellingen";
import { nepDb, stap } from "./nepDb";

describe("instellingen: normen", () => {
  it("zonder opgeslagen normen: de standaardnormen", async () => {
    const { db, log } = nepDb(() => ({ data: null }));
    const n = await maakInstellingenStore(db).haalNormen();
    expect(n).toEqual(JSON.parse(JSON.stringify(DEFAULT_NORMEN)));
    expect(log[0]?.tabel).toBe("instellingen");
    expect(stap(log[0], "eq")).toEqual(["key", NORMEN_KEY]);
  });

  it("opgeslagen normen van dezelfde versie worden overgenomen", async () => {
    const opgeslagen = { versie: NORMEN_VERSIE, grensMidden: 190, kosten: { labelStap: 9000 } };
    const { db } = nepDb(() => ({ data: { data: opgeslagen } }));
    const n = await maakInstellingenStore(db).haalNormen();
    expect(n.grensMidden).toBe(190);
    expect(n.kosten["labelStap"]).toBe(9000);
    // niet-opgeslagen kosten blijven de standaard
    expect(n.kosten["bad"]).toBe(DEFAULT_NORMEN.kosten.bad);
  });

  it("normen van een oude versie: alleen de kosten tellen mee (mergeNormen)", async () => {
    const oud = { versie: "HC-2025-07", grensMidden: 150, kosten: { labelStap: 9000 } };
    const { db } = nepDb(() => ({ data: { data: oud } }));
    const n = await maakInstellingenStore(db).haalNormen();
    expect(n.grensMidden).toBe(DEFAULT_NORMEN.grensMidden);
    expect(n.kosten["labelStap"]).toBe(9000);
  });

  it("opslaan: upsert op de sleutel normen; fouten (bv. geen admin) worden doorgegeven", async () => {
    const n = mergeNormen(null);
    const goed = nepDb();
    await maakInstellingenStore(goed.db).slaNormenOp(n);
    expect(stap(goed.log[0], "upsert")).toEqual([{ key: NORMEN_KEY, data: n }]);

    const fout = { message: "new row violates row-level security policy", code: "42501" };
    const mis = nepDb(() => ({ error: fout }));
    await expect(maakInstellingenStore(mis.db).slaNormenOp(n)).rejects.toBe(fout);
  });
});

describe("controleStatus", () => {
  const nu = new Date("2026-10-14T12:00:00");
  it("nooit gecontroleerd", () => {
    expect(controleStatus("", nu)).toMatchObject({ nodig: true });
  });
  it("recent gecontroleerd: niet nodig", () => {
    expect(controleStatus("2026-10-01", nu)).toEqual({ nodig: false, dagen: 13 });
  });
  it("na 30 dagen", () => {
    expect(controleStatus("2026-09-10", nu)).toMatchObject({ nodig: true, dagen: 34 });
  });
  it("na 1 juli (vast wijzigingsmoment), ook binnen 30 dagen", () => {
    const r = controleStatus("2026-06-20", new Date("2026-07-05T12:00:00"));
    expect(r.nodig).toBe(true);
    expect(r.reden).toContain("1 juli");
  });
});
