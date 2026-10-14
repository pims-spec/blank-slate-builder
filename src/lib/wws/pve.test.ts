import { describe, expect, it } from "vitest";
import { facDefault } from "./basis";
import { legeInput } from "./legeInput";
import {
  leegPve,
  pasPveToe,
  pveNaamBestaat,
  pveUitFormulier,
  pveVoorFormulier,
  pveVoorTelling,
  type Pve,
} from "./pve";

const uid = () => "nieuw-id";

const opgeslagen: Pve = {
  id: "p1",
  naam: "Standaard",
  keuken: { actief: true, keuken: { lengte: ">=2", voorz: { afzuig: true } } },
  indeling: {
    apartToilet: "nee",
    wasruimte: "ja",
    slaapkamers: "3",
    verwarmd: { "overig:toilet": true },
  },
  // een veld dat deze app (nog) niet kent, bv. van een nieuwere versie
  extraVanNieuwereVersie: { x: 1 },
};

describe("PvE-formulier", () => {
  it("vult ontbrekende onderdelen aan met de standaard, en bewaart de rest", () => {
    const w = pveVoorFormulier(opgeslagen);
    expect(w.keuken).toEqual({ actief: true, keuken: { lengte: ">=2", voorz: { afzuig: true } } });
    expect(w.badkamer).toEqual(leegPve().badkamer);
    expect(w.toilet).toEqual(leegPve().toilet);
    expect(w["indeling"]).toEqual(opgeslagen.indeling);
    expect(w["extraVanNieuwereVersie"]).toEqual({ x: 1 });
  });

  it("opslaan gooit velden die het formulier niet kent nooit weg (indeling, nieuwere velden)", () => {
    const w = pveVoorFormulier(opgeslagen);
    // het formulier wijzigt alleen keuken en toilet
    w.keuken = { actief: false, keuken: { lengte: "1-2", voorz: {} } };
    w.toilet = { actief: true, toilet: { toilet: "hangend", fontein: true } };
    const p = pveUitFormulier(w, opgeslagen, "  Renovatie ", uid);
    expect(p.id).toBe("p1");
    expect(p.naam).toBe("Renovatie");
    expect(p.indeling).toEqual(opgeslagen.indeling);
    expect(p["extraVanNieuwereVersie"]).toEqual({ x: 1 });
    expect(p.toilet).toEqual({ actief: true, toilet: { toilet: "hangend", fontein: true } });
    // ook als het werkexemplaar een veld mist dat in het opgeslagen PvE wel stond
    const zonder = { ...w };
    delete zonder["indeling"];
    delete zonder["extraVanNieuwereVersie"];
    const p2 = pveUitFormulier(zonder, opgeslagen, "R", uid);
    expect(p2.indeling).toEqual(opgeslagen.indeling);
    expect(p2["extraVanNieuwereVersie"]).toEqual({ x: 1 });
    // het opgeslagen PvE zelf is niet gewijzigd
    expect(opgeslagen.keuken?.actief).toBe(true);
  });

  it("nieuw PvE krijgt een id en de standaard-indelingswensen", () => {
    const p = pveUitFormulier(pveVoorFormulier(null), null, "Nieuw", uid);
    expect(p.id).toBe("nieuw-id");
    expect(p.indeling).toEqual(leegPve().indeling);
  });

  it("naam uniek per eigenaar (hoofdletterongevoelig), behalve het PvE zelf", () => {
    expect(pveNaamBestaat([opgeslagen], "standaard")).toBe(true);
    expect(pveNaamBestaat([opgeslagen], "standaard", "p1")).toBe(false);
    expect(pveNaamBestaat([opgeslagen], "Anders")).toBe(false);
  });
});

describe("PvE toepassen", () => {
  it("alleen onbewerkte ruimten; markering uitPve; invoer ongewijzigd", () => {
    const x = legeInput();
    x.vertrekken.push(
      { type: "keuken", m2: 8, verwarmd: true, fac: facDefault("keuken", false) },
      {
        type: "keuken",
        m2: 8,
        verwarmd: true,
        fac: { kind: "keuken", keuken: { lengte: "<1", voorz: {} } },
      },
    );
    const r = pasPveToe(x, opgeslagen);
    expect([r.aangepast, r.overgeslagen]).toEqual([1, 1]);
    expect(r.input.vertrekken[0]!.fac).toEqual({
      kind: "keuken",
      keuken: { lengte: ">=2", voorz: { afzuig: true } },
      uitPve: true,
    });
    expect(r.input.vertrekken[1]!.fac).toEqual(x.vertrekken[1]!.fac);
    expect(x.vertrekken[0]!.fac).toEqual(facDefault("keuken", false));
  });

  it("welk PvE voor stil aanvullen: gekozen PvE, anders het enige actieve", () => {
    const b: Pve = { id: "p2", naam: "Leeg" };
    expect(pveVoorTelling([opgeslagen, b], "p2")?.id).toBe("p2");
    expect(pveVoorTelling([opgeslagen, b], "")?.id).toBe("p1");
    expect(pveVoorTelling([opgeslagen, { ...opgeslagen, id: "p3" }], "")).toBeNull();
  });
});
