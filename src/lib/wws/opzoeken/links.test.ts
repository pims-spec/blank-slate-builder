import { describe, expect, it } from "vitest";
import { adresZoek, isVergrendeld, kopieerMelding } from "./links";

describe("opzoeklinks (zoals wws-site.html)", () => {
  it("adresZoek: WOZ met toevoeging, EP-Online alleen het nummer", () => {
    const m = { postcode: "1234 ab", huisnummer: " 12 A " };
    expect(adresZoek(m, "woz")).toBe("1234AB 12 A");
    expect(adresZoek(m, "ep")).toBe("1234AB 12");
    expect(adresZoek({ postcode: "1234AB", huisnummer: "" }, "woz")).toBe("");
    expect(adresZoek({ postcode: "", huisnummer: "12" }, "ep")).toBe("");
  });

  it("meldingen na kopiëren", () => {
    expect(kopieerMelding("woz", "1234AB 12", true)).toBe(
      "‘1234AB 12’ gekopieerd. Plak het in het zoekveld van WOZ-waardeloket.",
    );
    expect(kopieerMelding("ep", "1234AB 12", true)).toMatch(/zonder toevoeging/);
    expect(kopieerMelding("ep", "1234AB 12", false)).toBe("Typ in het zoekveld: 1234AB 12");
  });

  it("vergrendeld: alleen automatisch ingevuld én niet leeg", () => {
    const meta = { auto: { adres: true, plaats: false } };
    expect(isVergrendeld(meta, "adres", "Damrak")).toBe(true);
    expect(isVergrendeld(meta, "adres", "  ")).toBe(false);
    expect(isVergrendeld(meta, "plaats", "Amsterdam")).toBe(false);
    expect(isVergrendeld({}, "bouwjaar", "1975")).toBe(false);
  });
});
