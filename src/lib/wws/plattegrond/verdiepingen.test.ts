import { describe, expect, it } from "vitest";
import { PlattegrondAntwoord } from "../ai/antwoorden";
import { platToepassen, standaardKeuzes } from "./toepassen";
import {
  KOP_HOOGTE,
  leesVerdiepingen,
  ruimtenVanVerdieping,
  stapelMaten,
  stelVerdiepingVoor,
  verdiepingNotitie,
  verdiepingenVan,
  voegVerdiepingenSamen,
  zonderRuimtenVan,
  zonderVerdieping,
} from "./verdiepingen";
import { legeInput } from "..";

const antwoord = (x: unknown) => PlattegrondAntwoord.parse(x);
const bg = antwoord({
  maatvoering: "maten in mm",
  ruimten: [
    {
      soort: "vertrek",
      type: "woonkamer",
      naam: "Woonkamer",
      m2: 30,
      bron: "afgelezen",
      bbox: { x: 0, y: 0, w: 0.5, h: 0.5 },
    },
    { soort: "verkeer", type: "hal", naam: "Hal", m2: 4, bron: "afgelezen" },
    { soort: "overig", type: "toilet", naam: "", m2: 1.2, bron: "berekend" },
  ],
  keuken: { aanrecht_m: 2.4, bron: "afgelezen" },
  sanitair: { toilet_toiletruimte: 1 },
  buitenruimten: [{ naam: "Tuin", m2: 40, bron: "afgelezen" }],
  nameten: ["meterkast"],
});
const eerste = antwoord({
  maatvoering: "",
  ruimten: [
    {
      soort: "vertrek",
      type: "slaapkamer",
      naam: "Slaapkamer",
      m2: 12,
      bron: "afgelezen",
      bbox: { x: 0, y: 0, w: 0.3, h: 0.3 },
    },
    { soort: "vertrek", type: "badkamer", naam: "Badkamer", m2: 5, bron: "berekend" },
  ],
  keuken: {},
  sanitair: { toilet_toiletruimte: 1, douche: 1 },
  buitenruimten: [{ naam: "Balkon", m2: 6, bron: "berekend" }],
  nameten: ["schuine kap"],
});

describe("stelVerdiepingVoor", () => {
  it("uit de naam, anders op volgorde", () => {
    expect(stelVerdiepingVoor("Woning/Plattegrond BG.pdf", 3)).toBe("Begane grond");
    expect(stelVerdiepingVoor("begane_grond.jpg", 2)).toBe("Begane grond");
    expect(stelVerdiepingVoor("1e verdieping.png", 0)).toBe("1e verdieping");
    expect(stelVerdiepingVoor("plattegrond-2e-verd.jpg", 0)).toBe("2e verdieping");
    expect(stelVerdiepingVoor("verdieping 1.jpg", 0)).toBe("1e verdieping");
    expect(stelVerdiepingVoor("Zolder.jpg", 0)).toBe("Zolder");
    expect(stelVerdiepingVoor("kelder.png", 1)).toBe("Kelder");
    expect(stelVerdiepingVoor("tekening.pdf", 0)).toBe("Begane grond");
    expect(stelVerdiepingVoor("tekening.pdf", 2)).toBe("2e verdieping");
  });
});

describe("verdiepingNotitie", () => {
  it("de verdieping eerst, dan de eigen tekst; hoogstens 500 tekens", () => {
    expect(verdiepingNotitie("1e verdieping", "")).toBe(
      "Deze tekening is de 1e verdieping van de woning. Neem alleen de ruimten op deze tekening op.",
    );
    expect(verdiepingNotitie("Zolder", " maten in mm ")).toMatch(
      /de zolder van de woning\. .* maten in mm$/,
    );
    expect(verdiepingNotitie("Zolder", "x".repeat(600))).toHaveLength(500);
  });
});

describe("voegVerdiepingenSamen", () => {
  it("één verdieping: ongewijzigd (met bbox)", () => {
    const r = voegVerdiepingenSamen([{ verdieping: "Begane grond", R: bg }]);
    expect(r.R).toBe(bg);
    expect(r.verdiepingen).toEqual(["Begane grond", "Begane grond", "Begane grond"]);
  });

  it("meer: alle ruimten met verdieping in de naam, zonder bbox; langste aanrecht; opgeteld", () => {
    const r = voegVerdiepingenSamen([
      { verdieping: "Begane grond", R: bg },
      { verdieping: "1e verdieping", R: eerste },
    ]);
    expect(r.R.ruimten.map((x) => x.naam)).toEqual([
      "Woonkamer (Begane grond)",
      "Hal (Begane grond)",
      "Begane grond",
      "Slaapkamer (1e verdieping)",
      "Badkamer (1e verdieping)",
    ]);
    expect(r.R.ruimten.every((x) => x.bbox === undefined)).toBe(true);
    expect(r.verdiepingen).toEqual([
      "Begane grond",
      "Begane grond",
      "Begane grond",
      "1e verdieping",
      "1e verdieping",
    ]);
    expect(r.R.keuken).toEqual({ aanrecht_m: 2.4, bron: "afgelezen" });
    expect(r.R.sanitair).toMatchObject({ toilet_toiletruimte: 2, douche: 1 });
    expect(r.R.buitenruimten.map((b) => b.naam)).toEqual([
      "Tuin (Begane grond)",
      "Balkon (1e verdieping)",
    ]);
    expect(r.R.nameten).toEqual(["Begane grond: meterkast", "1e verdieping: schuine kap"]);
    expect(r.R.maatvoering).toBe("Begane grond: maten in mm; 1e verdieping: onbekend");
  });

  it("samen in de telling: alle ruimten, m² en buitenruimte opgeteld", () => {
    const { R } = voegVerdiepingenSamen([
      { verdieping: "Begane grond", R: bg },
      { verdieping: "1e verdieping", R: eerste },
    ]);
    const I = platToepassen(legeInput(), R, standaardKeuzes(R));
    expect(I.vertrekken.map((v) => [v.naam, v.m2])).toEqual([
      ["Woonkamer (Begane grond)", "30"],
      ["Slaapkamer (1e verdieping)", "12"],
      ["Badkamer (1e verdieping)", "5"],
    ]);
    expect(I.overig.map((o) => o.naam)).toEqual(["Hal (Begane grond)", "Begane grond"]);
    expect(I.buiten.ruimten).toHaveLength(1);
    expect(I.buiten.ruimten[0]!.m2).toBe("46");
  });
});

describe("stapelMaten", () => {
  it("onder elkaar, even breed, kleinere in het midden, met kop", () => {
    const r = stapelMaten([
      { breedte: 1000, hoogte: 800 },
      { breedte: 500, hoogte: 400 },
    ]);
    expect(r.breedte).toBe(1000);
    expect(r.kop).toBe(KOP_HOOGTE);
    expect(r.delen).toEqual([
      { x: 0, y: KOP_HOOGTE, w: 1000, h: 800, kopY: Math.round(KOP_HOOGTE * 0.7) },
      {
        x: 250,
        y: 2 * KOP_HOOGTE + 800,
        w: 500,
        h: 400,
        kopY: KOP_HOOGTE + 800 + Math.round(KOP_HOOGTE * 0.7),
      },
    ]);
    expect(r.hoogte).toBe(2 * KOP_HOOGTE + 1200);
  });

  it("breder dan 2200 → smaller; te hoog → alles naar verhouding kleiner", () => {
    const breed = stapelMaten([{ breedte: 4400, hoogte: 2200 }]);
    expect(breed.breedte).toBe(2200);
    expect(breed.delen[0]).toMatchObject({ w: 2200, h: 1100 });
    const hoog = stapelMaten(
      [
        { breedte: 1000, hoogte: 1000 },
        { breedte: 1000, hoogte: 1000 },
      ],
      2200,
      1000,
    );
    expect(hoog.hoogte).toBeLessThanOrEqual(1001);
    expect(hoog.breedte).toBeLessThan(1000);
  });
});

describe("verdieping verwijderen", () => {
  const drie = verdiepingenVan(
    stapelMaten([
      { breedte: 1000, hoogte: 800 },
      { breedte: 500, hoogte: 400 },
      { breedte: 800, hoogte: 600 },
    ]),
    ["Begane grond", "1e verdieping", "Zolder"],
  );
  const plat = (verdiepingen: unknown, breedte = 1000, hoogte = 2000) =>
    ({ pad: "x", breedte, hoogte, verdiepingen }) as never;

  it("verdiepingenVan: de tekeningen zonder kop", () => {
    expect(drie[1]).toEqual({
      naam: "1e verdieping",
      x: 250,
      y: 2 * KOP_HOOGTE + 800,
      w: 500,
      h: 400,
    });
  });

  it("leesVerdiepingen: alleen 2–4 geldige, unieke en binnen de afbeelding", () => {
    expect(leesVerdiepingen(plat(drie))).toEqual(drie);
    expect(leesVerdiepingen(undefined)).toEqual([]);
    expect(leesVerdiepingen(plat(undefined))).toEqual([]);
    expect(leesVerdiepingen(plat([drie[0]]))).toEqual([]);
    expect(leesVerdiepingen(plat([drie[0], { ...drie[1], naam: "Begane grond" }]))).toEqual([]);
    expect(leesVerdiepingen(plat(drie, 1000, 1500))).toEqual([]);
    expect(leesVerdiepingen(plat([drie[0], { ...drie[1], w: -5 }]))).toEqual([]);
    expect(leesVerdiepingen(plat([drie[0], { ...drie[1], naam: "<x>".repeat(20) }]))).toEqual([]);
  });

  it("zonderVerdieping: de rest opnieuw onder elkaar, met hun eigen maten", () => {
    const r = zonderVerdieping(drie, 1);
    expect(r.stukken.map((s) => s.bron.naam)).toEqual(["Begane grond", "Zolder"]);
    expect(r.stukken[1]!.doel).toMatchObject({ x: 100, y: 2 * KOP_HOOGTE + 800, w: 800, h: 600 });
    expect(r.breedte).toBe(1000);
    expect(r.hoogte).toBe(2 * KOP_HOOGTE + 1400);
    expect(r.verdiepingen!.map((v) => v.naam)).toEqual(["Begane grond", "Zolder"]);
  });

  it("zonderVerdieping: één over → alleen die tekening, zonder kop en zonder verdiepingen", () => {
    const r = zonderVerdieping(zonderVerdieping(drie, 2).verdiepingen!, 0);
    expect(r).toMatchObject({ breedte: 500, hoogte: 400, kop: 0, verdiepingen: null });
    expect(r.stukken).toHaveLength(1);
    expect(r.stukken[0]!.doel).toEqual({ x: 0, y: 0, w: 500, h: 400, kopY: 0 });
  });

  it("ruimten krijgen hun verdieping; ruimtenVanVerdieping en zonderRuimtenVan", () => {
    const { R, verdiepingen } = voegVerdiepingenSamen([
      { verdieping: "Begane grond", R: bg },
      { verdieping: "1e verdieping", R: eerste },
    ]);
    const I = platToepassen(legeInput(), R, standaardKeuzes(R), { verdiepingen });
    expect(I.vertrekken.map((v) => v.verdieping)).toEqual([
      "Begane grond",
      "1e verdieping",
      "1e verdieping",
    ]);
    expect(ruimtenVanVerdieping(I, "1e verdieping")).toBe(2);
    expect(ruimtenVanVerdieping(I, "Begane grond")).toBe(3);
    const zonder = zonderRuimtenVan(I, "1e verdieping");
    expect(zonder.vertrekken.map((v) => v.naam)).toEqual(["Woonkamer (Begane grond)"]);
    expect(zonder.overig).toHaveLength(2);
    expect(I.vertrekken).toHaveLength(3);
  });
});
