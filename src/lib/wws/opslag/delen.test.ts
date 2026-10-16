import { describe, expect, it } from "vitest";
import { collegasMetRol, deelbareCollegas, maakDelenStore } from "./delen";
import { nepDb, stap } from "./nepDb";

const P = (id: string, display_name: string | null, email: string) => ({ id, display_name, email });
const PROFIELEN = [
  P("u1", "Pim", "pim@x.nl"),
  P("u2", null, "anna@x.nl"),
  P("u3", "Wacht", "w@x.nl"),
];

describe("collega's met een rol", () => {
  it("admin: profielen zonder rol vallen weg", () => {
    const c = collegasMetRol(PROFIELEN, [{ user_id: "u1" }, { user_id: "u2" }], true);
    expect(c.map((x) => x.id)).toEqual(["u2", "u1"]);
    expect(c[0]).toEqual({ id: "u2", naam: "anna@x.nl", email: "anna@x.nl" });
  });

  it("collega: de database filtert al (RLS); alleen de eigen rol is leesbaar, dus niet filteren", () => {
    const c = collegasMetRol(PROFIELEN.slice(0, 2), [{ user_id: "u1" }], false);
    expect(c.map((x) => x.id)).toEqual(["u2", "u1"]);
  });

  it("deelbaar: niet met jezelf en niet met de eigenaar", () => {
    const c = collegasMetRol(PROFIELEN, [], false);
    expect(deelbareCollegas(c, "u1", "u3").map((x) => x.id)).toEqual(["u2"]);
  });
});

describe("delen: store", () => {
  it("gedeeld met: user_ids van de telling", async () => {
    const { db, log } = nepDb(() => ({ data: [{ user_id: "u2" }, { user_id: "u3" }] }));
    expect(await maakDelenStore(db).gedeeldMet("t1")).toEqual(["u2", "u3"]);
    expect(log[0]?.tabel).toBe("telling_shares");
    expect(stap(log[0], "eq")).toEqual(["telling_id", "t1"]);
  });

  it("delen: alleen telling en gebruiker (gedeeld_door zet de database)", async () => {
    const { db, log } = nepDb();
    await maakDelenStore(db).deel("t1", "u2");
    expect(stap(log[0], "insert")).toEqual([{ telling_id: "t1", user_id: "u2" }]);
  });

  it("ontdelen: op telling én gebruiker", async () => {
    const { db, log } = nepDb();
    await maakDelenStore(db).ontdeel("t1", "u2");
    const eqs = log[0]!.stappen.filter(([s]) => s === "eq").map(([, a]) => a);
    expect(eqs).toEqual([
      ["telling_id", "t1"],
      ["user_id", "u2"],
    ]);
  });

  it("fouten (bv. geen recht om te delen) worden doorgegeven", async () => {
    const fout = { message: "new row violates row-level security policy", code: "42501" };
    const { db } = nepDb(() => ({ error: fout }));
    await expect(maakDelenStore(db).deel("t1", "u2")).rejects.toBe(fout);
  });

  it("collega's: profielen en rollen samen", async () => {
    const { db } = nepDb((a) =>
      a.tabel === "profiles" ? { data: PROFIELEN } : { data: [{ user_id: "u2" }] },
    );
    expect((await maakDelenStore(db).collegas(true)).map((c) => c.id)).toEqual(["u2"]);
  });

  it("portefeuilles: gedeeld met, delen en intrekken op portefeuille_shares", async () => {
    const a = nepDb(() => ({ data: [{ user_id: "u2" }] }));
    expect(await maakDelenStore(a.db).portefeuilleGedeeldMet("p1")).toEqual(["u2"]);
    expect(a.log[0]?.tabel).toBe("portefeuille_shares");
    expect(stap(a.log[0], "eq")).toEqual(["portefeuille_id", "p1"]);
    const b = nepDb();
    await maakDelenStore(b.db).deelPortefeuille("p1", "u2");
    expect(stap(b.log[0], "insert")).toEqual([{ portefeuille_id: "p1", user_id: "u2" }]);
    const c = nepDb();
    await maakDelenStore(c.db).ontdeelPortefeuille("p1", "u2");
    expect(c.log[0]!.stappen.filter(([x]) => x === "eq").map(([, y]) => y)).toEqual([
      ["portefeuille_id", "p1"],
      ["user_id", "u2"],
    ]);
  });
});
