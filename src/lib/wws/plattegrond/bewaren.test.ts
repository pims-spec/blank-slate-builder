import { describe, expect, it } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { nieuweTellingStaat } from "../opslag/doc";
import { nepDb } from "../opslag/nepDb";
import { maakTellingStore } from "../opslag/store";
import { bewaarBeeld, ruimOudBeeldOp } from "./bewaren";
import { nepBucket } from "./nepBucket";
import { maakPlattegrondOpslag, nieuwPad } from "./opslag";

const N = DEFAULT_NORMEN as unknown as Normen;
const T = "5f46eb74-5353-49f8-a1fe-0f1d1ad6faa1";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(20).fill(0)]);

function opzet() {
  const b = nepBucket();
  const { db, log } = nepDb(() => ({ data: [{ id: T }] }), b.bucket);
  return {
    ...b,
    store: maakTellingStore(db, N),
    opslag: maakPlattegrondOpslag(b.bucket),
    dblog: log,
  };
}

describe("bewaarBeeld", () => {
  it("nieuwe telling: eerst aanmaken, dan uploaden; de telling krijgt alleen de verwijzing", async () => {
    const { store, opslag, bestanden, dblog } = opzet();
    const staat = nieuweTellingStaat("Pim");
    staat.input.plattegrondImg = "data:image/jpeg;base64,AAAA";
    const r = await bewaarBeeld({
      store,
      opslag,
      id: T,
      isNieuw: true,
      staat,
      normen: N,
      bewerker: null,
      beeld: { bytes: JPEG, breedte: 800, hoogte: 600 },
    });
    expect(dblog[0]?.stappen[0]?.[0]).toBe("insert");
    expect(r.isNieuw).toBe(false);
    expect(r.staat.input.plattegrond).toEqual({
      pad: [...bestanden.keys()][0],
      breedte: 800,
      hoogte: 600,
    });
    expect(r.staat.input.plattegrondImg).toBeUndefined();
    expect(JSON.stringify(r.staat)).not.toContain("base64");
  });

  it("meer verdiepingen: de plek per verdieping gaat mee in de verwijzing", async () => {
    const { store, opslag } = opzet();
    const verdiepingen = [
      { naam: "Begane grond", x: 0, y: 56, w: 800, h: 250 },
      { naam: "1e verdieping", x: 0, y: 362, w: 800, h: 238 },
    ];
    const r = await bewaarBeeld({
      store,
      opslag,
      id: T,
      isNieuw: true,
      staat: nieuweTellingStaat("Pim"),
      normen: N,
      bewerker: null,
      beeld: { bytes: JPEG, breedte: 800, hoogte: 600, verdiepingen },
    });
    expect(r.staat.input.plattegrond?.verdiepingen).toEqual(verdiepingen);
  });

  it("zonder nieuw beeld: niets", async () => {
    const { store, opslag, dblog, log } = opzet();
    const staat = nieuweTellingStaat("Pim");
    expect(
      await bewaarBeeld({
        store,
        opslag,
        id: T,
        isNieuw: true,
        staat,
        normen: N,
        bewerker: null,
        beeld: null,
      }),
    ).toEqual({ staat, isNieuw: true });
    expect(dblog).toHaveLength(0);
    expect(log).toHaveLength(0);
  });
});

describe("ruimOudBeeldOp", () => {
  it("vorige afbeelding weg, behalve als een versie hem gebruikt", async () => {
    const { opslag, bestanden } = opzet();
    const a = await opslag.bewaar(T, JPEG, { breedte: 1, hoogte: 1 });
    const b = await opslag.bewaar(T, JPEG, { breedte: 1, hoogte: 1 });
    const versie = { input: { ...nieuweTellingStaat("").input, plattegrond: a } };
    await ruimOudBeeldOp(opslag, a.pad, b.pad, [versie]);
    expect(bestanden.has(a.pad)).toBe(true);
    await ruimOudBeeldOp(opslag, a.pad, b.pad, []);
    expect(bestanden.has(a.pad)).toBe(false);
    expect(bestanden.has(b.pad)).toBe(true);
    // verwijderd zonder nieuwe: ook weg
    await ruimOudBeeldOp(opslag, b.pad, null, []);
    expect(bestanden.size).toBe(0);
    await ruimOudBeeldOp(opslag, nieuwPad(T, "image/jpeg"), null, []); // bestaat niet: geen fout
  });
});

describe("ruimOngebruiktOp", () => {
  it("alleen afbeeldingen die niemand meer gebruikt", async () => {
    const { ruimOngebruiktOp } = await import("./bewaren");
    const b = nepBucket();
    const opslag = maakPlattegrondOpslag(b.bucket);
    const a = await opslag.bewaar(T, JPEG, { breedte: 1, hoogte: 1 });
    const c = await opslag.bewaar(T, JPEG, { breedte: 1, hoogte: 1 });
    await ruimOngebruiktOp(opslag, [a.pad, c.pad, null, a.pad], [{ plattegrond: c }, {}]);
    expect([...b.bestanden.keys()]).toEqual([c.pad]);
  });
  it("een plattegrond voor het rapport telt ook als gebruikt", async () => {
    const { ruimOngebruiktOp } = await import("./bewaren");
    const b = nepBucket();
    const opslag = maakPlattegrondOpslag(b.bucket);
    const a = await opslag.bewaar(T, JPEG, { breedte: 1, hoogte: 1 });
    const c = await opslag.bewaar(T, JPEG, { breedte: 1, hoogte: 1 });
    await ruimOngebruiktOp(
      opslag,
      [a.pad, c.pad],
      [{ rapportPlattegronden: [{ ...a, soort: "2d" }] }],
    );
    expect([...b.bestanden.keys()]).toEqual([a.pad]);
  });
});
