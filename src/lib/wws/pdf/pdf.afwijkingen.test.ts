// De bewuste afwijkingen van wws-site.html in de PDF's (zie de README). De vergelijkingstest
// (pdf.vergelijk.test.ts) draait met bronGetrouw: true; hier staan de afwijkingen aan.
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { describe, expect, it } from "vitest";
import { berekenAdvies, selectieResultaat, standaardInstellingen } from "../advies";
import { normaliseer } from "../calc";
import { DEFAULT_NORMEN, type Normen } from "../normen";
import { genereer } from "../testdata";
import { maakRoutePdf, maakTellingPdf } from "./rapporten";
import { pdfTekst, willekeurigeMeta } from "./testhulp";

const LIB = { jsPDF, autoTable };
const N = DEFAULT_NORMEN as unknown as Normen;

/** Losse, gespatieerde letters: zo tekent jsPDF een tekst met een teken buiten zijn lettertype */
const gespatieerd = (t: string) => /^(\S ){2,}\S$/.test(t);

describe("bewuste afwijkingen in de PDF's", () => {
  it('"≤" wordt "<=" in plaats van losse letters', async () => {
    const input = normaliseer(genereer(1));
    input.energie = {
      soort: "index",
      label: "",
      indexKlasse: "4",
      datum: "2018-05-01",
      bouwjaar: "",
    };
    const meta = willekeurigeMeta(1);

    const bron = (
      await pdfTekst(maakTellingPdf(LIB, { meta, input, normen: N, bronGetrouw: true }).blob)
    ).flat();
    expect(bron.some(gespatieerd), "de bron tekent losse letters").toBe(true);

    const nu = (await pdfTekst(maakTellingPdf(LIB, { meta, input, normen: N }).blob)).flat();
    expect(nu.some(gespatieerd)).toBe(false);
    expect(nu.some((t) => t.includes("1,4 < EI <= 1,8"))).toBe(true);
    expect(nu.join(" ")).not.toContain("≤");
  });

  it("route-PDF: beginsituatie en eindlabel ingevuld (geen undefined en ?)", async () => {
    let vanLabel = 0,
      vanAnders = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const input = normaliseer(genereer(seed));
      const inst = { ...standaardInstellingen(N), labelsprong: true };
      const A = berekenAdvies(input, N, inst);
      const k = A.stappen.findIndex((s) => s.key === "label");
      if (k < 0) continue;
      const meta = willekeurigeMeta(seed);
      const bron = (
        await pdfTekst(
          maakRoutePdf(LIB, { meta, input, normen: N, advies: A, overslaan: {}, bronGetrouw: true })
            .blob,
        )
      ).flat();
      expect(bron.some((t) => t.startsWith("Van undefined naar nieuw energielabel ?"))).toBe(true);

      const tekst = (
        await pdfTekst(maakRoutePdf(LIB, { meta, input, normen: N, advies: A, overslaan: {} }).blob)
      ).flat();
      expect(tekst.join(" ")).not.toContain("undefined");
      const naar = selectieResultaat(input, N, { stappen: A.stappen.slice(0, k + 1) }).input.energie
        .label;
      expect(naar).not.toBe("");
      const regel = tekst.find((t) => t.startsWith("Van "))!;
      if (input.energie.soort === "label" || input.energie.soort === "labelOud") {
        expect(regel).toBe("Van label " + input.energie.label + " naar " + naar);
        vanLabel++;
      } else {
        expect(regel).toMatch(
          new RegExp("^Van .+ naar nieuw energielabel " + naar.replace(/\+/g, "\\+") + "$"),
        );
        expect(regel).not.toContain("?");
        vanAnders++;
      }
    }
    expect(vanLabel, "route vanaf een label").toBeGreaterThan(2);
    expect(vanAnders, "route vanaf energie-index of bouwjaar").toBeGreaterThan(2);
  }, 120_000);
});
