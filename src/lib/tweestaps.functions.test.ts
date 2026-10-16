import { describe, expect, it, vi } from "vitest";
import { resetFactoren, type MfaAdmin } from "./tweestaps.functions";

const mfa = (factoren: string[], foutBij?: string): MfaAdmin & { verwijderd: string[] } => {
  const verwijderd: string[] = [];
  return {
    verwijderd,
    listFactors: async () => ({ data: { factors: factoren.map((id) => ({ id })) }, error: null }),
    deleteFactor: async ({ id }) => {
      if (id === foutBij) return { error: new Error("x") };
      verwijderd.push(id);
      return { error: null };
    },
  };
};

describe("tweestapsverificatie resetten (beheerder)", () => {
  it("verwijdert alle code-apps van het account; log zonder ids", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const m = mfa(["f1", "f2"]);
    expect(await resetFactoren(m, "admin", "u2")).toEqual({ ok: true, verwijderd: 2 });
    expect(m.verwijderd).toEqual(["f1", "f2"]);
    expect(log.mock.calls.flat().join(" ")).not.toMatch(/u2|f1|f2/);
  });

  it("nooit het eigen account", async () => {
    const m = mfa(["f1"]);
    expect(await resetFactoren(m, "admin", "admin")).toEqual({ ok: false, fout: "eigen_account" });
    expect(m.verwijderd).toEqual([]);
  });

  it("fout van de Auth-API: vaste code", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await resetFactoren(mfa(["f1", "f2"], "f2"), "admin", "u2")).toEqual({
      ok: false,
      fout: "mislukt",
    });
  });
});
