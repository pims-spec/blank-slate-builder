import { describe, expect, it } from "vitest";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { maakVersie, nieuweTellingStaat, type TellingStaat } from "./doc";
import { nepDb, stap, type Aanroep, type Antwoord } from "./nepDb";
import { maakTellingStore } from "./store";
import type { Versie } from "./types";
import { bewaarUitgangssituatie, gelijkAanVersie, uitgangsVersieNaam } from "./uitgangssituatie";

const N = DEFAULT_NORMEN as unknown as Normen;
const NU = new Date("2026-10-15T10:00:00.000Z");

function staat(versieCount = 0): TellingStaat {
  const s = nieuweTellingStaat("Pim", NU);
  s.meta.naam = "Teststraat 1";
  s.meta.adres = "Teststraat";
  s.meta.huisnummer = "1";
  s.input.vertrekken.push({ type: "woonkamer", m2: 30, verwarmd: true });
  return { ...s, versieCount, aantalVersies: versieCount };
}

const versieVan = (s: TellingStaat, nr: number): Versie => ({
  ...maakVersie({ ...s, versieCount: nr - 1 }, N, "", NU),
  id: "v000" + nr,
});

const updateLukt = (a: Aanroep): Antwoord => (stap(a, "update") ? { data: [{ id: "t1" }] } : {});

describe("uitgangssituatie vóór toepassen", () => {
  it("versienaam met de soort advies en de datum", () => {
    expect(uitgangsVersieNaam("vrije sector", NU)).toBe("Vóór advies vrije sector – 15 okt 2026");
    expect(uitgangsVersieNaam("indeling", NU)).toBe("Vóór indelingsadvies – 15 okt 2026");
  });

  it("eerste keer: eerst de telling opslaan, dan de versie; de telling houdt haar naam", async () => {
    const { db, log } = nepDb();
    const r = await bewaarUitgangssituatie(maakTellingStore(db, N), {
      id: "t1",
      isNieuw: true,
      staat: staat(),
      normen: N,
      bewerker: null,
      soort: "vrije sector",
      versies: [],
      nu: NU,
    });
    expect(log.map((a) => [a.tabel, a.stappen[0]?.[0]])).toEqual([
      ["tellingen", "insert"],
      ["telling_versies", "insert"],
    ]);
    expect(r.nieuw).toBe(true);
    expect(r.versie.nr).toBe(1);
    expect(r.versie.notitie).toBe("Vóór advies vrije sector – 15 okt 2026");
    expect(r.staat.meta.naam).toBe("Teststraat 1");
  });

  it("ongewijzigd t.o.v. de laatste versie: geen dubbele versie, en die versie geldt", async () => {
    const s = staat(2);
    const v1 = versieVan(staat(), 1);
    const v2 = versieVan(s, 2);
    // volgorde van velden maakt niet uit
    const zelfde = { ...s, input: { ...s.input } };
    expect(gelijkAanVersie(zelfde, v2)).toBe(true);
    const { db, log } = nepDb();
    const r = await bewaarUitgangssituatie(maakTellingStore(db, N), {
      id: "t1",
      isNieuw: false,
      staat: zelfde,
      normen: N,
      bewerker: null,
      soort: "indeling",
      versies: [v2, v1],
    });
    expect(log).toEqual([]);
    expect(r).toMatchObject({ nieuw: false, versie: { nr: 2 } });
  });

  it("gewijzigd na de laatste versie: nieuwe versie", async () => {
    const s = staat(1);
    const v1 = versieVan(s, 1);
    s.input.vertrekken[0]!.m2 = 32;
    expect(gelijkAanVersie(s, v1)).toBe(false);
    const { db, log } = nepDb(updateLukt);
    const r = await bewaarUitgangssituatie(maakTellingStore(db, N), {
      id: "t1",
      isNieuw: false,
      staat: s,
      normen: N,
      bewerker: null,
      soort: "indeling",
      versies: [v1],
      nu: NU,
    });
    expect(log.map((a) => [a.tabel, a.stappen[0]?.[0]])).toEqual([
      ["tellingen", "update"],
      ["telling_versies", "insert"],
    ]);
    expect(r).toMatchObject({ nieuw: true, versie: { nr: 2 } });
  });

  it("opslaan mislukt: de fout gaat door (en er wordt geen versie gemaakt)", async () => {
    const { db, log } = nepDb(() => ({ error: { message: "geen verbinding" } }));
    await expect(
      bewaarUitgangssituatie(maakTellingStore(db, N), {
        id: "t1",
        isNieuw: true,
        staat: staat(),
        normen: N,
        bewerker: null,
        soort: "vrije sector",
        versies: [],
      }),
    ).rejects.toBeTruthy();
    expect(log.map((a) => a.tabel)).toEqual(["tellingen"]);
  });
});
