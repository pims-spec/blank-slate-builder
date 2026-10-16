import { describe, expect, it } from "vitest";
import { leesImport } from "./importeren";

describe("import van adressen (Excel/CSV)", () => {
  it("kop op naam, ook na een titelregel; ongeldig, dubbel en lege rijen", () => {
    const u = leesImport([
      ["Portefeuille Oost"],
      ["Postcode", "Huisnummer", "Toevoeging"],
      ["1053 ZD", 49, "2"],
      ["1053zd", "49-2", ""], // dubbel van de vorige
      ["1012 JS", "1", ""],
      ["", "", ""],
      ["123", "4", ""],
      ["1012JS", "", ""],
      ["1012JS", "3a", ""],
    ]);
    expect(u.fout).toBeUndefined();
    expect(u.adressen).toEqual([
      { postcode: "1053ZD", huisnummer: 49, huisletter: "", toevoeging: "2" },
      { postcode: "1012JS", huisnummer: 1, huisletter: "", toevoeging: "" },
      { postcode: "1012JS", huisnummer: 3, huisletter: "A", toevoeging: "" },
    ]);
    expect(u.dubbel.map((d) => d.rij)).toEqual([4]);
    expect(u.ongeldig).toEqual([
      { rij: 7, reden: "ongeldige postcode" },
      { rij: 8, reden: "ongeldig huisnummer" },
    ]);
  });

  it("andere kolomnamen en volgorde, met huisletter", () => {
    const u = leesImport([
      ["Nr", "Huisletter", "PC", "Toev."],
      [12, "b", "2511 AA", "III"],
    ]);
    expect(u.adressen).toEqual([
      { postcode: "2511AA", huisnummer: 12, huisletter: "B", toevoeging: "III" },
    ]);
  });

  it("geen bruikbare kop, of leeg", () => {
    expect(
      leesImport([
        ["adres", "plaats"],
        ["Damrak 1", "Amsterdam"],
      ]).fout,
    ).toBe("geen_kop");
    expect(leesImport([["postcode", "huisnummer"]]).fout).toBe("leeg");
  });

  it("optioneel straat en woonplaats (ook als 'plaats')", () => {
    const u = leesImport([
      ["Postcode", "Huisnummer", "Straatnaam", "Plaats"],
      ["1053 ZD", "49", " Kinkerstraat ", "Amsterdam"],
      ["1053 ZD", "50", "", ""],
    ]);
    expect(u.adressen).toEqual([
      {
        postcode: "1053ZD",
        huisnummer: 49,
        huisletter: "",
        toevoeging: "",
        straat: "Kinkerstraat",
        woonplaats: "Amsterdam",
      },
      { postcode: "1053ZD", huisnummer: 50, huisletter: "", toevoeging: "" },
    ]);
  });
});
