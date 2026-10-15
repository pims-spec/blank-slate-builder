import { describe, expect, it } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { maakTellingStore } from "../opslag/store";
import { nepDb } from "../opslag/nepDb";
import { nepBucket } from "./nepBucket";
import {
  GeenAfbeeldingFout,
  MAX_BYTES,
  PAD_RE,
  herkenAfbeelding,
  maakPlattegrondOpslag,
  nieuwPad,
  oudeAfbeeldingOpruimen,
  padVanTelling,
} from "./opslag";

const T = "5f46eb74-5353-49f8-a1fe-0f1d1ad6faa1";
const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(32).fill(0)]);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);
const tekst = (s: string) => new TextEncoder().encode(s);

describe("herkenAfbeelding (magic bytes)", () => {
  it("herkent JPEG, PNG en WebP", () => {
    expect(herkenAfbeelding(JPEG)).toBe("image/jpeg");
    expect(herkenAfbeelding(PNG)).toBe("image/png");
    expect(herkenAfbeelding(WEBP)).toBe("image/webp");
  });
  it("weigert al het andere, ook met een misleidende naam of te weinig bytes", () => {
    expect(herkenAfbeelding(tekst("%PDF-1.7 …"))).toBeNull();
    expect(herkenAfbeelding(tekst("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(herkenAfbeelding(tekst("GIF89a"))).toBeNull();
    expect(herkenAfbeelding(tekst("<html><script>"))).toBeNull();
    expect(herkenAfbeelding(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(
      herkenAfbeelding(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)),
    ).toBeNull(); // RIFF/WAVE
    expect(herkenAfbeelding(new Uint8Array())).toBeNull();
  });
});

describe("paden", () => {
  it("nieuwPad volgt het patroon van telling_id_uit_pad()", () => {
    const p = nieuwPad(T, "image/jpeg");
    expect(p).toMatch(PAD_RE);
    expect(p.startsWith(T + "/")).toBe(true);
    expect(p.endsWith(".jpg")).toBe(true);
  });
  it("weigert een telling-id dat geen uuid is", () => {
    expect(() => nieuwPad("../andere", "image/jpeg")).toThrow();
    expect(() => nieuwPad(T + "/x", "image/png")).toThrow();
  });
  it("padVanTelling: alleen een geldig pad onder deze telling", () => {
    const p = nieuwPad(T, "image/png");
    expect(padVanTelling(p, T)).toBe(true);
    expect(padVanTelling(p, "11111111-1111-1111-1111-111111111111")).toBe(false);
    expect(padVanTelling("../" + p, T)).toBe(false);
    expect(padVanTelling(42, T)).toBe(false);
  });
});

describe("maakPlattegrondOpslag", () => {
  it("uploadt met het contentType uit de echte inhoud, zonder overschrijven", async () => {
    const { bucket, bestanden, log } = nepBucket();
    const o = maakPlattegrondOpslag(bucket);
    const ref = await o.bewaar(T, PNG, { breedte: 1200.4, hoogte: 800.6 });
    expect(ref).toEqual({ pad: expect.stringMatching(PAD_RE), breedte: 1200, hoogte: 801 });
    expect(ref.pad.endsWith(".png")).toBe(true);
    const [, [pad, opties]] = log[0]!;
    expect(pad).toBe(ref.pad);
    expect(opties).toEqual({ contentType: "image/png", upsert: false, cacheControl: "3600" });
    expect(bestanden.get(ref.pad)!.blob.type).toBe("image/png");
  });

  it("weigert een bestand dat geen afbeelding is, of te groot is, vóór het uploaden", async () => {
    const { bucket, log } = nepBucket();
    const o = maakPlattegrondOpslag(bucket);
    await expect(o.bewaar(T, tekst("%PDF-1.4"), { breedte: 1, hoogte: 1 })).rejects.toBeInstanceOf(
      GeenAfbeeldingFout,
    );
    const groot = new Uint8Array(MAX_BYTES + 1);
    groot.set(JPEG);
    await expect(o.bewaar(T, groot, { breedte: 1, hoogte: 1 })).rejects.toThrow(/10 MB/);
    await expect(o.bewaar("geen-uuid", JPEG, { breedte: 1, hoogte: 1 })).rejects.toThrow();
    expect(log).toHaveLength(0);
  });

  it("geeft uploadfouten door", async () => {
    const fout = { message: "new row violates row-level security policy" };
    const o = maakPlattegrondOpslag(nepBucket({ upload: fout }).bucket);
    await expect(o.bewaar(T, JPEG, { breedte: 1, hoogte: 1 })).rejects.toBe(fout);
  });

  it("verwijderMap: alle bestanden van de telling (ook meer dan één pagina), andere niet", async () => {
    const { bucket, bestanden } = nepBucket();
    const o = maakPlattegrondOpslag(bucket);
    const ander = "11111111-1111-1111-1111-111111111111";
    for (let i = 0; i < 230; i++) await o.bewaar(T, JPEG, { breedte: 1, hoogte: 1 });
    const blijft = await o.bewaar(ander, JPEG, { breedte: 1, hoogte: 1 });
    await o.verwijderMap(T);
    expect([...bestanden.keys()]).toEqual([blijft.pad]);
  });

  it("haal en verwijder accepteren alleen geldige paden", async () => {
    const { bucket, log } = nepBucket();
    const o = maakPlattegrondOpslag(bucket);
    await expect(o.haal("../../geheim.jpg")).rejects.toThrow(/Ongeldig/);
    await o.verwijder(["../../geheim.jpg", ""]);
    expect(log).toHaveLength(0);
  });
});

describe("telling verwijderen ruimt Storage op", () => {
  const N = DEFAULT_NORMEN as unknown as Normen;

  it("eerst de afbeeldingen, dan de telling", async () => {
    const { bucket, bestanden, log: blog } = nepBucket();
    await maakPlattegrondOpslag(bucket).bewaar(T, JPEG, { breedte: 1, hoogte: 1 });
    const { db, log } = nepDb(() => ({}), bucket);
    await maakTellingStore(db, N).verwijder(T);
    expect(bestanden.size).toBe(0);
    expect(blog.some(([s]) => s === "remove")).toBe(true);
    expect(log[0]?.tabel).toBe("tellingen");
  });

  it("lukt het opruimen niet, dan blijft de telling staan", async () => {
    const fout = { message: "storage onbereikbaar" };
    const { bucket } = nepBucket({ list: fout });
    const { db, log } = nepDb(() => ({}), bucket);
    await expect(maakTellingStore(db, N).verwijder(T)).rejects.toBe(fout);
    expect(log).toHaveLength(0);
  });
});

describe("oudeAfbeeldingOpruimen (bij vervangen)", () => {
  const a = { pad: nieuwPad(T, "image/jpeg"), breedte: 1, hoogte: 1 };
  const b = { pad: nieuwPad(T, "image/jpeg"), breedte: 1, hoogte: 1 };
  it("de oude weg, behalve als een versie hem nog gebruikt", () => {
    expect(oudeAfbeeldingOpruimen(a, b, [])).toEqual([a.pad]);
    expect(oudeAfbeeldingOpruimen(a, null, [undefined])).toEqual([a.pad]);
    expect(oudeAfbeeldingOpruimen(a, b, [a.pad])).toEqual([]);
    expect(oudeAfbeeldingOpruimen(a, a, [])).toEqual([]);
    expect(oudeAfbeeldingOpruimen(null, b, [])).toEqual([]);
  });
});
