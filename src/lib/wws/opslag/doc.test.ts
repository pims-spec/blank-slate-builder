import { describe, expect, it } from "vitest";
import { calc } from "../calc";
import { legeInput } from "../legeInput";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import {
  leesInput,
  leesTellingDoc,
  leesVersieDoc,
  maakTellingDoc,
  maakVersie,
  nieuweTellingStaat,
  openVersieInStaat,
  standaardVersieNaam,
  tellingTitel,
  versieId,
  weergaveAdres,
  type TellingStaat,
} from "./doc";

const N = DEFAULT_NORMEN as unknown as Normen;
const NU = new Date("2026-10-14T10:00:00.000Z");

function staatMetWoning(): TellingStaat {
  const s = nieuweTellingStaat("Pim", NU);
  s.meta = { ...s.meta, adres: "Da Costastraat", huisnummer: "49-2", plaats: "Amsterdam" };
  s.input.vertrekken.push({ type: "woonkamer", m2: 30, verwarmd: true });
  s.input.vertrekken.push({ type: "slaapkamer", m2: 12, verwarmd: true });
  return s;
}

describe("namen en sleutels", () => {
  it("weergaveAdres zoals in wws-site.html", () => {
    expect(
      weergaveAdres({ adres: "Da Costastraat", huisnummer: "49-2", plaats: "Amsterdam" }),
    ).toBe("Da Costastraat 49-2, Amsterdam");
    expect(weergaveAdres({ plaats: "Amsterdam" })).toBe("Amsterdam");
    expect(weergaveAdres(null)).toBe("");
  });

  it("tellingTitel: naam, anders adres, anders 'Naamloze telling'", () => {
    expect(tellingTitel({ naam: "Sibeliuspark", adres: "X" })).toBe("Sibeliuspark");
    expect(tellingTitel({ adres: "Straat", huisnummer: "1" })).toBe("Straat 1");
    expect(tellingTitel({})).toBe("Naamloze telling");
  });

  it("standaardVersieNaam en versieId", () => {
    expect(standaardVersieNaam({ adres: "Straat", huisnummer: "1" }, 3)).toBe(
      "Straat 1 - versie 3",
    );
    expect(standaardVersieNaam({}, 1)).toBe("Puntentelling - versie 1");
    expect(versieId(1)).toBe("v0001");
    expect(versieId(42)).toBe("v0042");
  });
});

describe("leesInput", () => {
  it("geeft een lege telling bij ontbrekende of ongeldige invoer", () => {
    expect(leesInput(null)).toEqual(legeInput());
    expect(leesInput("onzin")).toEqual(legeInput());
  });

  it("vult ontbrekende rubrieken en velden aan en laat ingevulde waarden staan", () => {
    const uit = leesInput({
      woningtype: "eengezins",
      vertrekken: [{ type: "woonkamer", m2: 25, verwarmd: true }],
      woz: { waarde: 300000 },
      buiten: { gemAdressen: 4 },
      gem: "kapot",
    });
    expect(uit.woningtype).toBe("eengezins");
    expect(uit.vertrekken).toHaveLength(1);
    expect(uit.woz).toEqual({ ...legeInput().woz, waarde: 300000 });
    expect(uit.buiten).toEqual({ gemAdressen: 4, ruimten: [] });
    expect(uit.gem).toEqual(legeInput().gem);
    expect(uit.overig).toEqual([]);
    // en de berekening werkt erop
    expect(() => calc(uit, N)).not.toThrow();
  });
});

describe("tellingdocument", () => {
  it("maakTellingDoc legt meta, invoer en de laatste punten vast", () => {
    const s = staatMetWoning();
    const doc = maakTellingDoc(s, N, { id: "u1", naam: "Pim", email: "p@x.nl" }, NU);
    expect(doc.laatstePunten).toBe(calc(s.input, N).totaal);
    expect(doc.updatedAt).toBe(NU.toISOString());
    expect(doc.lastEditedBy?.id).toBe("u1");
    // kopie, geen verwijzing naar de editorstaat
    s.input.vertrekken.pop();
    expect(doc.input.vertrekken).toHaveLength(2);
  });

  it("overleeft een rondje door de database (JSON) ongewijzigd", () => {
    const s = staatMetWoning();
    const doc = maakTellingDoc(s, N, null, NU);
    const terug = leesTellingDoc(JSON.parse(JSON.stringify(doc)));
    expect(terug).toEqual(doc);
  });

  it("leest een document uit de oude tool, inclusief onbekende meta-velden", () => {
    const oud = {
      meta: { naam: "Test", postcode: "1051 AB", huisnummer: 12, klantId: "k1", favoriet: true },
      input: { vertrekken: [] },
      versieCount: 3,
      basedOn: 2,
      laatstePunten: 143,
    };
    const doc = leesTellingDoc(oud);
    expect(doc.meta.naam).toBe("Test");
    expect(doc.meta.huisnummer).toBe("12");
    expect(doc.meta["klantId"]).toBe("k1");
    expect(doc.meta["favoriet"]).toBe(true);
    expect(doc.versieCount).toBe(3);
    expect(doc.aantalVersies).toBe(3);
    expect(doc.basedOn).toBe(2);
    expect(doc.lastEditedBy).toBeNull();
    expect(doc.input).toEqual(legeInput());
  });
});

describe("versies", () => {
  it("maakVersie: volgend nummer, standaardnaam, normen en resultaat erbij", () => {
    const s = { ...staatMetWoning(), versieCount: 4 };
    const v = maakVersie(s, N, "  ", NU);
    const R = calc(s.input, N);
    expect(v.nr).toBe(5);
    expect(v.notitie).toBe("Da Costastraat 49-2, Amsterdam - versie 5");
    expect(v.normen).toEqual(N);
    expect(v.normen).not.toBe(N);
    expect(v.resultaat).toEqual({
      totaal: R.totaal,
      exact: R.exact,
      seg: R.seg,
      maxHuur: R.maxHuur,
      rows: R.rows,
    });
  });

  it("een ingevulde naam wordt de versienaam", () => {
    expect(maakVersie(staatMetWoning(), N, "Na renovatie", NU).notitie).toBe("Na renovatie");
  });

  it("leesVersieDoc valt terug op de standaardnormen als die ontbreken", () => {
    const v = leesVersieDoc({ nr: 2, resultaat: { totaal: 150, seg: "midden" } }, N);
    expect(v.nr).toBe(2);
    expect(v.normen).toBe(N);
    expect(v.resultaat.seg).toBe("midden");
    expect(v.resultaat.maxHuur).toBeNull();
  });

  it("openVersieInStaat neemt meta en invoer over en onthoudt het versienummer", () => {
    const s = staatMetWoning();
    const v = maakVersie(s, N, "", NU);
    const ander = { ...nieuweTellingStaat("", NU), versieCount: 1 };
    const geopend = openVersieInStaat(ander, v);
    expect(geopend.basedOn).toBe(1);
    expect(geopend.input).toEqual(s.input);
    expect(geopend.meta.adres).toBe("Da Costastraat");
    expect(geopend.versieCount).toBe(1);
    geopend.input.vertrekken.pop();
    expect(v.input.vertrekken).toHaveLength(2);
  });
});
