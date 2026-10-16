import { describe, expect, it } from "vitest";
import { heeftTweestaps, schoneCode, tweestapsStap, veiligPad } from "./tweestaps";

describe("tweestapsverificatie", () => {
  it("stap uit het sessieniveau", () => {
    expect(tweestapsStap({ currentLevel: "aal2", nextLevel: "aal2" })).toBe("ok");
    expect(tweestapsStap({ currentLevel: "aal1", nextLevel: "aal2" })).toBe("code");
    expect(tweestapsStap({ currentLevel: "aal1", nextLevel: "aal1" })).toBe("instellen");
    expect(tweestapsStap({ currentLevel: null, nextLevel: null })).toBe("instellen");
    // de server weet van een elders gekoppelde code-app; de oude sessie nog niet
    expect(tweestapsStap({ currentLevel: "aal1", nextLevel: "aal1" }, 1)).toBe("code");
    expect(tweestapsStap({ currentLevel: "aal1", nextLevel: "aal2" }, 0)).toBe("instellen");
  });

  it("terugkeeradres alleen binnen de app", () => {
    expect(veiligPad("/archief?tab=analyses")).toBe("/archief?tab=analyses");
    expect(veiligPad(undefined)).toBe("/dashboard");
    expect(veiligPad("https://evil.example/x")).toBe("/dashboard");
    expect(veiligPad("//evil.example/x")).toBe("/dashboard");
    expect(veiligPad("/tweestaps")).toBe("/dashboard");
    expect(veiligPad("javascript:alert(1)")).toBe("/dashboard");
  });

  it("code: 6 cijfers, spaties toegestaan", () => {
    expect(schoneCode("123 456")).toBe("123456");
    expect(schoneCode("12345")).toBeNull();
    expect(schoneCode("12345a")).toBeNull();
  });

  it("server functions: alleen een token met aal2", () => {
    expect(heeftTweestaps({ aal: "aal2" })).toBe(true);
    expect(heeftTweestaps({ aal: "aal1" })).toBe(false);
    expect(heeftTweestaps({})).toBe(false);
    expect(heeftTweestaps(null)).toBe(false);
  });
});
