import { describe, expect, it } from "vitest";
import { resultaatUitEp, wachtMs } from "./ophalen";

const NU = "2026-10-16T10:00:00.000Z";
const lab = (k: string, reg: string, extra = {}) => ({
  Energieklasse: k,
  Registratiedatum: reg,
  ...extra,
});

describe("EP-Online-antwoord naar resultaat", () => {
  it("één label: gevonden, met datums als ISO en getallen gecontroleerd", () => {
    expect(
      resultaatUitEp(
        {
          ok: true,
          data: [
            lab("a ", "2019-04-25T00:00:00", {
              Geldig_tot: "20290425",
              EnergieIndex: "1,23",
              Gebouwtype: "Rijwoning",
            }),
          ],
        },
        NU,
      ),
    ).toEqual({
      resultaat: {
        status: "gevonden",
        energieklasse: "A",
        registratiedatum: "2019-04-25",
        geldigTot: "2029-04-25",
        opgehaaldOp: NU,
        opnamedatum: null,
        energieIndex: 1.23,
        gebouwtype: "Rijwoning",
      },
    });
  });
  it("hetzelfde label twee keer telt als één; verschillende labels = niet eenduidig", () => {
    const zelfde = resultaatUitEp(
      { ok: true, data: [lab("B", "2022-01-01"), lab("B", "2022-01-01")] },
      NU,
    );
    expect("resultaat" in zelfde && zelfde.resultaat.status).toBe("gevonden");
    const twee = resultaatUitEp(
      { ok: true, data: [lab("B", "2022-01-01"), lab("D", "2018-01-01")] },
      NU,
    );
    expect("resultaat" in twee && twee.resultaat).toMatchObject({
      status: "meerdere",
      energieklasse: null,
    });
  });
  it("niet gevonden en ongeldige invoer worden opgeslagen; andere fouten stoppen", () => {
    expect(resultaatUitEp({ ok: false, fout: "niet_gevonden" }, NU)).toMatchObject({
      resultaat: { status: "niet_gevonden" },
    });
    expect(resultaatUitEp({ ok: false, fout: "ongeldige_invoer" }, NU)).toMatchObject({
      resultaat: { status: "fout" },
    });
    for (const f of [
      "te_veel_verzoeken",
      "sleutel_ontbreekt",
      "sleutel_ongeldig",
      "dienst_onbereikbaar",
    ] as const)
      expect(resultaatUitEp({ ok: false, fout: f }, NU)).toEqual({ stop: f });
  });
  it("wachttijd bij de limiet per seconde, met grenzen", () => {
    expect(wachtMs(2)).toBe(500);
    expect(wachtMs(50)).toBe(100);
    expect(wachtMs(0)).toBe(10000);
  });
});
