import { describe, expect, it } from "vitest";
import { aantal, bandbreedte, euro, periode } from "./tekst";

describe("aantal", () => {
  it("enkelvoud alleen bij 1", () => {
    expect(aantal(0, "woning", "woningen")).toBe("0 woningen");
    expect(aantal(1, "woning", "woningen")).toBe("1 woning");
    expect(aantal(2, "rij", "rijen")).toBe("2 rijen");
  });
});

describe("periode", () => {
  const minuut = (iso: string) => iso.slice(0, 16);
  it("één waarde als beide er hetzelfde uitzien", () => {
    expect(periode("2026-10-16T09:20:01Z", "2026-10-16T09:20:59Z", minuut)).toBe(
      "2026-10-16T09:20",
    );
    expect(periode("2026-10-16T09:20:01Z", null, minuut)).toBe("2026-10-16T09:20");
  });
  it("anders van t/m tot", () => {
    expect(periode("2026-10-16T09:20:01Z", "2026-10-16T09:21:00Z", minuut)).toBe(
      "2026-10-16T09:20 t/m 2026-10-16T09:21",
    );
  });

  it("bedragen en bandbreedte", () => {
    expect(euro(18000)).toBe("€ 18.000");
    expect(bandbreedte({ laag: 18000, hoog: 27000 })).toBe("€ 18.000 – € 27.000");
    expect(bandbreedte({ laag: 0, hoog: 0 })).toBe("€ 0");
  });
});
