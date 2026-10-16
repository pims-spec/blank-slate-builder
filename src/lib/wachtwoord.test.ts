import { describe, expect, it } from "vitest";
import { wachtwoordFout } from "./wachtwoord";

describe("wachtwoordFout", () => {
  it("geeft per foutcode een eigen Nederlandse tekst", () => {
    expect(wachtwoordFout({ code: "weak_password", reasons: ["pwned"] })).toMatch(/datalekken/);
    expect(wachtwoordFout({ code: "weak_password", reasons: ["length"] })).toMatch(/te kort/);
    expect(wachtwoordFout({ code: "weak_password", reasons: ["characters"] })).toMatch(
      /hoofdletters/,
    );
    expect(wachtwoordFout({ code: "weak_password" })).toMatch(/niet sterk genoeg/);
    expect(wachtwoordFout({ code: "same_password" })).toMatch(/ander wachtwoord/);
    expect(wachtwoordFout({ code: "insufficient_aal" })).toMatch(/code-app/);
    expect(wachtwoordFout({ code: "session_not_found" })).toMatch(/verlopen/);
    expect(wachtwoordFout({ code: "over_request_rate_limit" })).toMatch(/Te veel/);
  });

  it("onbekende fout: algemene tekst, nooit de ruwe melding", () => {
    const t = wachtwoordFout({ code: "iets_anders", status: 500 });
    expect(t).toBe("Het wachtwoord kon niet worden ingesteld. Probeer het opnieuw.");
    expect(wachtwoordFout(null)).toBe(t);
  });
});
