import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { describe, expect, it } from "vitest";
import { standaardInstellingen } from "../advies";
import { normaliseer } from "../calc";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { genereer } from "../testdata";
import type { WwsInput } from "../types";
import { labelMarkering, labelMarkeringTekst } from "./labelMarkering";
import { maakAdviesPdf } from "./rapporten";
import { pdfTekst, willekeurigeMeta } from "./testhulp";

const LIB = { jsPDF, autoTable };
const N = DEFAULT_NORMEN as unknown as Normen;

const energie = (label: string, soort: WwsInput["energie"]["soort"] = "label") => ({
  soort,
  label: label as WwsInput["energie"]["label"],
  indexKlasse: "",
  datum: "2022-01-01",
  bouwjaar: "",
});
const route = (naar?: string) => ({
  input: naar ? { energie: energie(naar) } : undefined,
  stappen: naar ? [{ key: "label", naarLabel: naar }] : [{ key: "keuken" }],
});

describe("labelMarkering: rood het huidige label, groen het label na het advies", () => {
  it("oud en nieuw verschillen", () => {
    const m = labelMarkering({ energie: energie("E") }, [route("B")]);
    expect(m).toEqual({ oud: "E", nieuw: [{ label: "B", opties: [1] }] });
    expect(labelMarkeringTekst(m)).toBe("Rood: het huidige label E. Groen: label B na optie 1.");
  });

  it("twee opties: elk eindlabel groen, gelijke eindlabels samengevoegd", () => {
    expect(labelMarkering({ energie: energie("F") }, [route("C"), route("A")]).nieuw).toEqual([
      { label: "C", opties: [1] },
      { label: "A", opties: [2] },
    ]);
    const m = labelMarkering({ energie: energie("F") }, [route("C"), route("C")]);
    expect(m.nieuw).toEqual([{ label: "C", opties: [1, 2] }]);
    expect(labelMarkeringTekst(m)).toBe(
      "Rood: het huidige label F. Groen: label C na opties 1 en 2.",
    );
    expect(
      labelMarkeringTekst(
        labelMarkering({ energie: energie("F") }, [route("C"), route("A"), route("A")]),
      ),
    ).toBe("Rood: het huidige label F. Groen: label C na optie 1, A na opties 2 en 3.");
  });

  it("zonder labelstap blijft het label gelijk: rood én groen om hetzelfde label", () => {
    const m = labelMarkering({ energie: energie("C") }, [route()]);
    expect(m).toEqual({ oud: "C", nieuw: [{ label: "C", opties: [1] }] });
    expect(labelMarkeringTekst(m)).toBe(
      "Rood: het huidige label C. Groen: label C na optie 1 (ongewijzigd).",
    );
  });

  it("labelstap zonder eindinput: het naarLabel van de stap", () => {
    const m = labelMarkering({ energie: energie("D") }, [
      { stappen: [{ key: "label", naarLabel: "A" }] },
    ]);
    expect(m.nieuw).toEqual([{ label: "A", opties: [1] }]);
  });

  it("energie-index of bouwjaar: geen rood, wel groen voor het nieuwe label", () => {
    const m = labelMarkering({ energie: energie("", "index") }, [route("B"), route()]);
    expect(m).toEqual({ oud: null, nieuw: [{ label: "B", opties: [1] }] });
    expect(labelMarkeringTekst(m)).toBe("Groen: label B na optie 1.");
  });

  it("geen opties: alleen rood", () => {
    expect(labelMarkering({ energie: energie("A") }, [])).toEqual({ oud: "A", nieuw: [] });
  });

  it("de uitleg staat in het adviesrapport, niet in de brongetrouwe versie", async () => {
    const input = normaliseer(genereer(3));
    input.energie = energie("F");
    const x = { meta: willekeurigeMeta(3), input, normen: N, inst: standaardInstellingen(N) };
    const tekst = (await pdfTekst(maakAdviesPdf(LIB, x).blob)).flat().join(" ");
    expect(tekst).toContain("Rood: het huidige label F.");
    const bron = (await pdfTekst(maakAdviesPdf(LIB, { ...x, bronGetrouw: true }).blob))
      .flat()
      .join(" ");
    expect(bron).not.toContain("Rood: het huidige label");
  });
});
