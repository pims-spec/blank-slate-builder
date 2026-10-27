import { describe, expect, it } from "vitest";
import { legeInput } from "../legeInput";
import {
  adresSleutel,
  coropOphalenNodig,
  energieIsLeeg,
  monumentIsLeeg,
  monumentKeuzeVoor,
  monumentMelding,
} from "./automatisch";
import type { MonumentStatus } from "./monument";

const status = (over: Partial<MonumentStatus>): MonumentStatus => ({
  adres: "Keizersgracht 123, 1015CJ Amsterdam",
  rijksmonument: false,
  rijksmonumentNummers: [],
  gemeentelijkMonument: false,
  gezichten: [],
  voorstel: null,
  ...over,
});

describe("automatisch invullen na het adres", () => {
  it("COROP-gegevens opnieuw ophalen als ze ontbreken of bij een ander adres horen", () => {
    const g = {
      gemeentecode: "0363",
      gemeente: "Amsterdam",
      bouwjaar: 2020,
      adres: "1096GM|156||",
    };
    expect(coropOphalenNodig(undefined, "1096GM|156||")).toBe(true);
    expect(coropOphalenNodig(g, "1096GM|156||")).toBe(false);
    expect(coropOphalenNodig(g, "1015CJ|123||")).toBe(true);
    // opgehaald vóór het onthouden van het adres
    const { adres: _, ...zonderAdres } = g;
    expect(coropOphalenNodig(zonderAdres, "1096GM|156||")).toBe(true);
  });

  it("alleen lege velden: een nieuwe telling is leeg, een ingevuld label of index niet", () => {
    const x = legeInput();
    expect(energieIsLeeg(x.energie)).toBe(true);
    expect(energieIsLeeg({ ...x.energie, label: "C" })).toBe(false);
    expect(energieIsLeeg({ ...x.energie, soort: "index", indexKlasse: "4" })).toBe(false);
    expect(energieIsLeeg({ ...x.energie, soort: "bouwjaar", bouwjaar: "1930" })).toBe(false);
    expect(monumentIsLeeg(x.opslag.keuze)).toBe(true);
    expect(monumentIsLeeg("stads")).toBe(false);
  });

  it("rijksmonument wordt 'contract na 1 juli 2024'; gemeentelijk en stadsgezicht zoals gevonden", () => {
    expect(monumentKeuzeVoor(status({ rijksmonument: true, voorstel: "rijks" }))).toBe("rijks_na");
    expect(monumentKeuzeVoor(status({ gemeentelijkMonument: true, voorstel: "gemprov" }))).toBe(
      "gemprov",
    );
    expect(monumentKeuzeVoor(status({ gezichten: ["X"], voorstel: "stads" }))).toBe("stads");
    expect(monumentKeuzeVoor(status({}))).toBeNull();
    expect(
      monumentMelding(
        status({ rijksmonument: true, rijksmonumentNummers: ["2249"], voorstel: "rijks" }),
      ),
    ).toMatch(/^Rijksmonument 2249 ingevuld \(contract na 1 juli 2024\)/);
  });

  it("adresSleutel: zelfde adres, zelfde sleutel (ook met kleine letters)", () => {
    expect(adresSleutel({ postcode: "1053ZD", huisnummer: "49", huisnummertoevoeging: "2" })).toBe(
      adresSleutel({
        postcode: "1053zd",
        huisnummer: "49",
        huisletter: "",
        huisnummertoevoeging: "2",
      }),
    );
    expect(adresSleutel({ postcode: "1053ZD", huisnummer: "49" })).not.toBe(
      adresSleutel({ postcode: "1053ZD", huisnummer: "49", huisletter: "A" }),
    );
  });
});
