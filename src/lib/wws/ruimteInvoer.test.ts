import { describe, expect, it } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import { calc } from "./calc";
import { legeInput } from "./legeInput";
import {
  aantalZonderType,
  zonderTypeMelding,
  zonderTypeNotitie,
  m2Berekend,
  ruimteOpmerking,
  verwijderMaat,
  voegMaatToe,
  zetM2,
  zetMaat,
} from "./ruimteInvoer";

const N = DEFAULT_NORMEN as unknown as Normen;

describe("lengte × breedte per ruimte (zoals wws-site.html)", () => {
  it("oppervlak volgt de maten; een minteken trekt af; leeg zonder volledige maat", () => {
    let r = { type: "woonkamer", m2: "", maten: [{ l: "", b: "" }] };
    r = zetMaat(r, 0, "l", "5,5");
    expect(r.m2).toBe("");
    r = zetMaat(r, 0, "b", "4");
    expect(r.m2).toBe("22");
    r = voegMaatToe(r);
    expect(r.maten).toHaveLength(2);
    r = zetMaat(r, 1, "l", "-0,3");
    r = zetMaat(r, 1, "b", "0,6");
    expect(r.m2).toBe("21,82");
    expect(m2Berekend(r)).toBe(true);
    // een maat weg: oppervlak opnieuw
    expect(verwijderMaat(r, 1).m2).toBe("22");
    // de laatste volledige maat weg: oppervlak blijft staan (zoals de bron)
    const leeg = verwijderMaat({ ...r, maten: [{ l: "5", b: "4" }], m2: "20" }, 0);
    expect(leeg.m2).toBe("20");
    expect(leeg.maten).toEqual([]);
  });

  it("nooit negatief; origineel ongewijzigd", () => {
    const r = { m2: "", maten: [{ l: "-2", b: "3" }] };
    expect(zetMaat(r, 0, "b", "4").m2).toBe("0");
    expect(r.maten[0]!.b).toBe("3");
  });

  it("m² met de hand: herkomst van de plattegrond wordt 'aangepast'", () => {
    expect(zetM2({ m2: "10", herkomst: "Plattegrond: berekend (afgelezen)" }, "12").herkomst).toBe(
      "Plattegrond, aangepast (afgelezen)",
    );
    expect(zetM2({ m2: "10", herkomst: "Plattegrond, gecontroleerd" }, "12").herkomst).toBe(
      "Plattegrond, gecontroleerd",
    );
    expect(zetM2({ m2: "10" }, "12")).toEqual({ m2: "12" });
  });
});

describe("opmerking per ruimte (roomTable)", () => {
  it("verkeersruimte, kleine overige ruimte, toilet, herkomst", () => {
    expect(ruimteOpmerking("overig", { type: "hal", m2: 6 }, N)?.tekst).toBe(
      "Geen oppervlaktepunten, wel verwarming",
    );
    expect(ruimteOpmerking("overig", { type: "berging_in", m2: "1,5" }, N)?.tekst).toBe(
      "Kleiner dan 2 m²: geen oppervlaktepunten.",
    );
    expect(ruimteOpmerking("overig", { type: "toilet", m2: 1.2 }, N)?.tekst).toBe(
      "Kleiner dan 2 m²: geen oppervlaktepunten. Het toilet zelf telt bij rubriek 6 (Sanitair).",
    );
    expect(ruimteOpmerking("vertrekken", { type: "slaapkamer", m2: 1.5 }, N)).toBeNull();
    expect(
      ruimteOpmerking(
        "vertrekken",
        { type: "slaapkamer", m2: 9, herkomst: "Plattegrond: ingeschat" },
        N,
      ),
    ).toEqual({ tekst: "Plattegrond: ingeschat", ingeschat: true });
    expect(ruimteOpmerking("overig", { type: "berging_in", m2: 0 }, N)).toBeNull();
  });
});

describe("ruimte zonder soort (nieuwe ruimte, zoals de bron)", () => {
  it("telt in calc() mee als overig vertrek / overige ruimte, net als de bron", () => {
    const a = legeInput();
    a.vertrekken.push({ type: "", m2: 12, verwarmd: true });
    a.overig.push({ type: "", m2: 5, verwarmd: false });
    const b = legeInput();
    b.vertrekken.push({ type: "overig", m2: 12, verwarmd: true });
    b.overig.push({ type: "overig", m2: 5, verwarmd: false });
    expect(calc(a, N).rows).toEqual(calc(b, N).rows);
  });

  it("telt de ruimten zonder soort en geeft een duidelijke melding", () => {
    const i = legeInput();
    expect(aantalZonderType(i)).toBe(0);
    expect(zonderTypeMelding(0)).toBeNull();
    i.vertrekken.push(
      { type: "", m2: "", verwarmd: true },
      { type: "slaapkamer", m2: 9, verwarmd: true },
    );
    i.overig.push({ type: "", m2: "", verwarmd: false });
    expect(aantalZonderType(i)).toBe(2);
    expect(zonderTypeMelding(1)).toBe(
      "1 ruimte heeft nog geen soort. Kies het soort ruimte; tot dan telt hij mee als overig vertrek of overige ruimte.",
    );
    expect(zonderTypeMelding(2)).toMatch(/^2 ruimten hebben nog geen soort/);
    expect(zonderTypeNotitie("vertrekken")).toMatch(/overig vertrek\.$/);
    expect(zonderTypeNotitie("overig")).toMatch(/overige ruimte\.$/);
  });
});
