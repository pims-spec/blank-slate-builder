import { describe, expect, it } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { maakTellingDoc, nieuweTellingStaat, type TellingStaat } from "./doc";
import { nepDb, stap, type Aanroep, type Antwoord } from "./nepDb";
import {
  haalDashboardVersies,
  legVersieVast,
  maakTellingStore,
  slaWerkversieOp,
  werkVersieBij,
} from "./store";

const N = DEFAULT_NORMEN as unknown as Normen;
const NU = new Date("2026-10-14T10:00:00.000Z");
const ADMIN = { id: "admin-1", naam: "Beheerder", email: "admin@x.nl" };

function staat(versieCount = 0): TellingStaat {
  const s = nieuweTellingStaat("Pim", NU);
  s.meta.adres = "Straat";
  s.meta.huisnummer = "1";
  s.input.vertrekken.push({ type: "woonkamer", m2: 30, verwarmd: true });
  return { ...s, versieCount, aantalVersies: versieCount };
}

/** update(...).select("id") geeft de bijgewerkte rij terug, net als PostgREST */
const updateLukt = (a: Aanroep): Antwoord => (stap(a, "update") ? { data: [{ id: "t1" }] } : {});

describe("maakTellingStore", () => {
  it("lijst: zet rijen om naar tellingen, met de naam van de eigenaar", async () => {
    const doc = maakTellingDoc(staat(), N, null, NU);
    const { db, log } = nepDb(() => ({
      data: [
        {
          id: "t1",
          owner_id: "u1",
          data: doc,
          updated_at: "2026-10-14T11:00:00Z",
          eigenaar: { display_name: "Anna", email: "anna@x.nl" },
        },
        {
          id: "t2",
          owner_id: "u2",
          data: null,
          updated_at: "2026-10-13T11:00:00Z",
          eigenaar: { display_name: null, email: "bob@x.nl" },
        },
        { id: "t3", owner_id: "u3", data: {}, updated_at: "2026-10-12T11:00:00Z", eigenaar: null },
      ],
    }));
    const lijst = await maakTellingStore(db, N).lijst();
    expect(log[0]?.tabel).toBe("tellingen");
    expect(stap(log[0], "select")?.[0]).toContain(
      "eigenaar:profiles!tellingen_owner_id_fkey(display_name, email)",
    );
    expect(stap(log[0], "order")).toEqual(["updated_at", { ascending: false }]);
    expect(lijst.map((t) => [t.id, t.ownerId, t.ownerNaam])).toEqual([
      ["t1", "u1", "Anna"],
      ["t2", "u2", "bob@x.nl"],
      ["t3", "u3", null],
    ]);
    expect(lijst[0]?.input).toEqual(doc.input);
    // laatst gewijzigd = updatedAt uit het document (zoals de bron); anders de kolom
    expect(lijst[0]?.gewijzigdOp).toBe(NU.toISOString());
    expect(lijst[1]?.gewijzigdOp).toBe("2026-10-13T11:00:00Z");
    expect(lijst[1]?.input.vertrekken).toEqual([]);
  });

  it("maakAan: insert zonder owner_id (de database zet auth.uid())", async () => {
    const { db, log } = nepDb();
    const doc = maakTellingDoc(staat(), N, null, NU);
    await maakTellingStore(db, N).maakAan("t1", doc);
    expect(stap(log[0], "insert")).toEqual([{ id: "t1", data: doc }]);
  });

  it("bewaar: schrijft alleen data, nooit owner_id — ook niet als een admin opslaat", async () => {
    const { db, log } = nepDb(updateLukt);
    const doc = maakTellingDoc(staat(), N, ADMIN, NU);
    await maakTellingStore(db, N).bewaar("t1", doc);
    const [patch] = stap(log[0], "update") ?? [];
    expect(patch).toEqual({ data: doc });
    expect(patch).not.toHaveProperty("owner_id");
    expect(stap(log[0], "eq")).toEqual(["id", "t1"]);
    expect(stap(log[0], "upsert")).toBeUndefined();
  });

  it("bewaar: foutmelding als er geen rij is bijgewerkt (weg, of geen rechten)", async () => {
    const { db } = nepDb(() => ({ data: [] }));
    await expect(
      maakTellingStore(db, N).bewaar("t1", maakTellingDoc(staat(), N, null, NU)),
    ).rejects.toThrow(/bestaat niet meer/);
  });

  it("geeft databasefouten door", async () => {
    const fout = { message: "permission denied", code: "42501" };
    const { db } = nepDb(() => ({ error: fout }));
    const store = maakTellingStore(db, N);
    await expect(store.lijst()).rejects.toBe(fout);
    await expect(store.verwijder("t1")).rejects.toBe(fout);
    await expect(store.versies("t1")).rejects.toBe(fout);
  });

  it("verwijder: delete op id", async () => {
    const { db, log } = nepDb();
    await maakTellingStore(db, N).verwijder("t1");
    expect(log[0]?.tabel).toBe("tellingen");
    expect(stap(log[0], "delete")).toEqual([]);
    expect(stap(log[0], "eq")).toEqual(["id", "t1"]);
  });

  it("versies: nieuwste eerst, met id en ingelezen data", async () => {
    const { db, log } = nepDb(() => ({
      data: [
        {
          id: "v0002",
          data: { nr: 2, notitie: "Twee", resultaat: { totaal: 150, seg: "midden" } },
        },
        { id: "v0001", data: { nr: 1, notitie: "Een" } },
      ],
    }));
    const vs = await maakTellingStore(db, N).versies("t1");
    expect(log[0]?.tabel).toBe("telling_versies");
    expect(stap(log[0], "eq")).toEqual(["telling_id", "t1"]);
    expect(stap(log[0], "order")).toEqual(["nr", { ascending: false }]);
    expect(vs.map((v) => [v.id, v.nr, v.notitie])).toEqual([
      ["v0002", 2, "Twee"],
      ["v0001", 1, "Een"],
    ]);
    expect(vs[1]?.normen).toBe(N);
  });
});

describe("slaWerkversieOp", () => {
  it("nieuwe telling: insert; bestaande telling: update", async () => {
    const nieuw = nepDb();
    await slaWerkversieOp(maakTellingStore(nieuw.db, N), {
      id: "t1",
      isNieuw: true,
      staat: staat(),
      normen: N,
      bewerker: null,
      nu: NU,
    });
    expect(nieuw.log.map((a) => a.stappen[0]?.[0])).toEqual(["insert"]);

    const bestaand = nepDb(updateLukt);
    await slaWerkversieOp(maakTellingStore(bestaand.db, N), {
      id: "t1",
      isNieuw: false,
      staat: staat(),
      normen: N,
      bewerker: ADMIN,
      nu: NU,
    });
    expect(bestaand.log.map((a) => a.stappen[0]?.[0])).toEqual(["update"]);
  });
});

describe("legVersieVast", () => {
  it("nieuwe telling: eerst de telling aanmaken, dan versie 1 met normen", async () => {
    const { db, log } = nepDb();
    const { staat: na, versie } = await legVersieVast(maakTellingStore(db, N), {
      id: "t1",
      isNieuw: true,
      staat: staat(),
      normen: N,
      bewerker: null,
      naam: "",
      nu: NU,
    });
    expect(log.map((a) => [a.tabel, a.stappen[0]?.[0]])).toEqual([
      ["tellingen", "insert"],
      ["telling_versies", "insert"],
    ]);
    const [telling] = (stap(log[0], "insert") ?? []) as [{ data: { versieCount: number } }];
    expect(telling.data.versieCount).toBe(1);
    const [rij] = (stap(log[1], "insert") ?? []) as [Record<string, unknown>];
    expect(rij).toMatchObject({ telling_id: "t1", id: "v0001", nr: 1 });
    expect((rij["data"] as { normen: unknown }).normen).toEqual(N);
    expect(versie.id).toBe("v0001");
    expect(versie.notitie).toBe("Straat 1 - versie 1");
    expect(na).toMatchObject({ versieCount: 1, aantalVersies: 1, basedOn: null });
  });

  it("bestaande telling: update en het volgende nummer; een naam wordt ook de telling-naam", async () => {
    const { db, log } = nepDb(updateLukt);
    const s = { ...staat(3), aantalVersies: 2, basedOn: 2 };
    const { staat: na, versie } = await legVersieVast(maakTellingStore(db, N), {
      id: "t1",
      isNieuw: false,
      staat: s,
      normen: N,
      bewerker: ADMIN,
      naam: " Na renovatie ",
      nu: NU,
    });
    expect(log.map((a) => [a.tabel, a.stappen[0]?.[0]])).toEqual([
      ["tellingen", "update"],
      ["telling_versies", "insert"],
    ]);
    expect(stap(log[0], "update")?.[0]).not.toHaveProperty("owner_id");
    expect(versie).toMatchObject({ id: "v0004", nr: 4, notitie: "Na renovatie" });
    expect(na).toMatchObject({ versieCount: 4, aantalVersies: 3, basedOn: null });
    expect(na.meta.naam).toBe("Na renovatie");
    expect(s.meta.naam).toBe("");
  });

  it("legt geen versie vast als het opslaan van de telling mislukt", async () => {
    const fout = { message: "permission denied" };
    const { db, log } = nepDb((a) => (a.tabel === "tellingen" ? { error: fout } : {}));
    await expect(
      legVersieVast(maakTellingStore(db, N), {
        id: "t1",
        isNieuw: true,
        staat: staat(),
        normen: N,
        bewerker: null,
        naam: "",
        nu: NU,
      }),
    ).rejects.toBe(fout);
    expect(log.map((a) => a.tabel)).toEqual(["tellingen"]);
  });
});

describe("dashboard: versies", () => {
  it("één query met alleen nr, datum en opgeslagen resultaat; op volgorde van nr", async () => {
    const { db, log } = nepDb(() => ({
      data: [
        {
          telling_id: "t1",
          nr: 1,
          createdAt: "2026-01-02T10:00:00Z",
          totaal: 150,
          maxHuur: 900.5,
          seg: "midden",
        },
        { telling_id: "t1", nr: 2, createdAt: null, totaal: null, maxHuur: null, seg: null },
      ],
    }));
    const r = await haalDashboardVersies(db);
    expect(log).toHaveLength(1);
    expect(log[0]?.tabel).toBe("telling_versies");
    const velden = stap(log[0], "select")?.[0] as string;
    expect(velden).toContain("data->resultaat->totaal");
    expect(velden).not.toMatch(/(^|[ ,])data([ ,]|$)/); // niet de hele data (invoer, normen)
    expect(stap(log[0], "order")).toEqual(["nr", { ascending: true }]);
    expect(stap(log[0], "limit")).toEqual([5000]);
    expect(r.versies[0]).toEqual({
      tellingId: "t1",
      nr: 1,
      createdAt: "2026-01-02T10:00:00Z",
      resultaat: { totaal: 150, maxHuur: 900.5, seg: "midden" },
    });
    expect(r.limietBereikt).toBe(false);
  });

  it("limiet bereikt wordt gemeld", async () => {
    const rij = { telling_id: "t", nr: 1, createdAt: null, totaal: 1, maxHuur: 1, seg: "laag" };
    const { db } = nepDb(() => ({ data: [rij, rij, rij] }));
    expect((await haalDashboardVersies(db, 3)).limietBereikt).toBe(true);
  });
});

describe("versies bijwerken, hernoemen en verwijderen", () => {
  const versieData = () => ({
    nr: 2,
    notitie: "Oud",
    createdAt: "2026-01-01T00:00:00Z",
    meta: staat().meta,
    input: staat().input,
    normen: N,
    resultaat: { totaal: 1, exact: 1, seg: "laag", maxHuur: null, rows: [] },
  });

  it("werkVersieBij (store): bestaande data aangevuld met de wijziging (hernoemen)", async () => {
    const { db, log } = nepDb((a) =>
      stap(a, "maybeSingle")
        ? { data: { data: versieData() } }
        : stap(a, "update")
          ? { data: [{ id: "v0002" }] }
          : {},
    );
    const v = await maakTellingStore(db, N).werkVersieBij("t1", "v0002", { notitie: "Nieuw" });
    expect(v).toMatchObject({ id: "v0002", nr: 2, notitie: "Nieuw" });
    const upd = log.find((a) => stap(a, "update"))!;
    expect(upd.tabel).toBe("telling_versies");
    expect(
      (stap(upd, "update")![0] as { data: { notitie: string; nr: number } }).data,
    ).toMatchObject({
      notitie: "Nieuw",
      nr: 2,
    });
    expect(upd.stappen.filter(([s]) => s === "eq").map(([, a]) => a)).toEqual([
      ["telling_id", "t1"],
      ["id", "v0002"],
    ]);
  });

  it("werkVersieBij (store): fout als de versie weg is of niet gewijzigd mag worden", async () => {
    const weg = nepDb(() => ({ data: null }));
    await expect(maakTellingStore(weg.db, N).werkVersieBij("t1", "v9", {})).rejects.toThrow(
      /bestaat niet meer/,
    );
    const rls = nepDb((a) =>
      stap(a, "maybeSingle") ? { data: { data: versieData() } } : { data: [] },
    );
    await expect(maakTellingStore(rls.db, N).werkVersieBij("t1", "v0002", {})).rejects.toThrow(
      /mag hem niet wijzigen/,
    );
  });

  it("verwijderVersie: delete op telling en versie; 0 rijen is een fout", async () => {
    const goed = nepDb(() => ({ data: [{ id: "v0002" }] }));
    await maakTellingStore(goed.db, N).verwijderVersie("t1", "v0002");
    expect(stap(goed.log[0], "delete")).toEqual([]);
    const rls = nepDb(() => ({ data: [] }));
    await expect(maakTellingStore(rls.db, N).verwijderVersie("t1", "v0002")).rejects.toThrow(
      /mag hem niet verwijderen/,
    );
  });

  it("werkVersieBij (opslaan op een werkversie gebaseerd op versie X): X krijgt de werkversie, daarna wordt de telling opgeslagen", async () => {
    const { db, log } = nepDb((a) =>
      stap(a, "maybeSingle")
        ? { data: { data: versieData() } }
        : stap(a, "update")
          ? { data: [{ id: "x" }] }
          : {},
    );
    const store = maakTellingStore(db, N);
    const s = { ...staat(2), basedOn: 2 };
    s.meta.naam = "Bijgewerkt";
    const v = await werkVersieBij(store, {
      id: "t1",
      isNieuw: false,
      staat: s,
      normen: N,
      bewerker: ADMIN,
      versie: { ...(versieData() as object), id: "v0002" } as never,
      nu: NU,
    });
    expect(v.meta.naam).toBe("Bijgewerkt");
    expect(v.notitie).toBe("Oud"); // naam van de versie blijft
    expect(v.bewerktOp).toBe(NU.toISOString());
    expect(v.resultaat.totaal).toBeGreaterThan(1);
    const updates = log.filter((a) => stap(a, "update")).map((a) => a.tabel);
    expect(updates).toEqual(["telling_versies", "tellingen"]);
  });
});

describe("zetFavoriet", () => {
  it("bewaart de telling met alleen favoriet gewijzigd", async () => {
    const { db, log } = nepDb(updateLukt);
    const doc = maakTellingDoc(staat(1), N, ADMIN, NU);
    await maakTellingStore(db, N).zetFavoriet(
      { ...doc, id: "t1", ownerId: "u1", ownerNaam: "Anna", gewijzigdOp: "x" },
      true,
    );
    const data = (stap(log[0], "update")![0] as { data: typeof doc }).data;
    expect(data).toEqual({ ...doc, meta: { ...doc.meta, favoriet: true } });
    // updatedAt en lastEditedBy blijven staan: favoriet markeren is geen bewerking
    expect(data.updatedAt).toBe(doc.updatedAt);
    expect(data.lastEditedBy).toEqual(doc.lastEditedBy);
    expect("id" in data || "ownerId" in data).toBe(false);
  });
});
