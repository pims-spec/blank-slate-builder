import { describe, expect, it } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "./normen";
import {
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
