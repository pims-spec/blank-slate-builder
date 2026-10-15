import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { eur } from "./basis";
import { berekenHomeStats, dagdeelGroet, homeTegels } from "./home";

const require = createRequire(import.meta.url);
const BRON = require("../../../reference/wws-site-home.cjs") as {
  maakBerekenHomeStats: (
    profile: unknown,
    tellingen: unknown[],
    store: { alleVersies: () => Promise<unknown[]> },
  ) => () => Promise<unknown>;
};

/** Eenvoudige, herhaalbare toevalsgenerator */
function rnd(seed: number) {
  let x = seed * 9301 + 49297;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
}

function wereld(seed: number) {
  const r = rnd(seed);
  const eigenaars = ["u1", "u2", "u3"];
  const tellingen = Array.from({ length: Math.floor(r() * 12) }, (_, i) => ({
    id: "t" + i,
    ownerId: eigenaars[Math.floor(r() * 3)]!,
  }));
  const versies: { tellingId: string; nr: number; resultaat: unknown }[] = [];
  for (const t of [...tellingen, { id: "vreemd", ownerId: "u1" }]) {
    const n = Math.floor(r() * 5);
    for (let nr = n; nr >= 1; nr--)
      versies.push({
        tellingId: t.id,
        nr,
        resultaat:
          r() < 0.1
            ? null
            : {
                totaal: r() < 0.1 ? null : Math.round(80 + r() * 150),
                maxHuur: r() < 0.1 ? null : Math.round((500 + r() * 1200) * 100) / 100,
              },
      });
  }
  // "vreemd" staat niet in de tellingen: zijn versies tellen nooit mee
  return { tellingen, versies };
}

describe("startscherm-statistieken gelijk aan wws-site.html (berekenHomeStats)", () => {
  it("400 willekeurige portefeuilles, per gebruiker en zonder profiel", async () => {
    for (let seed = 1; seed <= 400; seed++) {
      const { tellingen, versies } = wereld(seed);
      for (const userId of ["u1", "u2", null]) {
        const bron = await BRON.maakBerekenHomeStats(userId ? { id: userId } : null, tellingen, {
          alleVersies: async () => versies,
        })();
        expect(berekenHomeStats(tellingen, versies as never, userId)).toEqual(bron);
      }
    }
  });

  it("tegels zoals renderHomeStats()", () => {
    expect(
      homeTegels({
        aantalTellingen: 3,
        aantalAdvies: 1,
        puntenTotaal: 15,
        puntenGem: 15,
        huurTotaal: 102.99,
        huurGem: 102.99,
      }).map(([n, l]) => n + " " + l),
    ).toEqual([
      "3 Gemaakte tellingen",
      "1 Gemaakte adviezen",
      "+15 Punten in totaal verhoogd",
      "+15 Gemiddeld verhoogd (punten)",
      "+" + eur(102.99) + " Totale toegevoegde huur",
      "+" + eur(102.99) + " Gemiddeld per advies",
    ]);
    expect(homeTegels(berekenHomeStats([], [], "u1")).map(([n]) => n)).toEqual([
      "0",
      "0",
      "–",
      "–",
      "–",
      "–",
    ]);
  });

  it("groet per dagdeel", () => {
    const op = (u: number) => dagdeelGroet(new Date(2026, 9, 15, u));
    expect([op(3), op(9), op(14), op(20)]).toEqual([
      "Goedenacht",
      "Goedemorgen",
      "Goedemiddag",
      "Goedenavond",
    ]);
  });
});
