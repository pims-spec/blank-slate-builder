import { describe, expect, it } from "vitest";
import { MAX_WONING_FOTOS } from "../foto/sorteren";
import {
  bestandSoort,
  isVerborgen,
  kiesPlattegrond,
  labelOpties,
  mapStappen,
  MAX_BESTAND_MB,
  metSortering,
  naamIsPlattegrond,
  teSorteren,
  verdeelMap,
  type MapBestand,
} from "./verdelen";

const jpg = (pad: string, grootte = 1000): MapBestand => ({ pad, type: "image/jpeg", grootte });

describe("herkennen", () => {
  it("bestandSoort: op type, anders op extensie; HEIC apart", () => {
    expect(bestandSoort("a.pdf", "application/pdf")).toBe("pdf");
    expect(bestandSoort("a.PDF", "")).toBe("pdf");
    expect(bestandSoort("a.jpg", "image/jpeg")).toBe("afbeelding");
    expect(bestandSoort("a.webp", "")).toBe("afbeelding");
    expect(bestandSoort("IMG_1.HEIC", "image/heic")).toBe("heic");
    expect(bestandSoort("IMG_1.heic", "")).toBe("heic");
    expect(bestandSoort("a.gif", "image/gif")).toBeNull();
    expect(bestandSoort("notities.docx", "application/vnd.openxml")).toBeNull();
    expect(bestandSoort("Google Doc", "application/vnd.google-apps.document")).toBeNull();
  });

  it("isVerborgen: macOS- en Windows-bestanden", () => {
    expect(isVerborgen("Woning/._keuken.jpg")).toBe(true);
    expect(isVerborgen(".DS_Store")).toBe(true);
    expect(isVerborgen("__MACOSX/keuken.jpg")).toBe(true);
    expect(isVerborgen("Woning/Thumbs.db")).toBe(true);
    expect(isVerborgen("Woning/keuken.jpg")).toBe(false);
  });

  it("naamIsPlattegrond: duidelijke woorden in de naam, niet in de map", () => {
    for (const n of [
      "Plattegrond BG.jpg",
      "plattegrond_1e_verdieping.png",
      "Bouwtekening.jpg",
      "floorplan.png",
      "Floor plan 2.jpg",
      "tekening-woning.jpg",
      "PG.jpg",
      "plan.png",
    ])
      expect(naamIsPlattegrond(n), n).toBe(true);
    for (const n of [
      "keuken.jpg",
      "IMG_2041.jpg",
      "Plattegrond/keuken.jpg",
      "planken.jpg",
      "zolder.jpg",
    ])
      expect(naamIsPlattegrond(n), n).toBe(false);
  });
});

describe("verdeelMap", () => {
  it("PDF en naam → plattegrond, afbeeldingen → foto, rest overgeslagen met reden; op pad gesorteerd", () => {
    const r = verdeelMap([
      jpg("Woning/IMG_10.jpg"),
      jpg("Woning/IMG_2.jpg"),
      { pad: "Woning/tekening.pdf", type: "application/pdf", grootte: 1000 },
      jpg("Woning/Plattegrond.jpg"),
      { pad: "Woning/IMG_3.HEIC", type: "image/heic", grootte: 1000 },
      { pad: "Woning/notities.txt", type: "text/plain", grootte: 10 },
      jpg("Woning/groot.jpg", MAX_BESTAND_MB * 1024 * 1024 + 1),
      jpg("Woning/._IMG_2.jpg"),
    ]);
    expect(r.items.map((x) => [x.pad, x.label, x.bron, x.i])).toEqual([
      ["Woning/IMG_2.jpg", "foto", null, 1],
      ["Woning/IMG_10.jpg", "foto", null, 0],
      ["Woning/Plattegrond.jpg", "plattegrond", "naam", 3],
      ["Woning/tekening.pdf", "plattegrond", "pdf", 2],
    ]);
    expect(r.overgeslagen.map((o) => o.pad)).toEqual([
      "Woning/groot.jpg",
      "Woning/IMG_3.HEIC",
      "Woning/notities.txt",
    ]);
    expect(r.overgeslagen[1]!.reden).toContain("HEIC");
  });

  it("hoogstens 30 foto's; een plattegrond telt niet mee", () => {
    const veel = Array.from({ length: MAX_WONING_FOTOS + 2 }, (_, i) => jpg(`f${i}.jpg`));
    const r = verdeelMap([...veel, jpg("zz plattegrond.jpg")]);
    expect(r.items.filter((x) => x.label === "foto")).toHaveLength(MAX_WONING_FOTOS);
    expect(r.items.filter((x) => x.label === "plattegrond")).toHaveLength(1);
    expect(r.overgeslagen).toHaveLength(2);
    expect(r.overgeslagen[0]!.reden).toContain("Meer dan 30");
  });
});

describe("na het sorteren", () => {
  const { items } = verdeelMap([
    jpg("a.jpg"),
    jpg("b.jpg"),
    jpg("c.jpg"),
    { pad: "d.pdf", type: "application/pdf", grootte: 1 },
  ]);
  const s = (soort: "keuken" | "toilet" | "plattegrond" | "anders") => ({ soort, reden: "Zo." });

  it("metSortering: per foto in volgorde; een plattegrond van de AI krijgt dat label", () => {
    expect(teSorteren(items).map((x) => x.pad)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    const m = metSortering(items, [s("keuken"), s("plattegrond"), s("anders")]);
    expect(m.map((x) => [x.pad, x.label, x.bron, x.sortering?.soort])).toEqual([
      ["a.jpg", "foto", null, "keuken"],
      ["b.jpg", "plattegrond", "ai", "plattegrond"],
      ["c.jpg", "foto", null, "anders"],
      ["d.pdf", "plattegrond", "pdf", undefined],
    ]);
  });

  it("kiesPlattegrond: PDF voor naam voor AI; geen → null", () => {
    const m = metSortering(items, [s("keuken"), s("plattegrond"), s("anders")]);
    expect(kiesPlattegrond(m)).toBe(3);
    expect(kiesPlattegrond(m.filter((x) => x.soort !== "pdf"))).toBe(1);
    expect(kiesPlattegrond(items.filter((x) => x.soort !== "pdf"))).toBeNull();
  });

  it("labelOpties: een PDF kan geen foto zijn", () => {
    expect(labelOpties(items[3]!)).toEqual(["plattegrond", "niet"]);
    expect(labelOpties(items[0]!)).toEqual(["plattegrond", "foto", "niet"]);
  });

  it("mapStappen: gekozen plattegrond, foto's met sortering; zelf omgezet → anders", () => {
    const m = metSortering(items, [s("keuken"), s("plattegrond"), s("toilet")]);
    // b.jpg zette de gebruiker terug naar foto; c.jpg niet gebruiken
    const na = m.map((x) =>
      x.pad === "b.jpg"
        ? { ...x, label: "foto" as const }
        : x.pad === "c.jpg"
          ? { ...x, label: "niet" as const }
          : x,
    );
    const r = mapStappen(na, 3);
    expect(r.plattegrond).toBe(3);
    expect(r.fotos).toEqual([0, 1]);
    expect(r.sortering.map((x) => x.soort)).toEqual(["keuken", "anders"]);
    expect(r.fout).toBeNull();
    // een plattegrond die niet (meer) zo gelabeld is, telt niet
    expect(mapStappen(na, 1).plattegrond).toBeNull();
    expect(
      mapStappen(
        na.map((x) => ({ ...x, label: "niet" as const })),
        3,
      ).fout,
    ).toContain("Kies een plattegrond");
  });
});
