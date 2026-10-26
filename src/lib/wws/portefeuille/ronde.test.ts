import { describe, expect, it, vi } from "vitest";
import type { AnalyseAdres, LabelResultaat } from "./analyse";
import {
  bundel,
  haalInPorties,
  langGeldig,
  opnieuwLijst,
  perPortefeuille,
  type OphaalAdres,
  type Vraag,
} from "./ronde";

const PEIL = "2026-10-26";

const res = (x: Partial<LabelResultaat> = {}): LabelResultaat => ({
  status: "gevonden",
  energieklasse: "C",
  registratiedatum: "2022-01-01",
  geldigTot: "2032-01-01",
  opgehaaldOp: "2026-10-20T10:00:00Z",
  ...x,
});

const a = (id: string, hn: number, resultaat: LabelResultaat | null): AnalyseAdres => ({
  id,
  postcode: "1053ZD",
  huisnummer: hn,
  huisletter: "",
  toevoeging: "",
  resultaat,
});

const d = (adres: AnalyseAdres, portefeuilleId = "p1"): OphaalAdres => ({ adres, portefeuilleId });

describe("langGeldig", () => {
  it("alleen een gevonden label dat ná peildatum + 1 jaar verloopt", () => {
    expect(langGeldig(res({ geldigTot: "2027-10-27" }), PEIL)).toBe(true);
    expect(langGeldig(res({ geldigTot: "2027-10-26" }), PEIL)).toBe(false);
    expect(langGeldig(res({ geldigTot: "2026-01-01" }), PEIL)).toBe(false);
    expect(langGeldig(res({ status: "niet_gevonden" }), PEIL)).toBe(false);
    expect(langGeldig(null, PEIL)).toBe(false);
  });

  it("zonder 'geldig tot': registratiedatum + 10 jaar; zonder datums: ophalen", () => {
    expect(langGeldig(res({ geldigTot: null, registratiedatum: "2020-01-01" }), PEIL)).toBe(true);
    expect(langGeldig(res({ geldigTot: null, registratiedatum: "2017-01-01" }), PEIL)).toBe(false);
    expect(langGeldig(res({ geldigTot: null, registratiedatum: null }), PEIL)).toBe(false);
  });

  it("zonder (bekende) klasse: ophalen", () => {
    expect(langGeldig(res({ energieklasse: null }), PEIL)).toBe(false);
  });
});

describe("opnieuwLijst", () => {
  const lijst = [
    d(a("lang", 1, res())),
    d(a("kort", 2, res({ geldigTot: "2027-03-01" }))),
    d(a("oud", 3, res({ geldigTot: "2027-03-01", opgehaaldOp: "2026-08-01T10:00:00Z" }))),
    d(a("nietgev", 4, res({ status: "niet_gevonden", energieklasse: null }))),
    d(a("nog-niet", 5, null)),
  ];
  const ids = (l: OphaalAdres[]) => l.map((x) => x.adres.id);

  it("alle: alles met een resultaat; met overslaan zonder de lang geldige", () => {
    expect(ids(opnieuwLijst(lijst, "alle", PEIL, false))).toEqual([
      "lang",
      "kort",
      "oud",
      "nietgev",
    ]);
    expect(ids(opnieuwLijst(lijst, "alle", PEIL, true))).toEqual(["kort", "oud", "nietgev"]);
  });

  it("probleem: alles wat niet gevonden is", () => {
    expect(ids(opnieuwLijst(lijst, "probleem", PEIL, true))).toEqual(["nietgev"]);
  });

  it("oud: opgehaald vóór een maand terug", () => {
    expect(ids(opnieuwLijst(lijst, "oud", PEIL, true))).toEqual(["oud"]);
    const lang = d(a("lang-oud", 6, res({ opgehaaldOp: "2026-01-01T10:00:00Z" })));
    expect(ids(opnieuwLijst([lang], "oud", PEIL, false))).toEqual(["lang-oud"]);
    expect(ids(opnieuwLijst([lang], "oud", PEIL, true))).toEqual([]);
  });
});

describe("bundel", () => {
  it("hetzelfde adres in twee portefeuilles: één vraag, twee doelen", () => {
    const b = bundel([d(a("p1-1", 1, null)), d(a("p1-2", 2, null)), d(a("p2-1", 1, null), "p2")]);
    expect(b.map((x) => x.vraag.id)).toEqual(["p1-1", "p1-2"]);
    expect(b[0]!.doelen.map((x) => x.portefeuilleId)).toEqual(["p1", "p2"]);
    expect(b[0]!.vraag).toEqual({
      id: "p1-1",
      postcode: "1053ZD",
      huisnummer: 1,
      huisletter: "",
      toevoeging: "",
    });
  });
});

describe("haalInPorties", () => {
  const bundels = bundel([
    d(a("a1", 1, null)),
    d(a("a2", 2, null)),
    d(a("a3", 3, null)),
    d(a("b1", 1, null), "p2"),
  ]);
  const antwoord = (v: Vraag[]) => ({
    resultaten: v.map((x) => ({ id: x.id, resultaat: "ok-" + x.id })),
  });

  it("porties, voortgang, en elk resultaat bij elke portefeuille opgeslagen", async () => {
    const haalOp = vi.fn(async (v: Vraag[]) => antwoord(v));
    const opgeslagen: string[] = [];
    const voortgang: string[] = [];
    const r = await haalInPorties(bundels, {
      portie: 2,
      haalOp,
      slaOp: async (rijen) => {
        opgeslagen.push(...rijen.map((x) => x.doel.adres.id + "=" + x.resultaat));
      },
      voortgang: (v) => voortgang.push(`${v.gedaan}/${v.tot}/${v.totaal}`),
    });
    expect(r).toEqual({ gedaan: 3, stop: null });
    expect(haalOp).toHaveBeenCalledTimes(2);
    expect(opgeslagen).toEqual(["a1=ok-a1", "b1=ok-a1", "a2=ok-a2", "a3=ok-a3"]);
    expect(voortgang).toEqual(["0/2/3", "2/2/3", "2/3/3", "3/3/3"]);
  });

  it("stopt bij een stopfout van de dienst, na het opslaan van wat er wel is", async () => {
    const slaOp = vi.fn(async () => {});
    const r = await haalInPorties(bundels, {
      portie: 2,
      haalOp: async (v) => ({ ...antwoord(v.slice(0, 1)), stop: "te_veel_verzoeken" as const }),
      slaOp,
    });
    expect(r).toEqual({ gedaan: 1, stop: "te_veel_verzoeken" });
    expect(slaOp).toHaveBeenCalledOnce();
  });

  it("server of opslaan faalt: geen_verbinding; stoppen: gestopt vóór de volgende portie", async () => {
    expect(
      await haalInPorties(bundels, {
        portie: 2,
        haalOp: async () => {
          throw new Error("geheime fout");
        },
        slaOp: async () => {},
      }),
    ).toEqual({ gedaan: 0, stop: "geen_verbinding" });
    let n = 0;
    expect(
      await haalInPorties(bundels, {
        portie: 2,
        haalOp: async (v) => antwoord(v),
        slaOp: async () => {},
        moetStoppen: () => n++ > 0,
      }),
    ).toEqual({ gedaan: 2, stop: "gestopt" });
  });

  it("onbekende id's in het antwoord worden genegeerd", async () => {
    const slaOp = vi.fn(async () => {});
    const r = await haalInPorties(bundels.slice(0, 1), {
      portie: 10,
      haalOp: async () => ({ resultaten: [{ id: "vreemd", resultaat: "x" }] }),
      slaOp,
    });
    expect(r.gedaan).toBe(0);
    expect(slaOp).toHaveBeenCalledWith([]);
  });
});

describe("perPortefeuille", () => {
  it("groepeert op portefeuille", () => {
    const rijen = [
      { doel: d(a("a", 1, null), "p1") },
      { doel: d(a("b", 1, null), "p2") },
      { doel: d(a("c", 2, null), "p1") },
    ];
    const per = perPortefeuille(rijen);
    expect([...per.keys()]).toEqual(["p1", "p2"]);
    expect(per.get("p1")!.map((x) => x.doel.adres.id)).toEqual(["a", "c"]);
  });
});
