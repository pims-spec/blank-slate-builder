import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { maakTellingDoc, nieuweTellingStaat, type TellingStaat } from "./doc";
import { legVersieVast, maakTellingStore, slaWerkversieOp } from "./store";

const N = DEFAULT_NORMEN as unknown as Normen;
const NU = new Date("2026-10-14T10:00:00.000Z");
const ADMIN = { id: "admin-1", naam: "Beheerder", email: "admin@x.nl" };

interface Aanroep {
  tabel: string;
  stappen: [string, unknown[]][];
}
interface Antwoord {
  data?: unknown;
  error?: unknown;
}

/** Nep-Supabase: legt elke querybouwer-aanroep vast en geeft per query een antwoord. */
function nepDb(antwoord: (a: Aanroep) => Antwoord = () => ({})) {
  const log: Aanroep[] = [];
  const db = {
    from(tabel: string) {
      const a: Aanroep = { tabel, stappen: [] };
      log.push(a);
      const bouwer: object = new Proxy(
        {},
        {
          get(_doel, prop) {
            if (prop === "then") {
              const res = { data: null, error: null, ...antwoord(a) };
              return (ok: (r: unknown) => unknown, fout: (e: unknown) => unknown) =>
                Promise.resolve(res).then(ok, fout);
            }
            return (...args: unknown[]) => {
              a.stappen.push([String(prop), args]);
              return bouwer;
            };
          },
        },
      );
      return bouwer;
    },
  };
  return { db: db as unknown as SupabaseClient<Database>, log };
}

const stap = (a: Aanroep | undefined, naam: string) => a?.stappen.find(([s]) => s === naam)?.[1];

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
    expect(lijst[0]?.gewijzigdOp).toBe("2026-10-14T11:00:00Z");
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
