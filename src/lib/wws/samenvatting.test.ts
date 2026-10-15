import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_NORMEN } from "./normen";
import { MINDER_DAN_40, exactTekst, huurLabel, opslagTekst, segmentSchaal } from "./samenvatting";

const bron = readFileSync("reference/wws-site.html", "utf8");

describe("samenvattingspaneel (renderSum)", () => {
  it("teksten letterlijk uit de bron", () => {
    for (const t of [huurLabel("hoog"), huurLabel("midden"), MINDER_DAN_40])
      expect(bron).toContain(t);
    expect(huurLabel("laag")).toBe(huurLabel("midden"));
    expect(bron).toContain("', afgerond op hele punten");
    expect(exactTekst(205.5)).toBe("Exact 205,5, afgerond op hele punten");
    expect(exactTekst(168)).toBe("Exact 168, afgerond op hele punten");
  });

  it("segmentbalk: schaal minstens 250, anders totaal + 20; markering begrensd", () => {
    const s = segmentSchaal(206, DEFAULT_NORMEN);
    expect(s.max).toBe(250);
    expect(s.laag).toBeCloseTo((143 / 250) * 100);
    expect(s.midden).toBeCloseTo(((186 - 143) / 250) * 100);
    expect(s.marker).toBeCloseTo((206 / 250) * 100);
    const groot = segmentSchaal(260, DEFAULT_NORMEN);
    expect(groot.max).toBe(280);
    expect(groot.marker).toBeCloseTo((260 / 280) * 100);
    expect(segmentSchaal(-5, DEFAULT_NORMEN).marker).toBe(0);
  });

  it("opslagen als één regel", () => {
    expect(
      opslagTekst([
        ["Nieuwbouw", 10],
        ["Rijksmonument", 5],
      ]),
    ).toBe("10% nieuwbouw + 5% rijksmonument");
  });
});
