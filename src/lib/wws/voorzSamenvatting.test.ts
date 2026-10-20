import { describe, expect, it } from "vitest";
import type { Fac } from "./types";
import { samenvattingVoorz } from "./voorzSamenvatting";

describe("samenvattingVoorz", () => {
  it("keuken: aanrecht en aantal voorzieningen (een aantal telt mee)", () => {
    const fac: Fac = {
      kind: "keuken",
      keuken: {
        lengte: "1-2",
        voorz: { afzuig: true, koelkast: true, oven: true, kast: "2", magnetron: false },
      },
    };
    expect(samenvattingVoorz(fac)).toBe("Keuken: aanrecht 1–2 m, 5 voorzieningen");
  });

  it("keuken zonder voorzieningen", () => {
    expect(samenvattingVoorz({ kind: "keuken", keuken: { lengte: "<1", voorz: {} } })).toBe(
      "Keuken: aanrecht korter dan 1 m",
    );
  });

  it("badkamer: sanitair en extra's", () => {
    const fac: Fac = {
      kind: "badkamer",
      san: {
        toiletStaand: 0,
        toiletHang: 0,
        wastafel: 2,
        meerpers: 0,
        douche: 1,
        bad: 0,
        badDouche: 0,
        eisenOk: true,
        voorz: { kastje: 1, handdoekrad: true, kraan_een: "1" },
      },
    };
    expect(samenvattingVoorz(fac)).toBe("Badkamer: 2 wastafels, douche, 3 extra's");
  });

  it("badkamer zonder sanitair", () => {
    const fac: Fac = {
      kind: "badkamer",
      san: {
        toiletStaand: 0,
        toiletHang: 0,
        wastafel: 0,
        meerpers: 0,
        douche: 0,
        bad: 0,
        badDouche: 0,
        eisenOk: false,
        voorz: {},
      },
    };
    expect(samenvattingVoorz(fac)).toBe("Badkamer: geen sanitair");
  });

  it("toilet, slaapkamer met wastafel en wasruimte", () => {
    expect(
      samenvattingVoorz({ kind: "toilet", toilet: { toilet: "hangend", fontein: true } }),
    ).toBe("Toilet: hangend toilet, fontein");
    expect(
      samenvattingVoorz({
        kind: "slaap_san",
        san: { wastafel: 1, meerpers: 0, douche: 0, bad: 0, badDouche: 0 },
      }),
    ).toBe("Sanitair: wastafel");
    expect(samenvattingVoorz({ kind: "was", was: { wastafel: false } })).toBe(
      "Wasruimte: geen wastafel",
    );
  });
});
