import { describe, expect, it, vi } from "vitest";
import type { AppRole } from "./rollen";
import {
  bezitTekst,
  controleerOverdracht,
  ontvangers,
  overdrachtZin,
  portefeuilleTekst,
  verwijderMetOverdracht,
  type OverdrachtDb,
} from "./gebruikerVerwijderen";

/** Nepdatabase: eigenaar per telling/huurindicatie, rollen, delingen en een stappenlog */
function nepDb(o: {
  rollen?: Record<string, AppRole[]>;
  tellingen?: Record<string, string>;
  huur?: Record<string, string>;
  portefeuilles?: Record<string, string>;
  gedeeld?: [string, string][];
  portefeuilleGedeeld?: [string, string][];
  faalt?: keyof OverdrachtDb;
  blijftHangen?: boolean;
}) {
  const rollen = { ...o.rollen };
  const tellingen = { ...o.tellingen };
  const huur = { ...o.huur };
  const gedeeld = [...(o.gedeeld ?? [])];
  const pfGedeeld = [...(o.portefeuilleGedeeld ?? [])];
  const stappen: string[] = [];
  const verwijderd: string[] = [];
  const van = (m: Record<string, string>, u: string) => Object.keys(m).filter((k) => m[k] === u);
  const db: OverdrachtDb = {
    rollenVan: async (u) => (o.faalt === "rollenVan" ? null : (rollen[u] ?? [])),
    telBezit: async (u) => {
      stappen.push("tel");
      if (o.faalt === "telBezit") return null;
      return {
        tellingen: van(tellingen, u).length,
        huurindicaties: van(huur, u).length,
        portefeuilles: van(o.portefeuilles ?? {}, u).length,
      };
    },
    trekRollenIn: async (u) => {
      stappen.push("rollen");
      if (o.faalt === "trekRollenIn") return false;
      rollen[u] = [];
      return true;
    },
    draagTellingenOver: async (a, b) => {
      stappen.push("tellingen");
      if (o.faalt === "draagTellingenOver") return null;
      const ids = van(tellingen, a);
      if (!o.blijftHangen) for (const id of ids) tellingen[id] = b;
      return ids;
    },
    draagHuurindicatiesOver: async (a, b) => {
      stappen.push("huur");
      if (o.faalt === "draagHuurindicatiesOver") return null;
      const ids = van(huur, a);
      for (const id of ids) huur[id] = b;
      return ids.length;
    },
    ruimDelingenOp: async (ids, b) => {
      stappen.push("delingen");
      if (o.faalt === "ruimDelingenOp") return false;
      const blijft = gedeeld.filter(([t, u]) => !(ids.includes(t) && u === b));
      gedeeld.splice(0, gedeeld.length, ...blijft);
      return true;
    },
    deelPortefeuilles: async (a, b) => {
      stappen.push("portefeuilles");
      if (o.faalt === "deelPortefeuilles") return null;
      const nieuw = van(o.portefeuilles ?? {}, a).filter(
        (p) => !pfGedeeld.some(([x, u]) => x === p && u === b),
      );
      for (const p of nieuw) pfGedeeld.push([p, b]);
      return nieuw.length;
    },
    verwijderAccount: async (u) => {
      stappen.push("account");
      if (o.faalt === "verwijderAccount") return false;
      verwijderd.push(u);
      return true;
    },
  };
  return { db, stappen, verwijderd, tellingen, huur, gedeeld, pfGedeeld, rollen };
}

const stil = () => vi.spyOn(console, "info").mockImplementation(() => {});

describe("controleerOverdracht", () => {
  const basis = {
    beheerder: "pim",
    gebruiker: "jan",
    ontvanger: "els",
    rollenOntvanger: ["member"] as AppRole[],
  };
  it("goed: collega of beheerder als ontvanger", () => {
    expect(controleerOverdracht(basis)).toBeNull();
    expect(controleerOverdracht({ ...basis, rollenOntvanger: ["admin", "member"] })).toBeNull();
    expect(
      controleerOverdracht({ ...basis, ontvanger: "pim", rollenOntvanger: ["admin"] }),
    ).toBeNull();
  });
  it("nooit het eigen account", () => {
    expect(controleerOverdracht({ ...basis, gebruiker: "pim" })).toBe("eigen_account");
  });
  it("ontvanger is niet wie verwijderd wordt", () => {
    expect(controleerOverdracht({ ...basis, ontvanger: "jan" })).toBe("zelfde_ontvanger");
  });
  it("lezer of iemand zonder rol kan niets ontvangen", () => {
    expect(controleerOverdracht({ ...basis, rollenOntvanger: ["viewer"] })).toBe(
      "ontvanger_geen_schrijfrol",
    );
    expect(controleerOverdracht({ ...basis, rollenOntvanger: [] })).toBe(
      "ontvanger_geen_schrijfrol",
    );
  });
});

describe("ontvangers", () => {
  it("alleen schrijfrollen, zonder wie verwijderd wordt", () => {
    const g = [
      { id: "pim", magSchrijven: true },
      { id: "jan", magSchrijven: true },
      { id: "lees", magSchrijven: false },
      { id: "els", magSchrijven: true },
    ];
    expect(ontvangers(g, "jan").map((x) => x.id)).toEqual(["pim", "els"]);
  });
});

describe("verwijderMetOverdracht", () => {
  const basis = () => ({
    rollen: { pim: ["admin", "member"], jan: ["member"], els: ["member"] } as Record<
      string,
      AppRole[]
    >,
    tellingen: { t1: "jan", t2: "jan", t3: "els" },
    huur: { h1: "jan", h2: "pim" },
    portefeuilles: { p1: "jan", p2: "jan", p3: "pim" },
    gedeeld: [
      ["t1", "els"],
      ["t1", "pim"],
      ["t3", "jan"],
    ] as [string, string][],
    portefeuilleGedeeld: [["p1", "els"]] as [string, string][],
  });

  it("draagt alles over en verwijdert daarna pas het account", async () => {
    const log = stil();
    const n = nepDb(basis());
    expect(await verwijderMetOverdracht(n.db, "pim", "jan", "els")).toEqual({
      ok: true,
      tellingen: 2,
      huurindicaties: 1,
      portefeuilles: 1,
    });
    expect(n.stappen).toEqual([
      "rollen",
      "tellingen",
      "huur",
      "delingen",
      "portefeuilles",
      "tel",
      "account",
    ]);
    expect(n.tellingen).toEqual({ t1: "els", t2: "els", t3: "els" });
    expect(n.huur).toEqual({ h1: "els", h2: "pim" });
    expect(n.rollen["jan"]).toEqual([]);
    expect(n.verwijderd).toEqual(["jan"]);
    // deling t1 → els is overbodig; t1 → pim blijft
    expect(n.gedeeld).toEqual([
      ["t1", "pim"],
      ["t3", "jan"],
    ]);
    expect(n.pfGedeeld).toEqual([
      ["p1", "els"],
      ["p2", "els"],
    ]);
    expect(log.mock.calls.flat().join(" ")).not.toMatch(/jan|els|pim|t1/);
  });

  it("de beheerder zelf als ontvanger: portefeuilles niet delen (ziet ze al)", async () => {
    stil();
    const n = nepDb(basis());
    const r = await verwijderMetOverdracht(n.db, "pim", "jan", "pim");
    expect(r).toEqual({ ok: true, tellingen: 2, huurindicaties: 1, portefeuilles: 0 });
    expect(n.stappen).not.toContain("portefeuilles");
  });

  it("zonder tellingen: geen delingen opruimen, wel verwijderen", async () => {
    stil();
    const n = nepDb({ ...basis(), tellingen: {} });
    expect(await verwijderMetOverdracht(n.db, "pim", "jan", "els")).toMatchObject({
      ok: true,
      tellingen: 0,
    });
    expect(n.stappen).not.toContain("delingen");
    expect(n.verwijderd).toEqual(["jan"]);
  });

  it("weigert vooraf zonder iets te wijzigen", async () => {
    const n = nepDb({ ...basis(), rollen: { ...basis().rollen, els: ["viewer"] } });
    expect(await verwijderMetOverdracht(n.db, "pim", "jan", "els")).toEqual({
      ok: false,
      fout: "ontvanger_geen_schrijfrol",
    });
    expect(n.stappen).toEqual([]);
    expect(await verwijderMetOverdracht(n.db, "pim", "pim", "els")).toEqual({
      ok: false,
      fout: "eigen_account",
    });
    expect(n.stappen).toEqual([]);
  });

  it("staat er na de overdracht nog iets op naam: account blijft", async () => {
    const n = nepDb({ ...basis(), blijftHangen: true });
    expect(await verwijderMetOverdracht(n.db, "pim", "jan", "els")).toEqual({
      ok: false,
      fout: "niet_alles_overgedragen",
    });
    expect(n.verwijderd).toEqual([]);
  });

  it.each([
    "rollenVan",
    "trekRollenIn",
    "draagTellingenOver",
    "draagHuurindicatiesOver",
    "ruimDelingenOp",
    "deelPortefeuilles",
    "telBezit",
    "verwijderAccount",
  ] as const)("fout bij %s: vaste code en geen account verwijderd", async (faalt) => {
    const n = nepDb({ ...basis(), faalt });
    expect(await verwijderMetOverdracht(n.db, "pim", "jan", "els")).toEqual({
      ok: false,
      fout: "mislukt",
    });
    expect(n.verwijderd).toEqual([]);
  });

  it("opnieuw uitvoeren na een halve poging maakt het af", async () => {
    stil();
    const n = nepDb({ ...basis(), faalt: "deelPortefeuilles" });
    await verwijderMetOverdracht(n.db, "pim", "jan", "els");
    const tweede = nepDb({ ...basis(), tellingen: n.tellingen, huur: n.huur, rollen: n.rollen });
    expect(await verwijderMetOverdracht(tweede.db, "pim", "jan", "els")).toMatchObject({
      ok: true,
      tellingen: 0,
    });
    expect(tweede.verwijderd).toEqual(["jan"]);
  });
});

describe("teksten", () => {
  it("enkelvoud, meervoud en geen huurindicaties", () => {
    expect(bezitTekst({ tellingen: 12, huurindicaties: 3 })).toBe(
      "12 tellingen (met versies) en 3 huurindicaties",
    );
    expect(bezitTekst({ tellingen: 1, huurindicaties: 1 })).toBe(
      "1 telling (met versies) en 1 huurindicatie",
    );
    expect(bezitTekst({ tellingen: 0, huurindicaties: 0 })).toBe("0 tellingen (met versies)");
    expect(overdrachtZin({ tellingen: 1, huurindicaties: 0 }, "Els")).toBe(
      "1 telling (met versies) gaat naar Els.",
    );
    expect(overdrachtZin({ tellingen: 2, huurindicaties: 1 }, null)).toBe(
      "2 tellingen (met versies) en 1 huurindicatie gaan naar de gekozen collega.",
    );
    expect(portefeuilleTekst(1)).toBe("1 portefeuille wordt gedeeld met de ontvanger.");
    expect(portefeuilleTekst(2)).toBe("2 portefeuilles worden gedeeld met de ontvanger.");
  });
});
