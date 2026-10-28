import { describe, expect, it } from "vitest";
import { MAX_WONING_FOTOS } from "../foto/sorteren";
import {
  bestandSoort,
  isVerborgen,
  keuzeOpties,
  keuzeVan,
  metKeuze,
  metVerdiepingen,
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

  it("metSortering: per foto in volgorde; plattegrond van de AI met verdieping, anders → niet", () => {
    expect(teSorteren(items).map((x) => x.pad)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    const m = metSortering(items, [s("keuken"), s("plattegrond"), s("anders")]);
    expect(m.map((x) => [x.pad, x.label, x.bron, x.sortering?.soort, x.verdieping])).toEqual([
      ["a.jpg", "foto", null, "keuken", undefined],
      ["b.jpg", "plattegrond", "ai", "plattegrond", "1e verdieping"],
      ["c.jpg", "niet", null, "anders", undefined],
      ["d.pdf", "plattegrond", "pdf", undefined, "Begane grond"],
    ]);
  });

  it("metVerdiepingen: uit de naam, anders de eerste vrije", () => {
    const r = verdeelMap([
      { pad: "Plattegrond 1e verdieping.pdf", type: "application/pdf", grootte: 1 },
      { pad: "Plattegrond berging.jpg", type: "image/jpeg", grootte: 1 },
      { pad: "tekening.pdf", type: "application/pdf", grootte: 1 },
      { pad: "tekening 2.pdf", type: "application/pdf", grootte: 1 },
    ]).items;
    expect(r.map((x) => x.verdieping)).toEqual([
      "1e verdieping",
      "Berging",
      "Begane grond",
      "2e verdieping",
    ]);
    // een al gekozen verdieping blijft staan
    expect(metVerdiepingen(r)).toEqual(r);
  });

  it("keuzeVan, metKeuze en keuzeOpties: één lijst met ruimten, verdiepingen en niet", () => {
    const m = metSortering(items, [s("keuken"), s("plattegrond"), s("toilet")]);
    expect(m.map(keuzeVan)).toEqual(["keuken", "1e verdieping", "toilet", "Begane grond"]);
    // foto → badkamer: zelf gekozen; terug naar keuken: de reden van Gemini
    const bad = metKeuze(m[0]!, "badkamer");
    expect(bad).toMatchObject({
      label: "foto",
      sortering: { soort: "badkamer", reden: "Zelf gekozen." },
    });
    expect(metKeuze(bad, "keuken").sortering).toEqual({ soort: "keuken", reden: "Zelf gekozen." });
    expect(metKeuze(m[0]!, "keuken")).toEqual(m[0]);
    // foto → plattegrond (verdieping) en weer terug
    const plat = metKeuze(m[2]!, "2e verdieping");
    expect(plat).toMatchObject({ label: "plattegrond", verdieping: "2e verdieping" });
    expect(keuzeVan(metKeuze(plat, "toilet"))).toBe("toilet");
    expect(keuzeVan(metKeuze(m[1]!, "niet"))).toBe("niet");
    // een PDF kan geen foto zijn; onbekende waarde verandert niets
    expect(metKeuze(m[3]!, "keuken")).toBe(m[3]);
    expect(metKeuze(m[3]!, "Kantine")).toBe(m[3]);
    expect(keuzeOpties(m[3]!)).toEqual({
      fotos: [],
      plattegronden: ["Begane grond", "1e verdieping", "2e verdieping", "3e verdieping", "Berging"],
    });
    expect(keuzeOpties(m[0]!).fotos).toEqual(["badkamer", "toilet", "keuken"]);
    // een foto zonder sortering (herkennen mislukt): "foto", ruimte later kiezen
    expect(keuzeVan(items[0]!)).toBe("foto");
    expect(keuzeOpties(items[0]!).fotos).toEqual(["badkamer", "toilet", "keuken", "foto"]);
    // een zolder uit de bestandsnaam staat er ook tussen
    const zolder = { ...m[3]!, verdieping: "Zolder" };
    expect(keuzeOpties(zolder).plattegronden).toContain("Zolder");
  });

  it("mapStappen: alle plattegronden, foto's met sortering; zelf omgezet → anders", () => {
    const m = metSortering(items, [s("keuken"), s("plattegrond"), s("toilet")]);
    // b.jpg zette de gebruiker terug naar foto; c.jpg niet gebruiken
    const na = m.map((x) =>
      x.pad === "b.jpg"
        ? { ...x, label: "foto" as const }
        : x.pad === "c.jpg"
          ? { ...x, label: "niet" as const }
          : x,
    );
    const r = mapStappen(na);
    expect(r.plattegronden).toEqual([3]);
    expect(r.verdiepingen).toEqual(["Begane grond"]);
    expect(r.fotos).toEqual([0, 1]);
    expect(r.sortering.map((x) => x.soort)).toEqual(["keuken", "anders"]);
    expect(r.fout).toBeNull();
    // twee plattegronden (verdiepingen) gaan allebei mee
    expect(mapStappen(m).plattegronden).toEqual([1, 3]);
    expect(mapStappen(m).verdiepingen).toEqual(["1e verdieping", "Begane grond"]);
    // twee keer dezelfde verdieping → fout
    expect(
      mapStappen(
        m.map((x) => metKeuze(x, x.label === "plattegrond" ? "Begane grond" : keuzeVan(x))),
      ).fout,
    ).toContain("dezelfde verdieping");
    expect(mapStappen(na.map((x) => ({ ...x, label: "niet" as const }))).fout).toContain(
      "Kies een plattegrond",
    );
  });

  it("mapStappen: meer dan 4 plattegronden → fout", () => {
    const veel = verdeelMap(
      Array.from({ length: 5 }, (_, i) => ({
        pad: `p${i}.pdf`,
        type: "application/pdf",
        grootte: 1,
      })),
    ).items;
    expect(mapStappen(veel).fout).toContain("Hoogstens 4 plattegronden");
  });
});
